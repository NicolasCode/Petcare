import { query } from './db.js';
import { listRecords } from './routes/records.js';

// Mascota con su último peso registrado
export const PET_SELECT = `
  SELECT p.*, w.weight_kg AS latest_weight, w.measured_on AS latest_weight_on
  FROM pets p
  LEFT JOIN LATERAL (
    SELECT weight_kg, measured_on FROM weights
    WHERE pet_id = p.id ORDER BY measured_on DESC, id DESC LIMIT 1
  ) w ON true`;

// Perfil 360°: datos de la mascota + toda su historia clínica
export async function getPetProfile(petId) {
  const { rows } = await query(`${PET_SELECT} WHERE p.id = $1`, [petId]);
  if (!rows[0]) return null;
  const [preventive, allergies, medications, appointments, weights] = await Promise.all(
    ['preventive', 'allergies', 'medications', 'appointments', 'weights'].map((t) => listRecords(t, petId)),
  );
  return { pet: rows[0], preventive, allergies, medications, appointments, weights };
}
