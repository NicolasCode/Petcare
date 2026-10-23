// Datos de DEMOSTRACIÓN: una cuenta con mascotas e historia clínica y lugares ficticios en el mapa.
// Las fechas son relativas a hoy para que siempre haya recordatorios visibles.
// Volver a ejecutarlo reinicia la cuenta demo (borra lo que se haya cambiado en ella).
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { insertSql } from './validation.js';

export const DEMO_EMAIL = 'demo@kurapet.co';

const day = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * day).toISOString().slice(0, 10);
const daysFromNow = (n) => daysAgo(-n);
// Cita a una hora fija de Bogotá (UTC-5)
const at = (n, hour) => `${daysFromNow(n)}T${String(hour + 5).padStart(2, '0')}:00:00Z`;

const PLACES = [
  ['Clínica Veterinaria Demo Chicó', 'clinica', 'Chapinero', 'Cra. 11 #93-00', 4.6765, -74.048, false, 'Consulta general, vacunación, dermatología'],
  ['Urgencias Veterinarias Demo 24h Norte', 'urgencias', 'Usaquén', 'Cl. 127 #15-00', 4.711, -74.03, true, 'Urgencias, hospitalización, cirugía, laboratorio'],
  ['Farmacia Veterinaria Demo Cedritos', 'farmacia', 'Usaquén', 'Cl. 140 #11-00', 4.723, -74.041, false, 'Medicamentos, alimento medicado, antiparasitarios'],
  ['Hospital Veterinario Demo Teusaquillo', 'urgencias', 'Teusaquillo', 'Cl. 39 #19-00', 4.637, -74.078, true, 'Urgencias 24 h, imágenes diagnósticas, UCI'],
  ['Veterinario a Domicilio Demo Suba', 'domicilio', 'Suba', null, 4.742, -74.084, false, 'Consulta y vacunación a domicilio'],
  ['Clínica Veterinaria Demo Kennedy', 'clinica', 'Kennedy', 'Av. 1 de Mayo #70-00', 4.629, -74.154, false, 'Consulta general, esterilización'],
  ['Clínica Felina Demo Galerías', 'clinica', 'Teusaquillo', 'Cl. 53 #25-00', 4.643, -74.074, false, 'Medicina felina, odontología'],
  ['Farmacia Veterinaria Demo Chapinero', 'farmacia', 'Chapinero', 'Cra. 13 #57-00', 4.643, -74.064, false, 'Medicamentos con fórmula, suplementos'],
];

