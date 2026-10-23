import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { id, insertSql, optDate, optPositive, optText, reqDate, reqText, updateSql } from '../validation.js';

const dateOrder = (from, to) => (d) => !d[from] || !d[to] || d[to] >= d[from];

// Cada tipo de registro de la historia clínica comparte el mismo CRUD
export const RECORD_TYPES = {
  preventive: {
    table: 'preventive_care',
    orderBy: 'applied_on DESC, id DESC',
    schema: z
      .object({
        kind: z.enum(['vacuna', 'desparasitacion', 'antipulgas', 'otro'], { error: 'Elige un tipo' }),
        name: reqText(100),
        applied_on: reqDate,
        next_due: optDate,
        vet: optText(100),
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
    orderBy: 'scheduled_at DESC',
    schema: z.object({
      scheduled_at: z.iso.datetime({ offset: true, error: 'Fecha y hora no válidas' }),
      reason: reqText(150),
      clinic: optText(150),
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

export async function listRecords(type, petId) {
  const { table, orderBy } = RECORD_TYPES[type];
  const { rows } = await query(`SELECT * FROM ${table} WHERE pet_id = $1 ORDER BY ${orderBy}`, [petId]);
  return rows;
}

// Montado en /api/pets/:petId — req.pet ya fue validado como propiedad del usuario
const router = Router({ mergeParams: true });

router.param('type', (req, res, next, type) => {
  if (!Object.hasOwn(RECORD_TYPES, type)) throw notFound('Recurso');
  req.recordType = RECORD_TYPES[type];
  next();
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
  const recordId = id.safeParse(req.params.recordId);
  if (!recordId.success) throw notFound('Registro');
  const data = schema.parse(req.body);
  const { rows } = await query(updateSql(table, data, { id: recordId.data, pet_id: req.pet.id }));
  if (!rows[0]) throw notFound('Registro');
  res.json({ record: rows[0] });
});

router.delete('/:type/:recordId', async (req, res) => {
  const { table } = req.recordType;
  const recordId = id.safeParse(req.params.recordId);
  if (!recordId.success) throw notFound('Registro');
  const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1 AND pet_id = $2`, [recordId.data, req.pet.id]);
  if (!rowCount) throw notFound('Registro');
  res.status(204).end();
});

export default router;
