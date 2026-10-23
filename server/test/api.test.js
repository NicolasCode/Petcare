import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/kurapet_test';
process.env.ADMIN_EMAILS = 'admin@kurapet.test';

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');

const app = createApp();
const today = new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function signup(email, name = 'Ana') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'clave-segura-1', consent: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return agent;
}

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
});

after(() => pool.end());

describe('autenticación', () => {
  test('exige autorización de datos al registrarse', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'x@x.co', password: 'clave-segura-1' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.consent);
  });

  test('registro, sesión, login y correo duplicado', async () => {
    const agent = await signup('Ana@Correo.co');
    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.user.email, 'ana@correo.co');
    assert.equal(me.body.user.is_admin, false);

    const dup = await request(app).post('/api/auth/register').send({ name: 'B', email: 'ana@correo.co', password: 'clave-segura-1', consent: true });
    assert.equal(dup.status, 409);

    const bad = await request(app).post('/api/auth/login').send({ email: 'ana@correo.co', password: 'otra-clave' });
    assert.equal(bad.status, 401);
    const ok = await request(app).post('/api/auth/login').send({ email: 'ANA@correo.co', password: 'clave-segura-1' });
    assert.equal(ok.status, 200);
  });

  test('rutas privadas sin sesión devuelven 401', async () => {
    assert.equal((await request(app).get('/api/pets')).status, 401);
  });
});

