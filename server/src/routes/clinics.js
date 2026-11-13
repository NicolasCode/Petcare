import { Router } from 'express';
import { z } from 'zod';
import { isAdminEmail } from '../config.js';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { hoursSchema, listHours, openStatus, saveHours } from '../hours.js';
import { PLANS, planOf } from '../plans.js';
import { getPetProfile, publicPet } from '../profile.js';
import { getClinicFollowUps } from '../reminders.js';
import { randomToken } from '../tokens.js';
import { bogotaTodayIso, id, insertSql, optText, updateSql } from '../validation.js';
import { placeProfileSchema } from './places.js';
import { RECORD_TYPES, getRecord } from './records.js';

// Herramientas para el equipo de una clínica: /api/clinics/:placeId/...
const router = Router();

const ROLES = ['admin', 'vet', 'staff'];

// Carga la clínica y la membresía del usuario. Un administrador del directorio entra como admin
// para gestionar el perfil y el equipo, pero no puede validar registros clínicos
router.param('placeId', async (req, res, next, value) => {
  const placeId = id.safeParse(value);
  if (!placeId.success) throw notFound('Clínica');
  const [{ rows: places }, { rows: members }] = await Promise.all([
    query('SELECT * FROM places WHERE id = $1', [placeId.data]),
    query('SELECT * FROM place_members WHERE place_id = $1 AND user_id = $2', [placeId.data, req.userId]),
  ]);
  if (!places[0]) throw notFound('Clínica');
  if (members[0]) req.member = members[0];
  else if (isAdminEmail(req.user.email)) req.member = { role: 'admin', user_id: req.userId, display_name: req.user.name, site_admin: true };
  else throw notFound('Clínica');
  req.place = places[0];
  next();
});

const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.member.role)) throw new HttpError(403, 'Tu rol en la clínica no permite esta acción');
    next();
  };

// Registrar o validar historia clínica exige ser veterinario o admin del equipo
function requireClinician(req, res, next) {
  if (req.member.site_admin || !['admin', 'vet'].includes(req.member.role)) {
    throw new HttpError(403, 'Solo los veterinarios de la clínica pueden registrar o validar historia clínica');
  }
  next();
}

// Copia del validador: el registro sigue siendo legible aunque la persona deje la clínica
const stamp = (member, place) => ({
  validated_at: new Date(),
  validated_place_id: place.id,
  validated_place_name: place.name,
  validated_by: member.user_id,
  validated_by_name: member.display_name,
  validated_by_card: member.professional_card ?? null,
});

router.get('/:placeId', async (req, res) => {
  let place = req.place;
  if (!place.intake_code) {
    const { rows } = await query('UPDATE places SET intake_code = $1 WHERE id = $2 RETURNING *', [randomToken(9), place.id]);
    place = rows[0];
  }
  const [hours, counts] = await Promise.all([
    listHours([place.id]),
    query(
      `SELECT (SELECT count(*)::int FROM clinic_patients WHERE place_id = $1 AND revoked_at IS NULL) AS patients,
              (SELECT count(*)::int FROM place_members WHERE place_id = $1) AS members,
              (SELECT count(*)::int FROM reviews WHERE place_id = $1 AND hidden_at IS NULL) AS reviews`,
      [place.id],
    ),
  ]);
  const h = hours.get(place.id) ?? [];
  res.json({
    place: { ...place, hours: h, status: openStatus(h, place.open_24h) },
    member: { role: req.member.role, display_name: req.member.display_name, site_admin: Boolean(req.member.site_admin) },
    counts: counts.rows[0],
    plan: { id: place.plan, ...planOf(place) },
    plans: PLANS,
  });
});

router.put('/:placeId/profile', requireRole('admin'), async (req, res) => {
  const { hours, ...data } = placeProfileSchema.extend({ hours: hoursSchema }).parse(req.body);
  const place = await withTransaction(async (client) => {
    const { rows } = await client.query(updateSql('places', { ...data, updated_at: new Date() }, { id: req.place.id }));
    await saveHours(client, req.place.id, hours);
    return rows[0];
  });
  res.json({ place });
});

// Un código nuevo invalida los QR impresos anteriores
router.post('/:placeId/intake-code', requireRole('admin'), async (req, res) => {
  const { rows } = await query('UPDATE places SET intake_code = $1 WHERE id = $2 RETURNING intake_code', [randomToken(9), req.place.id]);
  res.json({ intake_code: rows[0].intake_code });
});

// ===== Equipo =====
const memberSchema = z.object({
  role: z.enum(ROLES, { error: 'Elige un rol' }),
  display_name: z.string().trim().min(1, 'Escribe el nombre').max(100),
  professional_card: optText(40),
  specialty: optText(100),
});

