import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { PET_SELECT, getPetProfile } from '../profile.js';
import { id, insertSql, optDate, optPositive, optText, reqText, todayIso, updateSql } from '../validation.js';
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
  notes: optText(2000),
  food_name: optText(120),
  food_bag_kg: optPositive(100),
  food_daily_g: optPositive(10000, { int: true }),
  food_bag_started_on: optDate.refine((v) => !v || v <= todayIso(), 'La fecha no puede ser futura'),
});

router.get('/', async (req, res) => {
  const { rows } = await query(`${PET_SELECT} WHERE p.user_id = $1 ORDER BY p.name`, [req.userId]);
  res.json({ pets: rows });
});

router.post('/', async (req, res) => {
  const data = petSchema.parse(req.body);
  const { rows } = await query(insertSql('pets', data, { user_id: req.userId }));
  res.status(201).json({ pet: rows[0] });
});

// Verifica que la mascota exista y pertenezca al usuario antes de cualquier ruta /:petId
router.param('petId', async (req, res, next, value) => {
  const petId = id.safeParse(value);
  if (!petId.success) throw notFound('Mascota');
  const { rows } = await query(`${PET_SELECT} WHERE p.id = $1 AND p.user_id = $2`, [petId.data, req.userId]);
  if (!rows[0]) throw notFound('Mascota');
  req.pet = rows[0];
  next();
});

router.get('/:petId', (req, res) => {
  res.json({ pet: req.pet });
});

router.get('/:petId/profile', async (req, res) => {
  res.json(await getPetProfile(req.pet.id));
});

router.put('/:petId', async (req, res) => {
  const data = petSchema.parse(req.body);
  await query(updateSql('pets', { ...data, updated_at: new Date() }, { id: req.pet.id }));
  const { rows } = await query(`${PET_SELECT} WHERE p.id = $1`, [req.pet.id]);
  res.json({ pet: rows[0] });
});

// "Compré una bolsa nueva": reinicia el conteo del alimento
router.post('/:petId/food-restock', async (req, res) => {
  const { date } = z.object({ date: z.iso.date().optional() }).parse(req.body ?? {});
  await query('UPDATE pets SET food_bag_started_on = $1, updated_at = now() WHERE id = $2', [date ?? todayIso(), req.pet.id]);
  const { rows } = await query(`${PET_SELECT} WHERE p.id = $1`, [req.pet.id]);
  res.json({ pet: rows[0] });
});

router.delete('/:petId', async (req, res) => {
  await query('DELETE FROM pets WHERE id = $1', [req.pet.id]);
  res.status(204).end();
});

router.use('/:petId/share', shareRouter);
router.use('/:petId', recordsRouter);

export default router;