describe('mascotas e historia clínica', () => {
  let owner;
  let other;
  let petId;

  before(async () => {
    owner = await signup('dueno@kurapet.test');
    other = await signup('otro@kurapet.test');
  });

  test('crea una mascota y valida los datos', async () => {
    const bad = await owner.post('/api/pets').send({ name: '', species: 'dragon' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.name && bad.body.fields.species);

    const res = await owner.post('/api/pets').send({
      name: 'Timothy',
      species: 'perro',
      breed: 'Golden Retriever',
      sex: 'macho',
      birth_date: '2022-03-10',
      sterilized: true,
      usual_clinic: '',
      food_name: 'Alimento Premium',
      food_bag_kg: 15,
      food_daily_g: 450,
      food_bag_started_on: addDays(-30),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.pet.usual_clinic, null);
    assert.equal(res.body.pet.birth_date, '2022-03-10');
    petId = res.body.pet.id;
  });

  test('otro usuario no puede ver ni modificar la mascota', async () => {
    assert.equal((await other.get(`/api/pets/${petId}`)).status, 404);
    assert.equal((await other.post(`/api/pets/${petId}/weights`).send({ measured_on: today, weight_kg: 1 })).status, 404);
    assert.equal((await other.get('/api/pets')).body.pets.length, 0);
  });

  test('registra peso, alergias, vacunas, medicamentos y citas', async () => {
    let res = await owner.post(`/api/pets/${petId}/weights`).send({ measured_on: today, weight_kg: 31.5 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    res = await owner.post(`/api/pets/${petId}/allergies`).send({ allergen: 'Cefalexina', severity: 'grave' });
    assert.equal(res.status, 201);

    // Rabia vencida hace un año, renovada hoy: solo cuenta la más reciente
    res = await owner.post(`/api/pets/${petId}/preventive`).send({ kind: 'vacuna', name: 'Rabia', applied_on: addDays(-400), next_due: addDays(-35) });
    assert.equal(res.status, 201);
    res = await owner.post(`/api/pets/${petId}/preventive`).send({ kind: 'vacuna', name: 'rabia', applied_on: today, next_due: addDays(365) });
    assert.equal(res.status, 201);
    res = await owner.post(`/api/pets/${petId}/preventive`).send({ kind: 'desparasitacion', name: 'Desparasitación interna', applied_on: addDays(-80), next_due: addDays(10) });
    assert.equal(res.status, 201);

    res = await owner.post(`/api/pets/${petId}/preventive`).send({ kind: 'vacuna', name: 'X', applied_on: today, next_due: addDays(-1) });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.next_due);

    res = await owner.post(`/api/pets/${petId}/medications`).send({ name: 'Omeprazol', dosage: '10 mg', start_date: addDays(-2), end_date: addDays(5) });
    assert.equal(res.status, 201);
    res = await owner.post(`/api/pets/${petId}/appointments`).send({
      scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      reason: 'Control anual',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const profile = await owner.get(`/api/pets/${petId}/profile`);
    assert.equal(profile.body.pet.latest_weight, 31.5);
    assert.equal(profile.body.allergies[0].allergen, 'Cefalexina');
    assert.equal(profile.body.preventive.length, 3);
  });

  test('el tablero muestra los recordatorios correctos', async () => {
    const res = await owner.get(`/api/dashboard?today=${today}`);
    assert.equal(res.status, 200);
    const { preventive, appointments, food } = res.body.reminders;
    assert.deepEqual(preventive.map((p) => p.name), ['Desparasitación interna']);
    assert.equal(appointments.length, 1);
    assert.equal(food.length, 1); // 15 kg / 450 g ≈ 33 días, empezó hace 30
    assert.equal(res.body.active_medications.length, 1);

    await owner.post(`/api/pets/${petId}/food-restock`).send({});
    const after = await owner.get(`/api/dashboard?today=${today}`);
    assert.equal(after.body.reminders.food.length, 0);
  });

  test('edita y elimina registros', async () => {
    const { body } = await owner.get(`/api/pets/${petId}/medications`);
    const med = body.records[0];
    const upd = await owner.put(`/api/pets/${petId}/medications/${med.id}`).send({ ...med, dosage: '20 mg' });
    assert.equal(upd.body.record.dosage, '20 mg');
    assert.equal((await owner.delete(`/api/pets/${petId}/medications/${med.id}`)).status, 204);
    assert.equal((await owner.delete(`/api/pets/${petId}/medications/${med.id}`)).status, 404);
    assert.equal((await owner.get(`/api/pets/${petId}/inventado`)).status, 404);
  });

  test('enlace para el veterinario: acceso, expiración y revocación', async () => {
    const created = await owner.post(`/api/pets/${petId}/share`).send({ days: 7 });
    assert.equal(created.status, 201);
    const { token, id } = created.body.link;

    const shared = await request(app).get(`/api/shared/${token}`);
    assert.equal(shared.status, 200);
    assert.equal(shared.body.pet.name, 'Timothy');
    assert.equal(shared.body.pet.user_id, undefined);
    assert.equal(shared.body.owner_name, 'Ana');
    assert.equal(shared.body.allergies[0].allergen, 'Cefalexina');

    assert.equal((await other.delete(`/api/pets/${petId}/share/${id}`)).status, 404);
    assert.equal((await owner.delete(`/api/pets/${petId}/share/${id}`)).status, 204);
    assert.equal((await request(app).get(`/api/shared/${token}`)).status, 404);
    assert.equal((await request(app).get('/api/shared/no-existe-este-token-123')).status, 404);
  });

  test('eliminar la mascota borra su historia', async () => {
    assert.equal((await owner.delete(`/api/pets/${petId}`)).status, 204);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM weights WHERE pet_id = $1', [petId]);
    assert.equal(rows[0].n, 0);
  });
});

describe('directorio de lugares', () => {
  test('solo administradores gestionan; todos buscan por cercanía', async () => {
    const user = await signup('vecino@kurapet.test');
    const admin = await signup('admin@kurapet.test', 'Admin');
    assert.equal((await admin.get('/api/auth/me')).body.user.is_admin, true);

    const place = { name: 'Clínica Norte', kind: 'urgencias', open_24h: true, lat: 4.711, lng: -74.03 };
    assert.equal((await user.post('/api/places').send(place)).status, 403);
    assert.equal((await admin.post('/api/places').send(place)).status, 201);
    assert.equal((await admin.post('/api/places').send({ name: 'Farmacia Sur', kind: 'farmacia', lat: 4.58, lng: -74.1 })).status, 201);

    const near = await user.get('/api/places?lat=4.6&lng=-74.1');
    assert.deepEqual(near.body.places.map((p) => p.name), ['Farmacia Sur', 'Clínica Norte']);
    assert.ok(near.body.places[0].distance_km < 3);

    const h24 = await user.get('/api/places?open24h=true');
    assert.deepEqual(h24.body.places.map((p) => p.name), ['Clínica Norte']);
    const search = await user.get('/api/places?q=farm');
    assert.equal(search.body.places.length, 1);
  });
});

describe('datos de demostración', () => {
  test('crea la cuenta demo con recordatorios y se puede reiniciar', async () => {
    const { seedDemo } = await import('../src/seed-demo.js');
    await seedDemo({ password: 'demo-1234' });
    await seedDemo({ password: 'demo-1234' }); // idempotente

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'demo@kurapet.co', password: 'demo-1234' });
    assert.equal(login.status, 200);

    const { body } = await agent.get(`/api/dashboard?today=${today}`);
    assert.deepEqual(body.pets.map((p) => p.name), ['Luna', 'Timothy']);
    assert.equal(body.reminders.food.length, 1);
    assert.equal(body.reminders.appointments.length, 1);
    assert.deepEqual(body.reminders.preventive.map((p) => p.name).sort(), ['Desparasitación interna', 'Pipeta antipulgas', 'Rabia']);
    assert.equal(body.active_medications.length, 1);

    const places = await agent.get('/api/places?lat=4.68&lng=-74.05');
    assert.ok(places.body.places.length >= 8);
  });

  test('acceso de un clic a la demo solo con SEED_DEMO=true', async () => {
    delete process.env.SEED_DEMO;
    assert.deepEqual((await request(app).get('/api/auth/demo')).body, { enabled: false });
    assert.equal((await request(app).post('/api/auth/demo')).status, 404);

    process.env.SEED_DEMO = 'true';
    try {
      const info = await request(app).get('/api/auth/demo');
      assert.equal(info.body.email, 'demo@kurapet.co');
      const agent = request.agent(app);
      const res = await agent.post('/api/auth/demo');
      assert.equal(res.status, 200);
      assert.equal((await agent.get('/api/pets')).body.pets.length, 2);
    } finally {
      delete process.env.SEED_DEMO;
    }
  });
});
