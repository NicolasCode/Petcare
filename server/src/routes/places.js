import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { requireAdmin } from '../auth.js';
import { id, insertSql, optText, reqText, updateSql } from '../validation.js';

const router = Router();

export const PLACE_KINDS = ['clinica', 'urgencias', 'farmacia', 'domicilio'];

const placeSchema = z.object({
  name: reqText(150),
  kind: z.enum(PLACE_KINDS, { error: 'Elige un tipo' }),
  address: optText(200),
  locality: optText(80),
  city: reqText(80).default('Bogotá'),
  phone: optText(40),
  whatsapp: optText(40),
  website: optText(200).refine((v) => !v || /^https?:\/\//i.test(v), 'Debe empezar por http:// o https://'),
  open_24h: z.boolean().default(false),
  services: optText(500),
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
  q: z.string().trim().max(100).optional(),
});

// Distancia en km (fórmula de haversine) — no requiere PostGIS
const DISTANCE = `6371 * 2 * asin(sqrt(
  power(sin(radians(lat - $1) / 2), 2) +
  cos(radians($1)) * cos(radians(lat)) * power(sin(radians(lng - $2) / 2), 2)))`;

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
    where.push(`(name ILIKE $${params.length} OR locality ILIKE $${params.length} OR services ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT *, ${hasCoords ? DISTANCE : 'NULL::float'} AS distance_km FROM places
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${hasCoords ? 'distance_km' : 'name'} LIMIT 200`,
    params,
  );
  res.json({ places: rows });
});

router.post('/', requireAdmin, async (req, res) => {
  const data = placeSchema.parse(req.body);
  const { rows } = await query(insertSql('places', data));
  res.status(201).json({ place: rows[0] });
});

router.put('/:placeId', requireAdmin, async (req, res) => {
  const placeId = id.safeParse(req.params.placeId);
  if (!placeId.success) throw notFound('Lugar');
  const data = placeSchema.parse(req.body);
  const { rows } = await query(updateSql('places', { ...data, updated_at: new Date() }, { id: placeId.data }));
  if (!rows[0]) throw notFound('Lugar');
  res.json({ place: rows[0] });
});

router.delete('/:placeId', requireAdmin, async (req, res) => {
  const placeId = id.safeParse(req.params.placeId);
  if (!placeId.success) throw notFound('Lugar');
  const { rowCount } = await query('DELETE FROM places WHERE id = $1', [placeId.data]);
  if (!rowCount) throw notFound('Lugar');
  res.status(204).end();
});

export default router;