router.get('/:placeId/members', async (req, res) => {
  const { rows } = await query(
    `SELECT m.id, m.user_id, m.role, m.display_name, m.professional_card, m.specialty, m.created_at, u.email
     FROM place_members m JOIN users u ON u.id = m.user_id WHERE m.place_id = $1 ORDER BY m.role, m.display_name`,
    [req.place.id],
  );
  res.json({ members: rows });
});

router.post('/:placeId/members', requireRole('admin'), async (req, res) => {
  const data = memberSchema.extend({ email: z.string().trim().toLowerCase().pipe(z.email({ error: 'Correo no válido' })) }).parse(req.body);
  const { rows: count } = await query('SELECT count(*)::int AS n FROM place_members WHERE place_id = $1', [req.place.id]);
  const plan = planOf(req.place);
  if (count[0].n >= plan.memberLimit) {
    throw new HttpError(403, `El plan ${plan.label} permite hasta ${plan.memberLimit} personas en el equipo`);
  }
  const { rows: users } = await query('SELECT id FROM users WHERE lower(email) = $1', [data.email]);
  if (!users[0]) {
    return res.status(404).json({
      error: 'Esa persona aún no tiene cuenta en Kaimi',
      fields: { email: 'Aún no tiene cuenta. Pídele que se registre con este correo y vuelve a intentarlo.' },
    });
  }
  const { email, ...member } = data;
  try {
    const { rows } = await query(insertSql('place_members', member, { place_id: req.place.id, user_id: users[0].id }));
    res.status(201).json({ member: { ...rows[0], email } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya hace parte del equipo', fields: { email: 'Ya hace parte del equipo' } });
    throw err;
  }
});

// El admin edita a cualquiera; cada persona puede actualizar su nombre, tarjeta y especialidad
router.put('/:placeId/members/:memberId', async (req, res) => {
  const memberId = id.safeParse(req.params.memberId);
  if (!memberId.success) throw notFound('Persona');
  const { rows } = await query('SELECT * FROM place_members WHERE id = $1 AND place_id = $2', [memberId.data, req.place.id]);
  const target = rows[0];
  if (!target) throw notFound('Persona');
  const isAdmin = req.member.role === 'admin';
  if (!isAdmin && target.user_id !== req.userId) throw new HttpError(403, 'Tu rol en la clínica no permite esta acción');
  const data = memberSchema.parse({ role: target.role, ...req.body });
  if (!isAdmin) data.role = target.role;
  if (target.role === 'admin' && data.role !== 'admin') await assertAnotherAdmin(req.place.id, target.id);
  const { rows: updated } = await query(updateSql('place_members', data, { id: target.id }));
  res.json({ member: updated[0] });
});

router.delete('/:placeId/members/:memberId', requireRole('admin'), async (req, res) => {
  const memberId = id.safeParse(req.params.memberId);
  if (!memberId.success) throw notFound('Persona');
  const { rows } = await query('SELECT * FROM place_members WHERE id = $1 AND place_id = $2', [memberId.data, req.place.id]);
  if (!rows[0]) throw notFound('Persona');
  if (rows[0].role === 'admin') await assertAnotherAdmin(req.place.id, rows[0].id);
  await query('DELETE FROM place_members WHERE id = $1', [rows[0].id]);
  res.status(204).end();
});

async function assertAnotherAdmin(placeId, exceptId) {
  const { rows } = await query("SELECT 1 FROM place_members WHERE place_id = $1 AND role = 'admin' AND id <> $2", [placeId, exceptId]);
  if (!rows[0]) throw new HttpError(400, 'La clínica debe tener al menos un administrador');
}

// ===== Pacientes =====
router.get('/:placeId/patients', async (req, res) => {
  const q = z.string().trim().max(100).optional().catch(undefined).parse(req.query.q);
  const params = [req.place.id];
  let filter = '';
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    filter = `AND (p.name ILIKE $2 OR u.name ILIKE $2 OR p.microchip ILIKE $2)`;
  }
  const { rows } = await query(
    `SELECT p.id, p.name, p.species, p.breed, p.birth_date, ph.key AS photo_key, u.name AS owner_name, cp.consented_at, cp.via,
            (SELECT max(scheduled_at) FROM appointments a WHERE a.pet_id = p.id AND a.status = 'completada'
               AND (a.place_id = $1 OR a.validated_place_id = $1)) AS last_visit,
            (SELECT min(next_due) FROM (
               SELECT DISTINCT ON (kind, lower(name)) next_due, dismissed_at FROM preventive_care
               WHERE pet_id = p.id ORDER BY kind, lower(name), applied_on DESC, id DESC) l
             WHERE l.next_due IS NOT NULL AND l.dismissed_at IS NULL) AS next_due,
            EXISTS (SELECT 1 FROM allergies al WHERE al.pet_id = p.id AND al.severity = 'grave') AS severe_allergy
     FROM clinic_patients cp JOIN pets p ON p.id = cp.pet_id JOIN users u ON u.id = p.user_id
     LEFT JOIN pet_photos ph ON ph.pet_id = p.id
     WHERE cp.place_id = $1 AND cp.revoked_at IS NULL ${filter}
     ORDER BY p.name LIMIT 500`,
    params,
  );
  const today = bogotaTodayIso();
  res.json({ patients: rows.map((r) => ({ ...r, overdue: r.next_due !== null && r.next_due < today })) });
});

// Solo pacientes con autorización vigente del dueño
router.param('petId', async (req, res, next, value) => {
  const petId = id.safeParse(value);
  if (!petId.success) throw notFound('Paciente');
  const { rows } = await query(
    `SELECT cp.consented_at, cp.via, u.name AS owner_name, u.email AS owner_email
     FROM clinic_patients cp JOIN pets p ON p.id = cp.pet_id JOIN users u ON u.id = p.user_id
     WHERE cp.place_id = $1 AND cp.pet_id = $2 AND cp.revoked_at IS NULL`,
    [req.place.id, petId.data],
  );
  if (!rows[0]) throw notFound('Paciente');
  req.patientId = petId.data;
  req.patientLink = rows[0];
  next();
});

router.get('/:placeId/patients/:petId', async (req, res) => {
  const { pet, ...records } = await getPetProfile(req.patientId);
  // La clínica ve el nombre y el correo del dueño para hacer seguimiento (así se informa al autorizar)
  res.json({ pet: publicPet(pet), ...records, link: req.patientLink });
});

router.param('type', (req, res, next, type) => {
  if (!Object.hasOwn(RECORD_TYPES, type)) throw notFound('Recurso');
  req.recordType = RECORD_TYPES[type];
  next();
});

// Registro hecho por la clínica: queda validado por quien lo registra
router.post('/:placeId/patients/:petId/:type', requireClinician, async (req, res) => {
  const { table, schema } = req.recordType;
  const data = schema.parse(req.body);
  if ('place_id' in data && !data.place_id) data.place_id = req.place.id;
  const { rows } = await query(insertSql(table, { ...data, source: 'clinica', ...stamp(req.member, req.place) }, { pet_id: req.patientId }));
  res.status(201).json({ record: rows[0] });
});

// Solo se corrigen los registros que validó esta misma clínica
router.put('/:placeId/patients/:petId/:type/:recordId', requireClinician, async (req, res) => {
  const { table, schema } = req.recordType;
  const record = await getRecord(req.params.type, req.patientId, req.params.recordId);
  if (record.validated_place_id !== req.place.id) throw new HttpError(403, 'Solo puedes corregir registros validados por tu clínica');
  const data = schema.parse(req.body);
  const { rows } = await query(updateSql(table, { ...data, ...stamp(req.member, req.place) }, { id: record.id }));
  res.json({ record: rows[0] });
});

// Validar un registro que ingresó el cuidador (por ejemplo, con el carné físico a la vista)
router.post('/:placeId/patients/:petId/:type/:recordId/validate', requireClinician, async (req, res) => {
  const { table } = req.recordType;
  const record = await getRecord(req.params.type, req.patientId, req.params.recordId);
  if (record.validated_at) throw new HttpError(409, `Este registro ya fue validado por ${record.validated_place_name}`);
  const { rows } = await query(updateSql(table, stamp(req.member, req.place), { id: record.id }));
  res.json({ record: rows[0] });
});

// ===== Seguimientos y reseñas =====
router.get('/:placeId/follow-ups', async (req, res) => {
  const days = z.coerce.number().int().min(1).max(120).catch(30).parse(req.query.days);
  res.json(await getClinicFollowUps(req.place.id, bogotaTodayIso(), days));
});

router.get('/:placeId/reviews', async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.rating, r.comment, r.reply, r.replied_at, r.created_at, r.hidden_at, split_part(u.name, ' ', 1) AS author, p.name AS pet_name
     FROM reviews r JOIN users u ON u.id = r.user_id JOIN appointments a ON a.id = r.appointment_id JOIN pets p ON p.id = a.pet_id
     WHERE r.place_id = $1 ORDER BY r.created_at DESC`,
    [req.place.id],
  );
  res.json({ reviews: rows });
});

router.post('/:placeId/reviews/:reviewId/reply', requireRole('admin', 'vet'), async (req, res) => {
  const reviewId = id.safeParse(req.params.reviewId);
  if (!reviewId.success) throw notFound('Reseña');
  const { reply } = z.object({ reply: optText(1000) }).parse(req.body);
  const { rows } = await query(
    'UPDATE reviews SET reply = $1, replied_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END WHERE id = $2 AND place_id = $3 RETURNING *',
    [reply, reviewId.data, req.place.id],
  );
  if (!rows[0]) throw notFound('Reseña');
  res.json({ review: rows[0] });
});

export default router;