const PETS = [
  {
    pet: {
      name: 'Timothy',
      species: 'perro',
      breed: 'Golden Retriever',
      sex: 'macho',
      birth_date: daysAgo(4 * 365 + 40),
      color: 'Dorado',
      microchip: '985112003456789',
      sterilized: true,
      usual_clinic: 'Clínica Veterinaria Demo Chicó',
      notes: 'Se pone nervioso con las motos. Le gusta que lo premien con zanahoria.',
      food_name: 'Alimento Premium Adulto Raza Grande',
      food_bag_kg: 15,
      food_daily_g: 450,
      food_bag_started_on: daysAgo(29), // se acaba en ~4 días
    },
    allergies: [{ allergen: 'Cefalexina', severity: 'grave', reaction: 'Urticaria y vómito' }],
    preventive: [
      { kind: 'vacuna', name: 'Rabia', applied_on: daysAgo(340), next_due: daysFromNow(25), vet: 'Clínica Veterinaria Demo Chicó' },
      { kind: 'vacuna', name: 'Séxtuple (polivalente)', applied_on: daysAgo(60), next_due: daysFromNow(305), vet: 'Clínica Veterinaria Demo Chicó' },
      { kind: 'desparasitacion', name: 'Desparasitación interna', applied_on: daysAgo(85), next_due: daysFromNow(5) },
      { kind: 'antipulgas', name: 'Pipeta antipulgas', applied_on: daysAgo(35), next_due: daysAgo(5) }, // vencida
    ],
    medications: [
      { name: 'Omeprazol', dosage: '20 mg', frequency: 'Cada 24 horas en ayunas', start_date: daysAgo(5), end_date: daysFromNow(9), prescribed_by: 'Dra. Demo' },
    ],
    appointments: [
      {
        scheduled_at: at(3, 10),
        reason: 'Control dermatológico',
        clinic: 'Clínica Veterinaria Demo Chicó',
        vet: 'Dra. Demo',
        status: 'programada',
      },
      {
        scheduled_at: at(-60, 9),
        reason: 'Vacunación anual',
        clinic: 'Clínica Veterinaria Demo Chicó',
        vet: 'Dra. Demo',
        status: 'completada',
        diagnosis: 'Paciente sano. Se aplica séxtuple. Leve dermatitis en abdomen: control en 2 meses.',
      },
    ],
    weights: [
      [540, 24.0],
      [420, 27.5],
      [300, 29.8],
      [180, 30.6],
      [90, 31.2],
      [3, 31.5],
    ],
  },
  {
    pet: {
      name: 'Luna',
      species: 'gato',
      breed: 'Criolla',
      sex: 'hembra',
      birth_date: daysAgo(2 * 365 + 100),
      color: 'Atigrada gris',
      sterilized: true,
      usual_clinic: 'Clínica Felina Demo Galerías',
      food_name: 'Alimento Gato Adulto Esterilizado',
      food_bag_kg: 3,
      food_daily_g: 60,
      food_bag_started_on: daysAgo(10),
    },
    allergies: [],
    preventive: [
      { kind: 'vacuna', name: 'Triple felina', applied_on: daysAgo(90), next_due: daysFromNow(275), vet: 'Clínica Felina Demo Galerías' },
      { kind: 'vacuna', name: 'Leucemia felina', applied_on: daysAgo(90), next_due: daysFromNow(275), vet: 'Clínica Felina Demo Galerías' },
      { kind: 'desparasitacion', name: 'Desparasitación interna', applied_on: daysAgo(20), next_due: daysFromNow(70) },
    ],
    medications: [],
    appointments: [
      {
        scheduled_at: at(-365, 8),
        reason: 'Esterilización',
        clinic: 'Clínica Felina Demo Galerías',
        status: 'completada',
        diagnosis: 'Ovariohisterectomía sin complicaciones. Retiro de puntos a los 10 días.',
      },
    ],
    weights: [
      [500, 3.1],
      [330, 3.6],
      [150, 3.9],
      [15, 4.1],
    ],
  },
];

export async function seedDemo({ password = process.env.DEMO_PASSWORD || 'kurapet-demo' } = {}) {
  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [name, kind, locality, address, lat, lng, open24h, services] of PLACES) {
      await client.query(
        `INSERT INTO places (name, kind, locality, address, phone, open_24h, services, lat, lng)
         SELECT $1, $2, $3, $4, '601 000 0000', $5, $6, $7, $8
         WHERE NOT EXISTS (SELECT 1 FROM places WHERE name = $1)`,
        [name, kind, locality, address, open24h, services, lat, lng],
      );
    }

    // Reinicia la cuenta demo (el borrado en cascada elimina sus mascotas e historia)
    await client.query('DELETE FROM users WHERE lower(email) = $1', [DEMO_EMAIL]);
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, consent_at) VALUES ('Nico Demo', $1, $2, now()) RETURNING id`,
      [DEMO_EMAIL, hash],
    );
    const userId = rows[0].id;

    for (const { pet, allergies, preventive, medications, appointments, weights } of PETS) {
      const { rows: petRows } = await client.query(insertSql('pets', pet, { user_id: userId }));
      const pet_id = petRows[0].id;
      const records = [
        ['allergies', allergies],
        ['preventive_care', preventive],
        ['medications', medications],
        ['appointments', appointments],
        ['weights', weights.map(([ago, weight_kg]) => ({ measured_on: daysAgo(ago), weight_kg }))],
      ];
      for (const [table, list] of records) {
        for (const record of list) await client.query(insertSql(table, record, { pet_id }));
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { email: DEMO_EMAIL, password, places: PLACES.length, pets: PETS.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  const r = await seedDemo();
  console.log(`Demo lista: ${r.pets} mascotas, ${r.places} lugares. Ingresa con ${r.email} / ${r.password}`);
  await pool.end();
}
