import express, { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { renderMail, sendMailSafe } from '../mailer.js';
import { notifyClinic } from '../notify.js';
import { config } from '../config.js';
import { PET_ACCESS, PET_SELECT, getPetProfile, petClinics } from '../profile.js';
import { randomToken } from '../tokens.js';
import { bogotaTodayIso, id, insertSql, optDate, optId, optPositive, optText, reqText, todayIso, updateSql } from '../validation.js';
import recordsRouter from './records.js';
import shareRouter from './share.js';

const router = Router();

export const SPECIES = ['perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otro'];

const petSchema = z.object({
  name: reqText(60),
  species: z.enum(SPECIES, { error: 'Elige una especie' }),
  breed: optText(80),
  sex: z
    .enum(['macho', 'hembra', ''])
    .nullish()
    .transform((v) => v || null),
  birth_date: optDate.refine((v) => !v || v <= todayIso(), 'La fecha no puede ser futura'),
  color: optText(60),
  microchip: optText(40),
  sterilized: z.boolean().default(false),
  usual_clinic: optText(150),
  usual_place_id: optId,
  notes: optText(2000),
  food_name: optText(120),
  food_bag_kg: optPositive(100),
  food_daily_g: optPositive(10000, { int: true }),
  food_bag_started_on: optDate.refine((v) => !v || v <= todayIso(), 'La fecha no puede ser futura'),
});

const email = z.string().trim().toLowerCase().pipe(z.email({ error: 'Correo no válido' }));

// Mascotas propias y las que el usuario cuida como parte de la familia
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT pets.*, CASE WHEN pets.user_id = $1 THEN 'dueno' ELSE 'cuidador' END AS access_role, u.name AS owner_name
     FROM (${PET_SELECT} WHERE ${PET_ACCESS('$1')}) pets JOIN users u ON u.id = pets.user_id
     ORDER BY pets.name`,
    [req.userId],
  );
  res.json({ pets: rows });
});

router.post('/', async (req, res) => {
  const data = petSchema.parse(req.body);
  const { rows } = await query(insertSql('pets', data, { user_id: req.userId }));
  res.status(201).json({ pet: rows[0] });
});

// Verifica que la mascota exista y que el usuario sea su dueño o cuidador antes de cualquier ruta /:petId
router.param('petId', async (req, res, next, value) => {
  const petId = id.safeParse(value);
  if (!petId.success) throw notFound('Mascota');
  const { rows } = await query(`${PET_SELECT} WHERE p.id = $1 AND ${PET_ACCESS('$2')}`, [petId.data, req.userId]);
  if (!rows[0]) throw notFound('Mascota');
  req.pet = rows[0];
  req.isPetOwner = rows[0].user_id === req.userId;
  next();
});

// Compartir, clínicas, cuidadores, emergencia y borrar: solo el dueño
function ownerOnly(req, res, next) {
  if (!req.isPetOwner) throw new HttpError(403, 'Solo el dueño de la mascota puede hacer esto');
  next();
}

const reload = async (petId) => (await query(`${PET_SELECT} WHERE p.id = $1`, [petId])).rows[0];

router.get('/:petId', (req, res) => {
  res.json({ pet: req.pet });
});

router.get('/:petId/profile', async (req, res) => {
  const profile = await getPetProfile(req.pet.id);
  res.json({ ...profile, access_role: req.isPetOwner ? 'dueno' : 'cuidador', clinics: await petClinics(req.pet.id) });
});

router.put('/:petId', async (req, res) => {
  const data = petSchema.parse(req.body);
  await query(updateSql('pets', { ...data, updated_at: new Date() }, { id: req.pet.id }));
  res.json({ pet: await reload(req.pet.id) });
});

// "Compré una bolsa nueva": reinicia el conteo del alimento
router.post('/:petId/food-restock', async (req, res) => {
  const { date } = z.object({ date: z.iso.date().optional() }).parse(req.body ?? {});
  await query('UPDATE pets SET food_bag_started_on = $1, updated_at = now() WHERE id = $2', [date ?? todayIso(), req.pet.id]);
  res.json({ pet: await reload(req.pet.id) });
});

router.delete('/:petId', ownerOnly, async (req, res) => {
  await query('DELETE FROM pets WHERE id = $1', [req.pet.id]);
  res.status(204).end();
});

// ===== Foto =====
// El cliente la reduce a ~512 px antes de subirla; aquí solo se valida el tipo real por sus primeros bytes
const MAGIC = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'],
];

router.put('/:petId/photo', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '600kb' }), async (req, res) => {
  const body = Buffer.isBuffer(req.body) ? req.body : null;
  const mime = body && body.length > 12 ? MAGIC.find(([, test]) => test(body))?.[0] : null;
  if (!mime) throw new HttpError(400, 'La foto debe ser una imagen JPG, PNG o WebP');
  await query(
    `INSERT INTO pet_photos (pet_id, key, mime, data) VALUES ($1, $2, $3, $4)
     ON CONFLICT (pet_id) DO UPDATE SET key = EXCLUDED.key, mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`,
    [req.pet.id, randomToken(16), mime, body],
  );
  res.json({ pet: await reload(req.pet.id) });
});

router.delete('/:petId/photo', async (req, res) => {
  await query('DELETE FROM pet_photos WHERE pet_id = $1', [req.pet.id]);
  res.json({ pet: await reload(req.pet.id) });
});

// ===== Carné: enlace permanente de emergencia (QR) =====
router.put('/:petId/emergency', ownerOnly, async (req, res) => {
  const data = z.object({ enabled: z.boolean(), phone: optText(40), rotate: z.boolean().default(false) }).parse(req.body);
  const token = !data.enabled ? null : data.rotate || !req.pet.emergency_token ? randomToken(18) : req.pet.emergency_token;
  await query('UPDATE pets SET emergency_token = $1, emergency_phone = $2, updated_at = now() WHERE id = $3', [token, data.phone, req.pet.id]);
  res.json({ pet: await reload(req.pet.id) });
});

// ===== Cuidadores (familia) =====
router.get('/:petId/caregivers', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.name, u.email, 'dueno' AS role, NULL::timestamptz AS created_at FROM users u WHERE u.id = $1
     UNION ALL
     SELECT u.id, u.name, u.email, 'cuidador', c.created_at FROM pet_caregivers c JOIN users u ON u.id = c.user_id WHERE c.pet_id = $2
     ORDER BY role DESC, name`,
    [req.pet.user_id, req.pet.id],
  );
  res.json({ caregivers: rows });
});

