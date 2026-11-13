import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { id, insertSql, optDate, optId, optPositive, optText, reqDate, reqText, updateSql } from '../validation.js';

const dateOrder = (from, to) => (d) => !d[from] || !d[to] || d[to] >= d[from];

// Cada tipo de registro de la historia clínica comparte el mismo CRUD
export const RECORD_TYPES = {
  preventive: {
    table: 'preventive_care',
    hasPlace: true,
    orderBy: 'applied_on DESC, id DESC',
    schema: z
      .object({
        kind: z.enum(['vacuna', 'desparasitacion', 'antipulgas', 'otro'], { error: 'Elige un tipo' }),
        name: reqText(100),
        applied_on: reqDate,
        next_due: optDate,
        lot: optText(60),
        product_expires_on: optDate,
        vet: optText(100),
        vet_card: optText(40),
        place_id: optId,
        notes: optText(1000),
      })
      .refine(dateOrder('applied_on', 'next_due'), { path: ['next_due'], message: 'Debe ser posterior a la fecha de aplicación' }),
  },
  allergies: {
    table: 'allergies',
    orderBy: "CASE severity WHEN 'grave' THEN 0 WHEN 'moderada' THEN 1 ELSE 2 END, allergen",
    schema: z.object({
      allergen: reqText(100),
      severity: z.enum(['leve', 'moderada', 'grave']).default('moderada'),
      reaction: optText(300),
      notes: optText(1000),
    }),
  },
  medications: {
    table: 'medications',
    orderBy: 'start_date DESC, id DESC',
    schema: z
      .object({
        name: reqText(100),
        dosage: optText(100),
        frequency: optText(100),
        start_date: reqDate,
        end_date: optDate,
        prescribed_by: optText(100),
        notes: optText(1000),
      })
      .refine(dateOrder('start_date', 'end_date'), { path: ['end_date'], message: 'Debe ser posterior a la fecha de inicio' }),
  },
  appointments: {
    table: 'appointments',
    hasPlace: true,
    orderBy: 'scheduled_at DESC',
    schema: z.object({
      scheduled_at: z.iso.datetime({ offset: true, error: 'Fecha y hora no válidas' }),
      reason: reqText(150),
      clinic: optText(150),
      place_id: optId,
      vet: optText(100),
      status: z.enum(['programada', 'completada', 'cancelada']).default('programada'),
      diagnosis: optText(2000),
      notes: optText(2000),
    }),
  },
  weights: {
    table: 'weights',
    orderBy: 'measured_on DESC, id DESC',
    schema: z.object({
      measured_on: reqDate.refine((d) => d <= new Date().toISOString().slice(0, 10), 'La fecha no puede ser futura'),
      weight_kg: optPositive(500).refine((v) => v !== null, 'Escribe el peso'),
      notes: optText(500),
    }),
  },
};

// Con el nombre de la clínica enlazada al directorio cuando el registro la tiene
export async function listRecords(type, petId) {
  const { table, orderBy, hasPlace } = RECORD_TYPES[type];
  const sql = hasPlace
    ? `SELECT r.*, pl.name AS place_name FROM (SELECT * FROM ${table} WHERE pet_id = $1) r
       LEFT JOIN places pl ON pl.id = r.place_id ORDER BY ${orderBy}`
    : `SELECT * FROM ${table} WHERE pet_id = $1 ORDER BY ${orderBy}`;
  const { rows } = await query(sql, [petId]);
  return rows;
}

export async function getRecord(type, petId, recordId) {
  const parsed = id.safeParse(recordId);
  if (!parsed.success) throw notFound('Registro');
  const { rows } = await query(`SELECT * FROM ${RECORD_TYPES[type].table} WHERE id = $1 AND pet_id = $2`, [parsed.data, petId]);
  if (!rows[0]) throw notFound('Registro');
  return rows[0];
}

export const isLocked = (record) => record.source === 'clinica' || record.validated_at !== null;

