import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/kaimi_test';
process.env.ADMIN_EMAILS = 'admin@kaimi.test';

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { testOutbox } = await import('../src/mailer.js');
const { openStatus } = await import('../src/hours.js');
const { digestItems, runDailyDigest } = await import('../src/notifications.js');

const app = createApp();
const today = new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const lastMailTo = (email) => testOutbox.filter((m) => m.to === email).at(-1);
const tokenFrom = (mail, path) => mail.text.match(new RegExp(`/${path}/([A-Za-z0-9_-]+)`))[1];

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

describe('cuenta: verificación y recuperación de contraseña', () => {
  test('verifica el correo con el enlace enviado al registrarse', async () => {
    const agent = await signup('verifica@kaimi.test');
    assert.equal((await agent.get('/api/auth/me')).body.user.email_verified, false);
    const token = tokenFrom(lastMailTo('verifica@kaimi.test'), 'verificar');
    assert.equal((await request(app).post('/api/auth/verify').send({ token })).status, 204);
    assert.equal((await request(app).post('/api/auth/verify').send({ token })).status, 400); // un solo uso
    assert.equal((await agent.get('/api/auth/me')).body.user.email_verified, true);
  });

  test('restablecer la contraseña cierra las sesiones anteriores', async () => {
    const oldSession = await signup('olvido@kaimi.test');
    const unknown = await request(app).post('/api/auth/forgot').send({ email: 'nadie@kaimi.test' });
    assert.equal(unknown.status, 204); // no revela si el correo existe
    assert.equal((await request(app).post('/api/auth/forgot').send({ email: 'OLVIDO@kaimi.test' })).status, 204);
    const token = tokenFrom(lastMailTo('olvido@kaimi.test'), 'restablecer');

    assert.equal((await request(app).post('/api/auth/reset').send({ token, password: 'corta' })).status, 400);
    const fresh = request.agent(app);
    const reset = await fresh.post('/api/auth/reset').send({ token, password: 'clave-nueva-123' });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.user.email_verified, true);
    assert.equal((await fresh.get('/api/auth/me')).status, 200);
    assert.equal((await oldSession.get('/api/auth/me')).status, 401);
    assert.equal((await request(app).post('/api/auth/reset').send({ token, password: 'otra-clave-123' })).status, 400);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'olvido@kaimi.test', password: 'clave-nueva-123' })).status, 200);
  });

  test('cambiar la contraseña exige la actual', async () => {
    const agent = await signup('cambio@kaimi.test');
    const bad = await agent.put('/api/auth/me/password').send({ current: 'mala', password: 'clave-nueva-123' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.current);
    assert.equal((await agent.put('/api/auth/me/password').send({ current: 'clave-segura-1', password: 'clave-nueva-123' })).status, 204);
    assert.equal((await agent.get('/api/auth/me')).status, 200); // la sesión actual se renueva
  });
});

