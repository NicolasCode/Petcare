import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { notFound } from '../errors.js';
import { optionalAuth, requireAdmin, requireAuth } from '../auth.js';
import { hoursSchema, listHours, openStatus, saveHours } from '../hours.js';
import { PLANS } from '../plans.js';
import { id, insertSql, optText, reqText, updateSql } from '../validation.js';

const router = Router();

export const PLACE_KINDS = ['clinica', 'urgencias', 'farmacia', 'independiente'];

// Campos que la propia clínica puede editar de su perfil
export const placeProfileSchema = z.object({
  name: reqText(150),
  address: optText(200),
  locality: optText(80),
  phone: optText(40),
  whatsapp: optText(40),
  email: optText(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Correo no válido'),
  website: optText(200).refine((v) => !v || /^https?:\/\//i.test(v), 'Debe empezar por http:// o https://'),
  open_24h: z.boolean().default(false),
  home_visits: z.boolean().default(false),
  description: optText(1000),
  services: optText(500),
  specialties: optText(500),
  equipment: optText(500),
});

// El administrador del directorio además define el tipo, la ciudad y la ubicación
const placeSchema = placeProfileSchema.extend({
  kind: z.enum(PLACE_KINDS, { error: 'Elige un tipo' }),
  city: reqText(80).default('Bogotá'),
  lat: z.number({ error: 'Latitud no válida' }).min(-90).max(90),
  lng: z.number({ error: 'Longitud no válida' }).min(-180).max(180),
});

const searchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  kind: z.enum(PLACE_KINDS).optional().catch(undefined),
  open24h: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  openNow: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  q: z.string().trim().max(100).optional(),
});

// Distancia en km (fórmula de haversine) — no requiere PostGIS
const DISTANCE = `6371 * 2 * asin(sqrt(
  power(sin(radians(lat - $1) / 2), 2) +
  cos(radians($1)) * cos(radians(lat)) * power(sin(radians(lng - $2) / 2), 2)))`;

// Calificación solo con reseñas visibles, y si el lugar tiene equipo en Kaimi
const PUBLIC_COLUMNS = `places.id, places.name, places.kind, places.address, places.locality, places.city, places.phone, places.whatsapp,
  places.website, places.email, places.open_24h, places.home_visits, places.description, places.services, places.specialties,
  places.equipment, places.lat, places.lng,
  (SELECT round(avg(rating)::numeric, 1) FROM reviews r WHERE r.place_id = places.id AND r.hidden_at IS NULL) AS rating_avg,
  (SELECT count(*)::int FROM reviews r WHERE r.place_id = places.id AND r.hidden_at IS NULL) AS rating_count,
  EXISTS (SELECT 1 FROM place_members m WHERE m.place_id = places.id) AS on_kaimi`;

async function withStatus(places) {
  const hours = await listHours(places.map((p) => p.id));
  return places.map((p) => {
    const h = hours.get(p.id) ?? [];
    return { ...p, hours: h, status: openStatus(h, p.open_24h) };
  });
}

// Directorio público: se puede consultar sin cuenta (enlaces compartidos, buscadores)
router.get('/', async (req, res) => {
  const s = searchSchema.parse(req.query);
  const hasCoords = s.lat !== undefined && s.lng !== undefined;
  const params = hasCoords ? [s.lat, s.lng] : [];
  const where = [];
  if (s.kind) {
    params.push(s.kind);
    where.push(`kind = $${params.length}`);
  }
  if (s.open24h) where.push('open_24h');
  if (s.q) {
    params.push(`%${s.q.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    where.push(`(name ILIKE ${p} OR locality ILIKE ${p} OR services ILIKE ${p} OR specialties ILIKE ${p} OR equipment ILIKE ${p})`);
  }
  // Orden orgánico: distancia o nombre. Ni el plan ni las reseñas cambian la posición
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, ${hasCoords ? DISTANCE : 'NULL::float'} AS distance_km FROM places
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${hasCoords ? 'distance_km' : 'name'}, id LIMIT 200`,
    params,
  );
  let places = await withStatus(rows);
  if (s.openNow) places = places.filter((p) => p.status.open === true);
  res.json({ places });
});

// Datos de la clínica para la pantalla de vinculación por código (enlace o QR)
router.get('/intake/:code', async (req, res) => {
  const code = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).safeParse(req.params.code);
  if (!code.success) throw notFound('Clínica');
  const { rows } = await query(
    `SELECT id, name, kind, address, locality, city FROM places
     WHERE intake_code = $1 AND EXISTS (SELECT 1 FROM place_members m WHERE m.place_id = places.id)`,
    [code.data],
  );
  if (!rows[0]) throw notFound('Clínica');
  res.json({ place: rows[0] });
});