// Un registro que creó o validó una clínica solo lo puede cambiar esa clínica
function assertEditableByCaregiver(record) {
  if (isLocked(record)) {
    throw new HttpError(403, `Este registro lo validó ${record.validated_place_name ?? 'una clínica'}; solo la clínica puede modificarlo.`);
  }
}

// Montado en /api/pets/:petId — req.pet ya fue validado como accesible para el usuario
const router = Router({ mergeParams: true });

router.param('type', (req, res, next, type) => {
  if (!Object.hasOwn(RECORD_TYPES, type)) throw notFound('Recurso');
  req.recordType = RECORD_TYPES[type];
  next();
});

// "Ya no aplica": oculta el recordatorio del refuerzo sin borrar la aplicación
router.post('/preventive/:recordId/dismiss', async (req, res) => {
  const record = await getRecord('preventive', req.pet.id, req.params.recordId);
  const { rows } = await query('UPDATE preventive_care SET dismissed_at = now() WHERE id = $1 RETURNING *', [record.id]);
  res.json({ record: rows[0] });
});

router.delete('/preventive/:recordId/dismiss', async (req, res) => {
  const record = await getRecord('preventive', req.pet.id, req.params.recordId);
  const { rows } = await query('UPDATE preventive_care SET dismissed_at = NULL WHERE id = $1 RETURNING *', [record.id]);
  res.json({ record: rows[0] });
});

// Marcar una cita como atendida o cancelada desde el seguimiento
router.post('/appointments/:recordId/status', async (req, res) => {
  const { status } = z.object({ status: z.enum(['programada', 'completada', 'cancelada']) }).parse(req.body);
  const record = await getRecord('appointments', req.pet.id, req.params.recordId);
  assertEditableByCaregiver(record);
  const { rows } = await query('UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *', [status, record.id]);
  res.json({ record: rows[0] });
});

// Reseña verificable: solo de citas completadas que la clínica registró o validó
router.post('/appointments/:recordId/review', async (req, res) => {
  const data = z.object({ rating: z.number().int().min(1).max(5), comment: optText(1000) }).parse(req.body);
  const appt = await getRecord('appointments', req.pet.id, req.params.recordId);
  if (!appt.validated_place_id) throw new HttpError(403, 'Solo se pueden calificar las consultas que la clínica registró en Kaimi.');
  if (appt.status !== 'completada' || new Date(appt.scheduled_at) > new Date()) {
    throw new HttpError(400, 'Podrás calificar la consulta cuando se haya completado.');
  }
  const { rows } = await query(
    `INSERT INTO reviews (place_id, user_id, appointment_id, rating, comment) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (appointment_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()
       WHERE reviews.user_id = EXCLUDED.user_id
     RETURNING id, appointment_id, rating, comment, reply, created_at`,
    [appt.validated_place_id, req.userId, appt.id, data.rating, data.comment],
  );
  if (!rows[0]) throw new HttpError(403, 'Otra persona ya calificó esta consulta.');
  res.status(201).json({ review: rows[0] });
});

router.get('/:type', async (req, res) => {
  res.json({ records: await listRecords(req.params.type, req.pet.id) });
});

router.post('/:type', async (req, res) => {
  const { table, schema } = req.recordType;
  const data = schema.parse(req.body);
  const { rows } = await query(insertSql(table, data, { pet_id: req.pet.id }));
  res.status(201).json({ record: rows[0] });
});

router.put('/:type/:recordId', async (req, res) => {
  const { table, schema } = req.recordType;
  const record = await getRecord(req.params.type, req.pet.id, req.params.recordId);
  assertEditableByCaregiver(record);
  const data = schema.parse(req.body);
  const { rows } = await query(updateSql(table, data, { id: record.id, pet_id: req.pet.id }));
  res.json({ record: rows[0] });
});

router.delete('/:type/:recordId', async (req, res) => {
  const { table } = req.recordType;
  const record = await getRecord(req.params.type, req.pet.id, req.params.recordId);
  assertEditableByCaregiver(record);
  await query(`DELETE FROM ${table} WHERE id = $1`, [record.id]);
  res.status(204).end();
});

export default router;