router.post('/:petId/caregivers', ownerOnly, async (req, res) => {
  const data = z.object({ email }).parse(req.body);
  const { rows } = await query('SELECT id, name, email FROM users WHERE lower(email) = $1', [data.email]);
  const user = rows[0];
  if (!user) {
    return res.status(404).json({
      error: 'Esa persona aún no tiene cuenta en Kaimi',
      fields: { email: 'Aún no tiene cuenta. Pídele que se registre con este correo y vuelve a intentarlo.' },
    });
  }
  if (user.id === req.userId) return res.status(400).json({ error: 'Ya eres el dueño', fields: { email: 'Ese es tu propio correo' } });
  await query('INSERT INTO pet_caregivers (pet_id, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
    req.pet.id,
    user.id,
    req.userId,
  ]);
  const mail = renderMail({
    title: `Ahora cuidas a ${req.pet.name}`,
    lines: [`${req.user.name} te agregó como cuidador de ${req.pet.name} en Kaimi. Verás su historia clínica y sus recordatorios.`],
    action: { label: `Ver a ${req.pet.name}`, url: `${config.appUrl}/mascotas/${req.pet.id}` },
  });
  await sendMailSafe({ to: user.email, subject: `${req.user.name} te agregó como cuidador de ${req.pet.name}`, ...mail });
  res.status(201).json({ caregiver: { user_id: user.id, name: user.name, email: user.email, role: 'cuidador' } });
});

// El dueño quita a un cuidador, o el cuidador deja de cuidar
router.delete('/:petId/caregivers/:userId', async (req, res) => {
  const userId = id.safeParse(req.params.userId);
  if (!userId.success) throw notFound('Cuidador');
  if (!req.isPetOwner && userId.data !== req.userId) throw new HttpError(403, 'Solo el dueño de la mascota puede hacer esto');
  const { rowCount } = await query('DELETE FROM pet_caregivers WHERE pet_id = $1 AND user_id = $2', [req.pet.id, userId.data]);
  if (!rowCount) throw notFound('Cuidador');
  res.status(204).end();
});

// ===== Clínicas con acceso (autorización del dueño, Ley 1581) =====
router.get('/:petId/clinics', async (req, res) => {
  res.json({ clinics: await petClinics(req.pet.id) });
});

router.post('/:petId/clinics', ownerOnly, async (req, res) => {
  const data = z
    .object({
      code: z.string().trim().max(64).optional(),
      place_id: id.optional(),
      consent: z.literal(true, { error: 'Debes autorizar el acceso de la clínica' }),
    })
    .refine((d) => d.code || d.place_id, { path: ['code'], message: 'Indica el código de la clínica' })
    .parse(req.body);
  // Solo clínicas con equipo en Kaimi pueden recibir pacientes
  const { rows } = await query(
    `SELECT pl.id, pl.name FROM places pl
     WHERE ${data.code ? 'pl.intake_code = $1' : 'pl.id = $1'} AND EXISTS (SELECT 1 FROM place_members m WHERE m.place_id = pl.id)`,
    [data.code ?? data.place_id],
  );
  const place = rows[0];
  if (!place) throw new HttpError(404, 'No encontramos una clínica con ese código');
  await query(
    `INSERT INTO clinic_patients (place_id, pet_id, granted_by, via) VALUES ($1, $2, $3, $4)
     ON CONFLICT (place_id, pet_id) WHERE revoked_at IS NULL DO NOTHING`,
    [place.id, req.pet.id, req.userId, data.code ? 'codigo' : 'dueno'],
  );
  // Si aún no tiene clínica habitual, queda esta
  await query('UPDATE pets SET usual_place_id = $1, usual_clinic = $2 WHERE id = $3 AND usual_place_id IS NULL', [place.id, place.name, req.pet.id]);
  res.status(201).json({ clinics: await petClinics(req.pet.id) });
});

