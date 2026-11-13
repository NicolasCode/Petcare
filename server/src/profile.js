import { query } from './db.js';
import { listRecords } from './routes/records.js';

// Mascota con su último peso, su foto y su clínica habitual enlazada al directorio
export const PET_SELECT = `
  SELECT p.*, w.weight_kg AS latest_weight, w.measured_on AS latest_weight_on, ph.key AS photo_key,
         up.name AS usual_place_name, up.phone AS usual_place_phone, up.whatsapp AS usual_place_whatsapp,
         up.lat AS usual_place_lat, up.lng AS usual_place_lng
  FROM pets p
  LEFT JOIN LATERAL (
    SELECT weight_kg, measured_on FROM weights
    WHERE pet_id = p.id ORDER BY measured_on DESC, id DESC LIMIT 1
  ) w ON true
  LEFT JOIN pet_photos ph ON ph.pet_id = p.id
  LEFT JOIN places up ON up.id = p.usual_place_id`;

// Condición de acceso: dueño o cuidador. `param` es el marcador del id del usuario ($1, $2…)
export const PET_ACCESS = (param) =>
  `(p.user_id = ${param} OR EXISTS (SELECT 1 FROM pet_caregivers pc WHERE pc.pet_id = p.id AND pc.user_id = ${param}))`;

// Campos que solo ve quien administra la mascota
export function publicPet(pet) {
  const { user_id, emergency_token, emergency_phone, ...rest } = pet;
  return rest;
}

export const RECORD_KEYS = ['preventive', 'allergies', 'medications', 'appointments', 'weights'];

// Perfil 360°: datos de la mascota + toda su historia clínica
export async function getPetProfile(petId) {
  const { rows } = await query(`${PET_SELECT} WHERE p.id = $1`, [petId]);
  if (!rows[0]) return null;
  const [records, reviews] = await Promise.all([
    Promise.all(RECORD_KEYS.map((t) => listRecords(t, petId))),
    query(
      `SELECT r.id, r.appointment_id, r.rating, r.comment, r.reply, r.created_at FROM reviews r
       JOIN appointments a ON a.id = r.appointment_id WHERE a.pet_id = $1`,
      [petId],
    ),
  ]);
  return { pet: rows[0], ...Object.fromEntries(RECORD_KEYS.map((k, i) => [k, records[i]])), reviews: reviews.rows };
}

// Clínicas con acceso activo a la historia de la mascota
export async function petClinics(petId) {
  const { rows } = await query(
    `SELECT cp.id, cp.place_id, cp.via, cp.consented_at, pl.name, pl.kind, pl.phone, pl.whatsapp, pl.address, pl.lat, pl.lng
     FROM clinic_patients cp JOIN places pl ON pl.id = cp.place_id
     WHERE cp.pet_id = $1 AND cp.revoked_at IS NULL ORDER BY cp.consented_at DESC`,
    [petId],
  );
  return rows;
}