// Perfil público: horarios, equipo, reseñas verificadas
router.get('/:placeId', optionalAuth, async (req, res) => {
  const placeId = id.safeParse(req.params.placeId);
  if (!placeId.success) throw notFound('Lugar');
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM places WHERE id = $1`, [placeId.data]);
  if (!rows[0]) throw notFound('Lugar');
  const [[place], team, reviews] = await Promise.all([
    withStatus(rows),
    query(
      `SELECT display_name, professional_card, specialty FROM place_members
       WHERE place_id = $1 AND (role = 'vet' OR professional_card IS NOT NULL) ORDER BY display_name`,
      [placeId.data],
    ),
    query(
      `SELECT r.id, r.rating, r.comment, r.reply, r.replied_at, r.created_at, split_part(u.name, ' ', 1) AS author, p.species
       FROM reviews r JOIN users u ON u.id = r.user_id
       JOIN appointments a ON a.id = r.appointment_id JOIN pets p ON p.id = a.pet_id
       WHERE r.place_id = $1 AND r.hidden_at IS NULL ORDER BY r.created_at DESC LIMIT 50`,
      [placeId.data],
    ),
  ]);
  res.json({ place: { ...place, vets: team.rows }, reviews: reviews.rows });
});

// ===== Administración del directorio (ADMIN_EMAILS) =====
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { hours, plan, ...data } = placeSchema.extend({ hours: hoursSchema.optional(), plan: z.enum(Object.keys(PLANS)).optional() }).parse(req.body);
  const place = await withTransaction(async (client) => {
    const { rows } = await client.query(insertSql('places', { ...data, ...(plan ? { plan } : {}) }));
    if (hours) await saveHours(client, rows[0].id, hours);
    return rows[0];
  });
  res.status(201).json({ place });
});

router.put('/:placeId', requireAuth, requireAdmin, async (req, res) => {
  const placeId = id.safeParse(req.params.placeId);
  if (!placeId.success) throw notFound('Lugar');
  const { hours, plan, ...data } = placeSchema.extend({ hours: hoursSchema.optional(), plan: z.enum(Object.keys(PLANS)).optional() }).parse(req.body);
  const place = await withTransaction(async (client) => {
    const { rows } = await client.query(updateSql('places', { ...data, ...(plan ? { plan } : {}), updated_at: new Date() }, { id: placeId.data }));
    if (!rows[0]) throw notFound('Lugar');
    if (hours) await saveHours(client, placeId.data, hours);
    return rows[0];
  });
  res.json({ place });
});

router.delete('/:placeId', requireAuth, requireAdmin, async (req, res) => {
  const placeId = id.safeParse(req.params.placeId);
  if (!placeId.success) throw notFound('Lugar');
  const { rowCount } = await query('DELETE FROM places WHERE id = $1', [placeId.data]);
  if (!rowCount) throw notFound('Lugar');
  res.status(204).end();
});

// Moderación: ocultar una reseña que incumple las normas (no se borra)
router.post('/:placeId/reviews/:reviewId/hide', requireAuth, requireAdmin, async (req, res) => {
  const reviewId = id.safeParse(req.params.reviewId);
  if (!reviewId.success) throw notFound('Reseña');
  const { rowCount } = await query('UPDATE reviews SET hidden_at = now() WHERE id = $1 AND place_id = $2', [reviewId.data, id.catch(0).parse(req.params.placeId)]);
  if (!rowCount) throw notFound('Reseña');
  res.status(204).end();
});

export default router;