router.delete('/:petId/clinics/:placeId', ownerOnly, async (req, res) => {
  const placeId = id.safeParse(req.params.placeId);
  if (!placeId.success) throw notFound('Clínica');
  const { rowCount } = await query('UPDATE clinic_patients SET revoked_at = now() WHERE pet_id = $1 AND place_id = $2 AND revoked_at IS NULL', [
    req.pet.id,
    placeId.data,
  ]);
  if (!rowCount) throw notFound('Clínica');
  res.status(204).end();
});

// ===== Solicitudes de cita a una clínica aliada =====
router.get('/:petId/appointment-requests', async (req, res) => {
  const { rows } = await query(
    `SELECT ar.id, ar.place_id, ar.reason, ar.preferred_date, ar.preferred_time, ar.notes, ar.status, ar.response, ar.created_at,
            pl.name AS place_name, a.scheduled_at
     FROM appointment_requests ar JOIN places pl ON pl.id = ar.place_id LEFT JOIN appointments a ON a.id = ar.appointment_id
     WHERE ar.pet_id = $1 ORDER BY ar.created_at DESC LIMIT 20`,
    [req.pet.id],
  );
  res.json({ requests: rows });
});

// Pedir cita autoriza a la clínica a ver la historia (si aún no tenía acceso, solo el dueño puede darlo)
router.post('/:petId/appointment-requests', async (req, res) => {
  const data = z
    .object({
      place_id: id,
      reason: reqText(150),
      preferred_date: optDate.refine((v) => !v || v >= bogotaTodayIso(), 'Elige una fecha desde hoy'),
      preferred_time: z.enum(['manana', 'tarde', 'cualquiera']).default('cualquiera'),
      notes: optText(500),
      consent: z.boolean().default(false),
    })
    .parse(req.body);
  const { rows: places } = await query(
    `SELECT pl.id, pl.name, EXISTS (SELECT 1 FROM clinic_patients cp WHERE cp.place_id = pl.id AND cp.pet_id = $2 AND cp.revoked_at IS NULL) AS linked
     FROM places pl WHERE pl.id = $1 AND EXISTS (SELECT 1 FROM place_members m WHERE m.place_id = pl.id)`,
    [data.place_id, req.pet.id],
  );
  const place = places[0];
  if (!place) throw new HttpError(404, 'Esta clínica todavía no recibe solicitudes en Kaimi');
  if (!place.linked) {
    if (!req.isPetOwner) throw new HttpError(403, 'Solo el dueño puede autorizar a una clínica nueva');
    if (!data.consent) return res.status(400).json({ error: 'Debes autorizar el acceso de la clínica', fields: { consent: 'Debes autorizar el acceso de la clínica' } });
    await query("INSERT INTO clinic_patients (place_id, pet_id, granted_by, via) VALUES ($1, $2, $3, 'dueno')", [place.id, req.pet.id, req.userId]);
  }
  const { rows: open } = await query("SELECT 1 FROM appointment_requests WHERE place_id = $1 AND pet_id = $2 AND status = 'pendiente'", [place.id, req.pet.id]);
  if (open[0]) throw new HttpError(409, `Ya hay una solicitud pendiente con ${place.name}`);
  const { consent, ...request } = data;
  const { rows } = await query(insertSql('appointment_requests', request, { pet_id: req.pet.id, user_id: req.userId }));
  await notifyClinic(place.id, {
    subject: `Solicitud de cita: ${req.pet.name}`,
    title: `${req.user.name} pide una cita para ${req.pet.name}`,
    lines: [`Motivo: ${data.reason}.`, 'Confírmala con fecha y hora desde el panel de la clínica.'],
    path: `/clinica/${place.id}/citas`,
  });
  res.status(201).json({ request: rows[0] });
});

router.post('/:petId/appointment-requests/:requestId/cancel', async (req, res) => {
  const requestId = id.safeParse(req.params.requestId);
  if (!requestId.success) throw notFound('Solicitud');
  const { rowCount } = await query(
    "UPDATE appointment_requests SET status = 'cancelada', responded_at = now() WHERE id = $1 AND pet_id = $2 AND status = 'pendiente'",
    [requestId.data, req.pet.id],
  );
  if (!rowCount) throw notFound('Solicitud');
  res.status(204).end();
});

router.use('/:petId/share', ownerOnly, shareRouter);
router.use('/:petId', recordsRouter);

export default router;
