// Datos de DEMOSTRACIÓN: una cuenta con mascotas e historia clínica y lugares ficticios en el mapa.
// Las fechas son relativas a hoy para que siempre haya recordatorios visibles.
// Volver a ejecutarlo reinicia la cuenta demo (borra lo que se haya cambiado en ella).
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { saveHours } from './hours.js';
import { migrate } from './migrate.js';
import { randomToken } from './tokens.js';
import { insertSql } from './validation.js';

export const DEMO_EMAIL = 'demo@kaimi.co';
// Veterinaria de la clínica demo: muestra el panel de clínica
export const DEMO_CLINIC_EMAIL = 'clinica@kaimi.co';
// Otra dueña ficticia (sin acceso de un clic) para que la clínica tenga más de un paciente
const DEMO_OTHER_EMAIL = 'laura.demo@kaimi.co';
const DEMO_CLINIC = 'Clínica Veterinaria Demo Chicó';

const day = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * day).toISOString().slice(0, 10);
const daysFromNow = (n) => daysAgo(-n);
// Cita a una hora fija de Bogotá (UTC-5)
const at = (n, hour) => `${daysFromNow(n)}T${String(hour + 5).padStart(2, '0')}:00:00Z`;

const PLACES = [
  [DEMO_CLINIC, 'clinica', 'Chapinero', 'Cra. 11 #93-00', 4.6765, -74.048, false, 'Consulta general, vacunación, dermatología'],
  ['Urgencias Veterinarias Demo 24h Norte', 'urgencias', 'Usaquén', 'Cl. 127 #15-00', 4.711, -74.03, true, 'Urgencias, hospitalización, cirugía, laboratorio'],
  ['Farmacia Veterinaria Demo Cedritos', 'farmacia', 'Usaquén', 'Cl. 140 #11-00', 4.723, -74.041, false, 'Medicamentos, alimento medicado, antiparasitarios'],
  ['Hospital Veterinario Demo Teusaquillo', 'urgencias', 'Teusaquillo', 'Cl. 39 #19-00', 4.637, -74.078, true, 'Urgencias 24 h, imágenes diagnósticas, UCI'],
  ['Veterinario a Domicilio Demo Suba', 'independiente', 'Suba', null, 4.742, -74.084, false, 'Consulta y vacunación a domicilio'],
  ['Clínica Veterinaria Demo Kennedy', 'clinica', 'Kennedy', 'Av. 1 de Mayo #70-00', 4.629, -74.154, false, 'Consulta general, esterilización'],
  ['Clínica Felina Demo Galerías', 'clinica', 'Teusaquillo', 'Cl. 53 #25-00', 4.643, -74.074, false, 'Medicina felina, odontología'],
  ['Farmacia Veterinaria Demo Chapinero', 'farmacia', 'Chapinero', 'Cra. 13 #57-00', 4.643, -74.064, false, 'Medicamentos con fórmula, suplementos'],
];

// Horario semanal (0 = domingo) de los lugares que no abren 24 horas
const WEEKDAYS = [1, 2, 3, 4, 5];
const hours = (days, opens, closes) => days.map((weekday) => ({ weekday, opens, closes }));
const PLACE_HOURS = {
  [DEMO_CLINIC]: [...hours(WEEKDAYS, '08:00', '19:00'), ...hours([6], '09:00', '14:00')],
  'Farmacia Veterinaria Demo Cedritos': hours([0, 1, 2, 3, 4, 5, 6], '07:00', '21:00'),
  'Veterinario a Domicilio Demo Suba': [...hours(WEEKDAYS, '09:00', '12:00'), ...hours(WEEKDAYS, '14:00', '18:00')],
  'Clínica Veterinaria Demo Kennedy': [...hours(WEEKDAYS, '08:00', '18:00'), ...hours([6], '08:00', '13:00')],
  'Clínica Felina Demo Galerías': hours([1, 2, 3, 4, 5, 6], '09:00', '18:00'),
  'Farmacia Veterinaria Demo Chapinero': hours([1, 2, 3, 4, 5, 6], '08:00', '20:00'),
};
const PLACE_PROFILE = {
  [DEMO_CLINIC]: {
    description: 'Clínica de barrio con 15 años de experiencia. Atendemos perros y gatos con cita o por orden de llegada.',
    specialties: 'Dermatología, Medicina interna, Odontología',
    equipment: 'Rayos X digital, Ecógrafo, Laboratorio clínico',
    whatsapp: '300 000 0000',
  },
  'Veterinario a Domicilio Demo Suba': { home_visits: true, specialties: 'Medicina general, Vacunación' },
  'Hospital Veterinario Demo Teusaquillo': { specialties: 'Cirugía, Cuidados intensivos, Cardiología', equipment: 'UCI, Tomografía, Rayos X, Ecógrafo' },
};