describe('mascotas: foto, carné de emergencia y cuidadores', () => {
  let owner;
  let family;
  let petId;

  before(async () => {
    owner = await signup('carne@kaimi.test', 'Carla Pérez');
    family = await signup('familia@kaimi.test', 'Pablo');
    petId = (await owner.post('/api/pets').send({ name: 'Mota', species: 'gato' })).body.pet.id;
  });

  test('sube una foto validando el tipo real del archivo', async () => {
    const fake = await owner.put(`/api/pets/${petId}/photo`).set('Content-Type', 'image/png').send(Buffer.from('no soy una imagen, solo texto'));
    assert.equal(fake.status, 400);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    const res = await owner.put(`/api/pets/${petId}/photo`).set('Content-Type', 'image/png').send(png);
    assert.equal(res.status, 200);
    const key = res.body.pet.photo_key;
    const photo = await request(app).get(`/api/photos/${key}`);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers['content-type'], 'image/png');
    assert.match(photo.headers['cache-control'], /immutable/);
  });

  test('el enlace de emergencia muestra solo lo indispensable y se puede revocar', async () => {
    await owner.post(`/api/pets/${petId}/allergies`).send({ allergen: 'Pollo', severity: 'grave' });
    const on = await owner.put(`/api/pets/${petId}/emergency`).send({ enabled: true, phone: '300 123 4567' });
    const token = on.body.pet.emergency_token;
    assert.ok(token);
    const pub = await request(app).get(`/api/emergency/${token}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.pet.name, 'Mota');
    assert.equal(pub.body.owner_first_name, 'Carla');
    assert.equal(pub.body.emergency_phone, '300 123 4567');
    assert.equal(pub.body.allergies[0].allergen, 'Pollo');
    assert.equal(pub.body.pet.user_id, undefined);

    const rotated = await owner.put(`/api/pets/${petId}/emergency`).send({ enabled: true, rotate: true });
    assert.notEqual(rotated.body.pet.emergency_token, token);
    assert.equal((await request(app).get(`/api/emergency/${token}`)).status, 404);
    await owner.put(`/api/pets/${petId}/emergency`).send({ enabled: false });
    assert.equal((await request(app).get(`/api/emergency/${rotated.body.pet.emergency_token}`)).status, 404);
  });

  test('un cuidador ve y registra, pero no borra ni comparte', async () => {
    assert.equal((await family.get(`/api/pets/${petId}`)).status, 404);
    const missing = await owner.post(`/api/pets/${petId}/caregivers`).send({ email: 'sin-cuenta@kaimi.test' });
    assert.equal(missing.status, 404);
    assert.ok(missing.body.fields.email);
    assert.equal((await owner.post(`/api/pets/${petId}/caregivers`).send({ email: 'familia@kaimi.test' })).status, 201);
    assert.match(lastMailTo('familia@kaimi.test').subject, /cuidador de Mota/);

    const list = await family.get('/api/pets');
    assert.equal(list.body.pets[0].access_role, 'cuidador');
    assert.equal(list.body.pets[0].owner_name, 'Carla Pérez');
    assert.equal((await family.post(`/api/pets/${petId}/weights`).send({ measured_on: today, weight_kg: 4 })).status, 201);
    assert.equal((await family.get(`/api/dashboard?today=${today}`)).body.pets.length, 1);
    assert.equal((await family.delete(`/api/pets/${petId}`)).status, 403);
    assert.equal((await family.post(`/api/pets/${petId}/share`).send({ days: 1 })).status, 403);

    const me = (await family.get('/api/auth/me')).body.user;
    assert.equal((await family.delete(`/api/pets/${petId}/caregivers/${me.id}`)).status, 204);
    assert.equal((await family.get(`/api/pets/${petId}`)).status, 404);
  });
});

describe('clínicas: equipo, pacientes y registros validados', () => {
  let admin;
  let vet;
  let staff;
  let owner;
  let stranger;
  let placeId;
  let petId;
  let code;

  before(async () => {
    admin = await signup('admin@kaimi.test', 'Admin');
    vet = await signup('vet@kaimi.test', 'Valentina Vet');
    staff = await signup('recepcion@kaimi.test', 'Rita');
    owner = await signup('dueno2@kaimi.test', 'Diego');
    stranger = await signup('extrano@kaimi.test', 'Ernesto');
    const place = await admin.post('/api/places').send({
      name: 'Clínica Aliada',
      kind: 'clinica',
      lat: 4.68,
      lng: -74.05,
      hours: [{ weekday: 1, opens: '08:00', closes: '18:00' }],
    });
    assert.equal(place.status, 201, JSON.stringify(place.body));
    placeId = place.body.place.id;
    petId = (await owner.post('/api/pets').send({ name: 'Bruno', species: 'perro' })).body.pet.id;
  });

  test('el admin del directorio arma el equipo; nadie más ve la clínica', async () => {
    assert.equal((await vet.get(`/api/clinics/${placeId}`)).status, 404);
    const add = await admin
      .post(`/api/clinics/${placeId}/members`)
      .send({ email: 'vet@kaimi.test', role: 'admin', display_name: 'Dra. Valentina', professional_card: 'TP 12345' });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    assert.equal((await vet.post(`/api/clinics/${placeId}/members`).send({ email: 'recepcion@kaimi.test', role: 'staff', display_name: 'Rita' })).status, 201);
    assert.equal((await vet.post(`/api/clinics/${placeId}/members`).send({ email: 'recepcion@kaimi.test', role: 'staff', display_name: 'Rita' })).status, 409);

    const me = await vet.get('/api/auth/me');
    assert.deepEqual(me.body.user.clinics.map((c) => [c.name, c.role]), [['Clínica Aliada', 'admin']]);
    const info = await vet.get(`/api/clinics/${placeId}`);
    assert.equal(info.status, 200);
    assert.equal(info.body.plan.id, 'gratis');
    code = info.body.place.intake_code;
    assert.ok(code);
    assert.equal((await stranger.get(`/api/clinics/${placeId}`)).status, 404);
    assert.equal((await staff.put(`/api/clinics/${placeId}/profile`).send({ name: 'X', hours: [] })).status, 403);

    // No se puede quedar sin administrador
    const members = (await vet.get(`/api/clinics/${placeId}/members`)).body.members;
    const vetMember = members.find((m) => m.email === 'vet@kaimi.test');
    assert.equal((await vet.delete(`/api/clinics/${placeId}/members/${vetMember.id}`)).status, 400);
  });

  test('la clínica edita su perfil y su horario', async () => {
    const res = await vet.put(`/api/clinics/${placeId}/profile`).send({
      name: 'Clínica Aliada',
      specialties: 'Dermatología, Cardiología',
      equipment: 'Rayos X',
      hours: [
        { weekday: 1, opens: '08:00', closes: '18:00' },
        { weekday: 6, opens: '22:00', closes: '02:00' },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const pub = await request(app).get(`/api/places/${placeId}`);
    assert.equal(pub.body.place.specialties, 'Dermatología, Cardiología');
    assert.equal(pub.body.place.hours.length, 2);
    assert.equal(pub.body.place.on_kaimi, true);
    assert.equal(pub.body.place.intake_code, undefined);
    assert.equal(pub.body.place.plan, undefined);
    assert.deepEqual(pub.body.place.vets.map((v) => v.display_name), ['Dra. Valentina']);
  });

  test('el dueño vincula a su mascota con el código y la clínica la ve', async () => {
    assert.equal((await vet.get(`/api/clinics/${placeId}/patients/${petId}`)).status, 404);
    const intake = await request(app).get(`/api/places/intake/${code}`);
    assert.equal(intake.body.place.name, 'Clínica Aliada');
    assert.equal((await owner.post(`/api/pets/${petId}/clinics`).send({ code })).status, 400); // sin autorización
    const link = await owner.post(`/api/pets/${petId}/clinics`).send({ code, consent: true });
    assert.equal(link.status, 201, JSON.stringify(link.body));
    assert.equal(link.body.clinics[0].name, 'Clínica Aliada');
    assert.equal((await owner.get(`/api/pets/${petId}`)).body.pet.usual_place_id, placeId);

    const patients = await staff.get(`/api/clinics/${placeId}/patients`);
    assert.deepEqual(patients.body.patients.map((p) => p.name), ['Bruno']);
    const profile = await staff.get(`/api/clinics/${placeId}/patients/${petId}`);
    assert.equal(profile.body.link.owner_name, 'Diego');
    assert.equal(profile.body.pet.user_id, undefined);
  });

  test('registros de la clínica quedan validados y bloqueados para el dueño', async () => {
    const byStaff = await staff.post(`/api/clinics/${placeId}/patients/${petId}/preventive`).send({ kind: 'vacuna', name: 'Rabia', applied_on: today });
    assert.equal(byStaff.status, 403); // recepción no valida historia clínica

    const created = await vet.post(`/api/clinics/${placeId}/patients/${petId}/preventive`).send({
      kind: 'vacuna',
      name: 'Rabia',
      applied_on: addDays(-365),
      next_due: addDays(5),
      lot: 'L-778',
      product_expires_on: addDays(100),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const rec = created.body.record;
    assert.equal(rec.source, 'clinica');
    assert.equal(rec.place_id, placeId);
    assert.equal(rec.validated_by_name, 'Dra. Valentina');
    assert.equal(rec.validated_by_card, 'TP 12345');
    assert.equal(rec.lot, 'L-778');

    const edit = await owner.put(`/api/pets/${petId}/preventive/${rec.id}`).send({ kind: 'vacuna', name: 'Otra', applied_on: today });
    assert.equal(edit.status, 403);
    assert.match(edit.body.error, /Clínica Aliada/);
    assert.equal((await owner.delete(`/api/pets/${petId}/preventive/${rec.id}`)).status, 403);

    // El dueño registra algo y la clínica lo valida
    const own = await owner.post(`/api/pets/${petId}/weights`).send({ measured_on: today, weight_kg: 20 });
    assert.equal(own.body.record.source, 'cuidador');
    const validated = await vet.post(`/api/clinics/${placeId}/patients/${petId}/weights/${own.body.record.id}/validate`);
    assert.equal(validated.status, 200);
    assert.ok(validated.body.record.validated_at);
    assert.equal((await vet.post(`/api/clinics/${placeId}/patients/${petId}/weights/${own.body.record.id}/validate`)).status, 409);
    assert.equal((await owner.delete(`/api/pets/${petId}/weights/${own.body.record.id}`)).status, 403);

    const follow = await vet.get(`/api/clinics/${placeId}/follow-ups`);
    assert.deepEqual(follow.body.preventive.map((p) => [p.pet_name, p.name, p.owner_name]), [['Bruno', 'Rabia', 'Diego']]);
  });

  test('reseña verificable solo de consultas que la clínica registró', async () => {
    const ownAppt = await owner.post(`/api/pets/${petId}/appointments`).send({
      scheduled_at: new Date(Date.now() - 86400000).toISOString(),
      reason: 'Consulta inventada',
      place_id: placeId,
      status: 'completada',
    });
    assert.equal((await owner.post(`/api/pets/${petId}/appointments/${ownAppt.body.record.id}/review`).send({ rating: 5 })).status, 403);

    const clinicAppt = await vet.post(`/api/clinics/${placeId}/patients/${petId}/appointments`).send({
      scheduled_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      reason: 'Control',
      status: 'completada',
    });
    const review = await owner.post(`/api/pets/${petId}/appointments/${clinicAppt.body.record.id}/review`).send({ rating: 4, comment: 'Muy bien' });
    assert.equal(review.status, 201, JSON.stringify(review.body));
    assert.equal((await owner.post(`/api/pets/${petId}/appointments/${clinicAppt.body.record.id}/review`).send({ rating: 5 })).status, 201);

    const reviews = await vet.get(`/api/clinics/${placeId}/reviews`);
    assert.equal(reviews.body.reviews.length, 1);
    assert.equal((await vet.post(`/api/clinics/${placeId}/reviews/${reviews.body.reviews[0].id}/reply`).send({ reply: '¡Gracias!' })).status, 200);

    const pub = await request(app).get(`/api/places/${placeId}`);
    assert.equal(pub.body.place.rating_avg, 5);
    assert.equal(pub.body.reviews[0].reply, '¡Gracias!');
    assert.equal(pub.body.reviews[0].author, 'Diego');
  });

  test('al revocar la autorización la clínica pierde el acceso', async () => {
    assert.equal((await owner.delete(`/api/pets/${petId}/clinics/${placeId}`)).status, 204);
    assert.equal((await vet.get(`/api/clinics/${placeId}/patients/${petId}`)).status, 404);
    assert.equal((await vet.get(`/api/clinics/${placeId}/patients`)).body.patients.length, 0);
    // La historia validada se conserva para el dueño
    const profile = await owner.get(`/api/pets/${petId}/profile`);
    assert.equal(profile.body.preventive[0].validated_place_name, 'Clínica Aliada');
    assert.equal(profile.body.clinics.length, 0);
  });
});

describe('directorio público y modelo freemium', () => {
  test('se consulta sin cuenta y el plan no cambia el orden', async () => {
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email: 'admin@kaimi.test', password: 'clave-segura-1' });
    const near = await admin.post('/api/places').send({ name: 'Cerca Gratis', kind: 'clinica', lat: 4.6001, lng: -74.1 });
    const far = await admin.post('/api/places').send({ name: 'Lejos Pro', kind: 'clinica', lat: 4.7, lng: -74.0, plan: 'pro' });
    assert.equal(far.status, 201);

    const res = await request(app).get('/api/places?lat=4.6&lng=-74.1&kind=clinica');
    assert.equal(res.status, 200);
    const names = res.body.places.map((p) => p.name);
    assert.ok(names.indexOf('Cerca Gratis') < names.indexOf('Lejos Pro'));
    assert.ok(res.body.places.every((p) => p.plan === undefined && p.intake_code === undefined));
    assert.equal(res.body.places.find((p) => p.id === near.body.place.id).status.open, null); // sin horario: no se afirma nada
  });

  test('filtra por especialidad y por "abierto ahora"', async () => {
    const bySpecialty = await request(app).get('/api/places?q=cardio');
    assert.deepEqual(bySpecialty.body.places.map((p) => p.name), ['Clínica Aliada']);
    const open = await request(app).get('/api/places?openNow=true');
    assert.ok(open.body.places.every((p) => p.status.open === true));
  });

  test('el plan gratis limita el tamaño del equipo, no la visibilidad', async () => {
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email: 'admin@kaimi.test', password: 'clave-segura-1' });
    const place = (await admin.post('/api/places').send({ name: 'Equipo Grande', kind: 'clinica', lat: 4.6, lng: -74.1 })).body.place;
    for (let i = 0; i < 5; i++) {
      await signup(`equipo${i}@kaimi.test`);
      const r = await admin.post(`/api/clinics/${place.id}/members`).send({ email: `equipo${i}@kaimi.test`, role: 'staff', display_name: `P${i}` });
      assert.equal(r.status, 201);
    }
    await signup('equipo5@kaimi.test');
    const over = await admin.post(`/api/clinics/${place.id}/members`).send({ email: 'equipo5@kaimi.test', role: 'staff', display_name: 'P5' });
    assert.equal(over.status, 403);
    assert.match(over.body.error, /Gratis/);
  });
});

describe('horarios', () => {
  // Fechas en UTC; Bogotá es UTC-5. 2026-11-16 es lunes
  const at = (iso) => new Date(iso);
  const weekdays = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: '08:00', closes: '18:00' }));

  test('abierto, cerrado y próxima apertura en hora de Colombia', () => {
    assert.deepEqual(openStatus(weekdays, false, at('2026-11-16T14:00:00Z')), { open: true, closes_at: '18:00', opens_at: null }); // lun 9:00
    const night = openStatus(weekdays, false, at('2026-11-17T00:30:00Z')); // lun 19:30
    assert.equal(night.open, false);
    assert.deepEqual(night.opens_at, { weekday: 2, time: '08:00', in_days: 1 });
    const saturday = openStatus(weekdays, false, at('2026-11-21T15:00:00Z')); // sáb 10:00
    assert.deepEqual(saturday.opens_at, { weekday: 1, time: '08:00', in_days: 2 });
  });

  test('franjas que cruzan la medianoche, 24 horas y sin horario', () => {
    const overnight = [{ weekday: 5, opens: '20:00', closes: '02:00' }];
    assert.equal(openStatus(overnight, false, at('2026-11-21T06:00:00Z')).open, true); // sáb 1:00
    assert.equal(openStatus(overnight, false, at('2026-11-21T08:00:00Z')).open, false); // sáb 3:00
    assert.equal(openStatus([], true).open, true);
    assert.equal(openStatus([], false).open, null);
  });
});

describe('seguimiento y notificaciones', () => {
  let owner;
  let petId;

  before(async () => {
    owner = await signup('avisos@kaimi.test', 'Valeria');
    petId = (await owner.post('/api/pets').send({ name: 'Nube', species: 'gato' })).body.pet.id;
  });

  test('"ya no aplica" oculta el recordatorio hasta la siguiente aplicación', async () => {
    const rec = (await owner.post(`/api/pets/${petId}/preventive`).send({ kind: 'antipulgas', name: 'Pipeta', applied_on: addDays(-40), next_due: addDays(-10) })).body.record;
    const dash = async () => (await owner.get(`/api/dashboard?today=${today}`)).body.reminders.preventive.map((p) => p.name);
    assert.deepEqual(await dash(), ['Pipeta']);
    assert.equal((await owner.post(`/api/pets/${petId}/preventive/${rec.id}/dismiss`)).status, 200);
    assert.deepEqual(await dash(), []);
    await owner.post(`/api/pets/${petId}/preventive`).send({ kind: 'antipulgas', name: 'Pipeta', applied_on: today, next_due: addDays(7) });
    assert.deepEqual(await dash(), ['Pipeta']);
  });

  test('marcar una cita como atendida la quita de los pendientes', async () => {
    const appt = (await owner.post(`/api/pets/${petId}/appointments`).send({ scheduled_at: new Date(Date.now() - 3600000).toISOString(), reason: 'Control' })).body.record;
    assert.equal((await owner.get(`/api/dashboard?today=${today}`)).body.reminders.appointments.length, 1);
    assert.equal((await owner.post(`/api/pets/${petId}/appointments/${appt.id}/status`).send({ status: 'completada' })).status, 200);
    assert.equal((await owner.get(`/api/dashboard?today=${today}`)).body.reminders.appointments.length, 0);
  });

  test('el resumen diario avisa en los días clave y una sola vez por día', async () => {
    const items = digestItems(
      {
        reminders: {
          preventive: [
            { next_due: '2026-11-20', name: 'Rabia', pet_name: 'Nube' },
            { next_due: '2026-11-15', name: 'Pipeta', pet_name: 'Nube' },
          ],
          appointments: [],
          food: [{ runs_out_on: '2026-11-14', pet_name: 'Nube' }],
        },
      },
      '2026-11-13',
    );
    assert.deepEqual(items.map((i) => i.line), ['Se acaba el alimento de Nube — mañana', 'Rabia de Nube — en 7 días']);

    const token = tokenFrom(lastMailTo('avisos@kaimi.test'), 'verificar');
    await request(app).post('/api/auth/verify').send({ token });
    const before = testOutbox.length;
    await runDailyDigest();
    const digest = testOutbox.slice(before).filter((m) => m.to === 'avisos@kaimi.test');
    assert.equal(digest.length, 1);
    assert.match(digest[0].text, /Pipeta de Nube — en 7 días/);
    await runDailyDigest();
    assert.equal(testOutbox.filter((m) => m.to === 'avisos@kaimi.test' && m.subject.startsWith('Kaimi:')).length, 1);
  });
});
