import { query } from './db.js';
import { PET_ACCESS } from './profile.js';

// Ventanas de anticipación de los recordatorios (días)
export const PREVENTIVE_WINDOW = 30;
export const APPOINTMENT_WINDOW = 60;
export const FOOD_WINDOW = 7;

// Contacto de la clínica del registro o, si no tiene, de la clínica habitual de la mascota
const CLINIC_COLUMNS = `COALESCE(rp.id, up.id) AS clinic_place_id, COALESCE(rp.name, up.name) AS clinic_name,
  COALESCE(rp.phone, up.phone) AS clinic_phone, COALESCE(rp.whatsapp, up.whatsapp) AS clinic_whatsapp`;

// Solo la aplicación más reciente de cada vacuna/tratamiento cuenta para el próximo refuerzo
const LATEST_PREVENTIVE = (petFilter) => `
  SELECT DISTINCT ON (pc.pet_id, pc.kind, lower(pc.name)) pc.*
  FROM preventive_care pc JOIN pets p ON p.id = pc.pet_id
  WHERE ${petFilter}
  ORDER BY pc.pet_id, pc.kind, lower(pc.name), pc.applied_on DESC, pc.id DESC`;

export async function getReminders(userId, today) {
  const [pets, preventive, appointments, food, medications] = await Promise.all([
    query(`SELECT p.id, p.name, p.species, p.breed, p.birth_date, ph.key AS photo_key FROM pets p
           LEFT JOIN pet_photos ph ON ph.pet_id = p.id WHERE ${PET_ACCESS('$1')} ORDER BY p.name`, [userId]),
    query(
      `SELECT l.id, l.pet_id, l.kind, l.name, l.applied_on, l.next_due, l.validated_at IS NOT NULL AS validated,
              p.name AS pet_name, p.species, ${CLINIC_COLUMNS}
       FROM (${LATEST_PREVENTIVE(PET_ACCESS('$1'))}) l
       JOIN pets p ON p.id = l.pet_id
       LEFT JOIN places rp ON rp.id = COALESCE(l.place_id, l.validated_place_id)
       LEFT JOIN places up ON up.id = p.usual_place_id
       WHERE l.next_due IS NOT NULL AND l.dismissed_at IS NULL AND l.next_due <= $2::date + $3::int
       ORDER BY l.next_due`,
      [userId, today, PREVENTIVE_WINDOW],
    ),
    query(
      `SELECT a.id, a.pet_id, a.scheduled_at, a.reason, COALESCE(rp.name, a.clinic) AS clinic, a.validated_at IS NOT NULL AS validated,
              p.name AS pet_name, p.species, ${CLINIC_COLUMNS}
       FROM appointments a JOIN pets p ON p.id = a.pet_id
       LEFT JOIN places rp ON rp.id = COALESCE(a.place_id, a.validated_place_id)
       LEFT JOIN places up ON up.id = p.usual_place_id
       WHERE ${PET_ACCESS('$1')} AND a.status = 'programada'
         AND a.scheduled_at >= now() - interval '7 days'
         AND a.scheduled_at <= now() + make_interval(days => $2)
       ORDER BY a.scheduled_at`,
      [userId, APPOINTMENT_WINDOW],
    ),
    query(
      `SELECT * FROM (
         SELECT p.id AS pet_id, p.name AS pet_name, p.species, p.food_name,
                p.food_bag_started_on + floor(p.food_bag_kg * 1000 / p.food_daily_g)::int AS runs_out_on
         FROM pets p
         WHERE ${PET_ACCESS('$1')} AND p.food_bag_kg IS NOT NULL AND p.food_daily_g IS NOT NULL AND p.food_bag_started_on IS NOT NULL
       ) f
       WHERE runs_out_on <= $2::date + $3::int
       ORDER BY runs_out_on`,
      [userId, today, FOOD_WINDOW],
    ),
    query(
      `SELECT m.id, m.pet_id, m.name, m.dosage, m.frequency, m.end_date, p.name AS pet_name, p.species
       FROM medications m JOIN pets p ON p.id = m.pet_id
       WHERE ${PET_ACCESS('$1')} AND m.start_date <= $2::date AND (m.end_date IS NULL OR m.end_date >= $2::date)
       ORDER BY m.end_date NULLS LAST, m.name`,
      [userId, today],
    ),
  ]);

  return {
    pets: pets.rows,
    reminders: { preventive: preventive.rows, appointments: appointments.rows, food: food.rows },
    active_medications: medications.rows,
  };
}

// Próximos seguimientos de los pacientes de una clínica (vacunas por vencer y citas)
export async function getClinicFollowUps(placeId, today, days = PREVENTIVE_WINDOW) {
  const linked = `p.id IN (SELECT pet_id FROM clinic_patients WHERE place_id = $1 AND revoked_at IS NULL)`;
  const [preventive, appointments] = await Promise.all([
    query(
      `SELECT l.id, l.pet_id, l.kind, l.name, l.applied_on, l.next_due, l.validated_at IS NOT NULL AS validated,
              p.name AS pet_name, p.species, u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
              CASE WHEN u.whatsapp_opt_in_at IS NOT NULL THEN u.phone END AS owner_phone
       FROM (${LATEST_PREVENTIVE(linked)}) l
       JOIN pets p ON p.id = l.pet_id JOIN users u ON u.id = p.user_id
       WHERE l.next_due IS NOT NULL AND l.dismissed_at IS NULL
         AND l.next_due BETWEEN $2::date - 90 AND $2::date + $3::int
       ORDER BY l.next_due`,
      [placeId, today, days],
    ),
    query(
      `SELECT a.id, a.pet_id, a.scheduled_at, a.reason, a.vet, a.status, p.name AS pet_name, p.species, u.name AS owner_name
       FROM appointments a JOIN pets p ON p.id = a.pet_id JOIN users u ON u.id = p.user_id
       WHERE ${linked} AND (a.place_id = $1 OR a.validated_place_id = $1) AND a.status = 'programada'
         AND a.scheduled_at >= now() - interval '30 days' AND a.scheduled_at <= now() + make_interval(days => $2)
       ORDER BY a.scheduled_at`,
      [placeId, days],
    ),
  ]);
  return { preventive: preventive.rows, appointments: appointments.rows };
}