// Lo que la clínica demo registró o validó de Timothy (cuenta como historia validada)
const VALIDATOR = { display_name: 'Dra. Demo Rodríguez', professional_card: 'TP 00000-DEMO' };

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
      { kind: 'vacuna', name: 'Rabia', applied_on: daysAgo(340), next_due: daysFromNow(25), vet: 'Dr. Ejemplo', lot: 'RB-2291' },
      {
        kind: 'vacuna',
        name: 'Séxtuple (polivalente)',
        applied_on: daysAgo(60),
        next_due: daysFromNow(305),
        vet: VALIDATOR.display_name,
        vet_card: VALIDATOR.professional_card,
        lot: 'SX-48817',
        product_expires_on: daysFromNow(200),
        clinic_record: true,
      },
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
        clinic: DEMO_CLINIC,
        vet: VALIDATOR.display_name,
        status: 'programada',
        clinic_record: true,
      },
      {
        scheduled_at: at(-60, 9),
        reason: 'Vacunación anual',
        clinic: DEMO_CLINIC,
        vet: VALIDATOR.display_name,
        status: 'completada',
        diagnosis: 'Paciente sano. Se aplica séxtuple. Leve dermatitis en abdomen: control en 2 meses.',
        clinic_record: true,
        review: { rating: 5, comment: 'Muy amables con Timothy, que se pone nervioso. Explicaron todo con calma.' },
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

// Segundo paciente de la clínica demo, de otra dueña ficticia, con un refuerzo vencido
const OTHER_PET = {
  pet: { name: 'Rocky', species: 'perro', breed: 'Criollo', sex: 'macho', birth_date: daysAgo(6 * 365), sterilized: true },
  preventive: [{ kind: 'vacuna', name: 'Rabia', applied_on: daysAgo(380), next_due: daysAgo(15), clinic_record: true }],
  appointments: [
    {
      scheduled_at: at(-200, 15),
      reason: 'Consulta por cojera',
      clinic: DEMO_CLINIC,
      vet: VALIDATOR.display_name,
      status: 'completada',
      diagnosis: 'Esguince leve. Reposo y antiinflamatorio por 5 días.',
      clinic_record: true,
      review: { rating: 4, comment: 'Buena atención, aunque esperamos un rato. Rocky se recuperó perfecto.' },
    },
  ],
};

async function insertPet(client, userId, { pet, allergies = [], preventive = [], medications = [], appointments = [], weights = [] }, clinic) {
  // Con clínica demo, queda enlazada como clínica habitual
  const extra = clinic ? { usual_place_id: clinic.id, usual_clinic: clinic.name } : {};
  const { rows: petRows } = await client.query(insertSql('pets', { ...pet, ...extra }, { user_id: userId }));
  const pet_id = petRows[0].id;
  // Lo marcado con clinic_record lo registró la clínica demo y queda validado por su veterinaria
  const stamp = (r) => {
    const { clinic_record, review, ...record } = r;
    if (!clinic_record || !clinic) return record;
    return {
      ...record,
      place_id: clinic.id,
      source: 'clinica',
      validated_at: new Date(),
      validated_place_id: clinic.id,
      validated_place_name: clinic.name,
      validated_by: clinic.vetUserId,
      validated_by_name: VALIDATOR.display_name,
      validated_by_card: VALIDATOR.professional_card,
    };
  };
  const records = [
    ['allergies', allergies],
    ['preventive_care', preventive.map(stamp)],
    ['medications', medications],
    ['weights', weights.map(([ago, weight_kg]) => ({ measured_on: daysAgo(ago), weight_kg }))],
  ];
  for (const [table, list] of records) {
    for (const record of list) await client.query(insertSql(table, record, { pet_id }));
  }
  for (const appt of appointments) {
    const { rows } = await client.query(insertSql('appointments', stamp(appt), { pet_id }));
    if (appt.review && clinic) {
      await client.query('INSERT INTO reviews (place_id, user_id, appointment_id, rating, comment) VALUES ($1, $2, $3, $4, $5)', [
        clinic.id,
        userId,
        rows[0].id,
        appt.review.rating,
        appt.review.comment,
      ]);
    }
  }
  return pet_id;
}

export async function seedDemo({ password = process.env.DEMO_PASSWORD || 'kaimi-demo' } = {}) {
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
      const { rows } = await client.query('SELECT id FROM places WHERE name = $1', [name]);
      const profile = PLACE_PROFILE[name] ?? {};
      await client.query(
        `UPDATE places SET kind = $2, description = $3, specialties = $4, equipment = $5, whatsapp = COALESCE($6, whatsapp), home_visits = $7
         WHERE id = $1`,
        [rows[0].id, kind, profile.description ?? null, profile.specialties ?? null, profile.equipment ?? null, profile.whatsapp ?? null, Boolean(profile.home_visits)],
      );
      await saveHours(client, rows[0].id, PLACE_HOURS[name] ?? []);
    }

    // Reinicia las cuentas demo (el borrado en cascada elimina mascotas, historia, equipo y reseñas)
    // También borra la cuenta demo anterior al cambio de marca (demo@kurapet.co)
    await client.query("DELETE FROM users WHERE lower(email) IN ($1, $2, $3, 'demo@kurapet.co')", [DEMO_EMAIL, DEMO_CLINIC_EMAIL, DEMO_OTHER_EMAIL]);
    const createUser = async (name, email) =>
      (
        await client.query(
          `INSERT INTO users (name, email, password_hash, consent_at, email_verified_at) VALUES ($1, $2, $3, now(), now()) RETURNING id`,
          [name, email, hash],
        )
      ).rows[0].id;
    const userId = await createUser('Nico Demo', DEMO_EMAIL);
    const vetUserId = await createUser(VALIDATOR.display_name, DEMO_CLINIC_EMAIL);
    const otherUserId = await createUser('Laura Demo', DEMO_OTHER_EMAIL);

    const { rows: clinicRows } = await client.query('SELECT id, name FROM places WHERE name = $1', [DEMO_CLINIC]);
    const clinic = { ...clinicRows[0], vetUserId };
    await client.query('UPDATE places SET intake_code = COALESCE(intake_code, $2) WHERE id = $1', [clinic.id, randomToken(9)]);
    await client.query(insertSql('place_members', { place_id: clinic.id, user_id: vetUserId, role: 'admin', ...VALIDATOR, specialty: 'Dermatología' }));

    for (const data of PETS) {
      const petId = await insertPet(client, userId, data, data.pet.usual_clinic === DEMO_CLINIC ? clinic : null);
      if (data.pet.usual_clinic === DEMO_CLINIC) {
        await client.query("INSERT INTO clinic_patients (place_id, pet_id, granted_by, via) VALUES ($1, $2, $3, 'codigo')", [clinic.id, petId, userId]);
        await client.query('UPDATE pets SET emergency_token = $1 WHERE id = $2', [randomToken(18), petId]);
      }
    }
    const rockyId = await insertPet(client, otherUserId, OTHER_PET, clinic);
    await client.query("INSERT INTO clinic_patients (place_id, pet_id, granted_by, via) VALUES ($1, $2, $3, 'dueno')", [clinic.id, rockyId, otherUserId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { email: DEMO_EMAIL, clinicEmail: DEMO_CLINIC_EMAIL, password, places: PLACES.length, pets: PETS.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  const r = await seedDemo();
  console.log(`Demo lista: ${r.pets} mascotas, ${r.places} lugares. Dueño: ${r.email} · Clínica: ${r.clinicEmail} · Contraseña: ${r.password}`);
  await pool.end();
}
