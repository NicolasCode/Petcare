import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { todayIso } from '../validation.js';

const router = Router();

// Ventanas de anticipación de los recordatorios (días)
const PREVENTIVE_WINDOW = 30;
const APPOINTMENT_WINDOW = 60;
const FOOD_WINDOW = 7;

router.get('/', async (req, res) => {
  // El cliente envía su fecha local para que "hoy" coincida con la zona horaria del usuario
  const today = z.iso.date().catch(todayIso()).parse(req.query.today);
  const uid = req.userId;

  const [pets, preventive, appointments, food, medications] = await Promise.all([
    query('SELECT id, name, species, breed, birth_date FROM pets WHERE user_id = $1 ORDER BY name', [uid]),
    // Solo la aplicación más reciente de cada vacuna/tratamiento cuenta para el próximo refuerzo
    query(
      `SELECT * FROM (
         SELECT DISTINCT ON (pc.pet_id, pc.kind, lower(pc.name))
                pc.id, pc.pet_id, pc.kind, pc.name, pc.next_due, p.name AS pet_name, p.species
         FROM preventive_care pc JOIN pets p ON p.id = pc.pet_id
         WHERE p.user_id = $1
         ORDER BY pc.pet_id, pc.kind, lower(pc.name), pc.applied_on DESC, pc.id DESC
       ) latest
       WHERE next_due IS NOT NULL AND next_due <= $2::date + $3::int
       ORDER BY next_due`,
      [uid, today, PREVENTIVE_WINDOW],
    ),
    query(
      `SELECT a.id, a.pet_id, a.scheduled_at, a.reason, a.clinic, p.name AS pet_name, p.species
       FROM appointments a JOIN pets p ON p.id = a.pet_id
       WHERE p.user_id = $1 AND a.status = 'programada'
         AND a.scheduled_at >= now() - interval '1 day'
         AND a.scheduled_at <= now() + make_interval(days => $2)
       ORDER BY a.scheduled_at`,
      [uid, APPOINTMENT_WINDOW],
    ),
    query(
      `SELECT * FROM (
         SELECT id AS pet_id, name AS pet_name, species, food_name,
                food_bag_started_on + floor(food_bag_kg * 1000 / food_daily_g)::int AS runs_out_on
         FROM pets
         WHERE user_id = $1 AND food_bag_kg IS NOT NULL AND food_daily_g IS NOT NULL AND food_bag_started_on IS NOT NULL
       ) f
       WHERE runs_out_on <= $2::date + $3::int
       ORDER BY runs_out_on`,
      [uid, today, FOOD_WINDOW],
    ),
    query(
      `SELECT m.id, m.pet_id, m.name, m.dosage, m.frequency, m.end_date, p.name AS pet_name, p.species
       FROM medications m JOIN pets p ON p.id = m.pet_id
       WHERE p.user_id = $1 AND m.start_date <= $2::date AND (m.end_date IS NULL OR m.end_date >= $2::date)
       ORDER BY m.end_date NULLS LAST, m.name`,
      [uid, today],
    ),
  ]);

  res.json({
    today,
    pets: pets.rows,
    reminders: {
      preventive: preventive.rows,
      appointments: appointments.rows,
      food: food.rows,
    },
    active_medications: medications.rows,
  });
});

export default router;
