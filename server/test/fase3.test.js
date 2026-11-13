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
const { testWhatsApp } = await import('../src/whatsapp.js');
const { runClinicWhatsApp } = await import('../src/notifications.js');

const app = createApp();
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const mailsTo = (email) => testOutbox.filter((m) => m.to === email);

async function signup(email, name = 'Ana') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'clave-segura-1', consent: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return agent;
}

// Confirma el correo con el enlace que llegó al registrarse (los avisos solo van a correos confirmados)
async function verify(email) {
  const token = mailsTo(email).at(-1).text.match(/\/verificar\/([A-Za-z0-9_-]+)/)[1];
  await request(app).post('/api/auth/verify').send({ token });
}

let admin;
let vet;
let owner;
let placeId;
let petId;

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  admin = await signup('admin@kaimi.test', 'Admin');
  vet = await signup('vet3@kaimi.test', 'Valeria Vet');
  owner = await signup('dueno3@kaimi.test', 'Daniela Dueña');
  await verify('vet3@kaimi.test');
  await verify('dueno3@kaimi.test');
  petId = (await owner.post('/api/pets').send({ name: 'Kira', species: 'perro' })).body.pet.id;
});

after(() => pool.end());

describe('registro de clínicas con aprobación', () => {
  test('un veterinario solicita su panel y el admin lo aprueba', async () => {
    const bad = await vet.post('/api/place-requests').send({ name: '', kind: 'clinica' });
    assert.equal(bad.status, 400);
    const res = await vet.post('/api/place-requests').send({
      name: 'Clínica Nueva',
      kind: 'clinica',
      locality: 'Chapinero',
      display_name: 'Dra. Valeria',
      professional_card: 'TP 555',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(mailsTo('admin@kaimi.test').some((m) => m.subject.includes('Clínica Nueva')));
    assert.equal((await vet.get('/api/admin/overview')).status, 403);

    const list = await admin.get('/api/admin/place-requests');
    assert.equal(list.body.requests.length, 1);
    const reqId = list.body.requests[0].id;
    const noCoords = await admin.post(`/api/admin/place-requests/${reqId}/approve`).send({});
    assert.equal(noCoords.status, 400);
    const approved = await admin.post(`/api/admin/place-requests/${reqId}/approve`).send({ lat: 4.65, lng: -74.06 });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    placeId = approved.body.place_id;
    assert.equal((await admin.post(`/api/admin/place-requests/${reqId}/approve`).send({ lat: 4.65, lng: -74.06 })).status, 409);

    const me = await vet.get('/api/auth/me');
    assert.deepEqual(me.body.user.clinics.map((c) => [c.name, c.role]), [['Clínica Nueva', 'admin']]);
    assert.ok(mailsTo('vet3@kaimi.test').some((m) => m.subject.includes('ya está en Kaimi')));
    const members = (await vet.get(`/api/clinics/${placeId}/members`)).body.members;
    assert.equal(members[0].professional_card, 'TP 555');
  });

  test('no se puede reclamar un lugar que ya tiene equipo y el rechazo avisa', async () => {
    const other = await signup('otro3@kaimi.test', 'Óscar');
    const claim = await other.post('/api/place-requests').send({ existing_place_id: placeId, name: 'Clínica Nueva', kind: 'clinica', display_name: 'Óscar' });
    assert.equal(claim.status, 409);
    await other.post('/api/place-requests').send({ name: 'Otra', kind: 'independiente', display_name: 'Óscar' });
    const pending = (await admin.get('/api/admin/place-requests')).body.requests;
    assert.equal((await admin.post(`/api/admin/place-requests/${pending[0].id}/reject`).send({ note: 'Falta la tarjeta profesional' })).status, 204);
    const mine = (await other.get('/api/place-requests/mine')).body.requests;
    assert.equal(mine[0].status, 'rechazada');
    assert.equal(mine[0].review_note, 'Falta la tarjeta profesional');
  });
});

describe('veterinario disponible ahora', () => {
  test('se activa por horas y se refleja en el directorio', async () => {
    const on = await vet.put(`/api/clinics/${placeId}/availability`).send({ hours: 4, note: 'Urgencias leves' });
    assert.equal(on.status, 200);
    const hours = (new Date(on.body.available_until) - Date.now()) / 3600000;
    assert.ok(hours > 3.9 && hours <= 4);
    const pub = await request(app).get('/api/places?vetNow=true');
    assert.deepEqual(pub.body.places.map((p) => [p.name, p.available_note]), [['Clínica Nueva', 'Urgencias leves']]);
    assert.equal((await vet.put(`/api/clinics/${placeId}/availability`).send({ hours: 3 })).status, 400);
    await vet.put(`/api/clinics/${placeId}/availability`).send({ hours: 0 });
    assert.equal((await request(app).get('/api/places?vetNow=true')).body.places.length, 0);
  });

  test('un aviso vencido no se muestra aunque siga guardado', async () => {
    await pool.query("UPDATE places SET available_until = now() - interval '1 minute', available_note = 'viejo' WHERE id = $1", [placeId]);
    const pub = await request(app).get(`/api/places/${placeId}`);
    assert.equal(pub.body.place.available_until, null);
    assert.equal(pub.body.place.available_note, null);
  });
});

describe('solicitudes de cita', () => {
  test('pedir cita exige autorizar a la clínica y avisa al equipo', async () => {
    const noConsent = await owner.post(`/api/pets/${petId}/appointment-requests`).send({ place_id: placeId, reason: 'Vacunación' });
    assert.equal(noConsent.status, 400);
    const before = mailsTo('vet3@kaimi.test').length;
    const res = await owner
      .post(`/api/pets/${petId}/appointment-requests`)
      .send({ place_id: placeId, reason: 'Vacunación', preferred_date: addDays(3), preferred_time: 'tarde', consent: true });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(mailsTo('vet3@kaimi.test').length, before + 1);
    assert.equal((await vet.get(`/api/clinics/${placeId}/patients`)).body.patients[0].name, 'Kira');
    const dup = await owner.post(`/api/pets/${petId}/appointment-requests`).send({ place_id: placeId, reason: 'Otra' });
    assert.equal(dup.status, 409);
  });

  test('la clínica confirma y la cita queda en la historia, registrada por ella', async () => {
    const pending = (await vet.get(`/api/clinics/${placeId}/appointment-requests`)).body.requests;
    assert.equal(pending.length, 1);
    const when = new Date(Date.now() + 3 * 86400000).toISOString();
    const past = await vet.post(`/api/clinics/${placeId}/appointment-requests/${pending[0].id}/confirm`).send({ scheduled_at: '2020-01-01T10:00:00Z' });
    assert.equal(past.status, 400);
    const ok = await vet.post(`/api/clinics/${placeId}/appointment-requests/${pending[0].id}/confirm`).send({ scheduled_at: when, vet: 'Dra. Valeria' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.appointment.source, 'clinica');
    assert.equal(ok.body.appointment.validated_by_name, 'Dra. Valeria');
    assert.ok(mailsTo('dueno3@kaimi.test').some((m) => m.subject.startsWith('Cita confirmada para Kira')));

    const mine = (await owner.get(`/api/pets/${petId}/appointment-requests`)).body.requests;
    assert.equal(mine[0].status, 'confirmada');
    assert.ok(mine[0].scheduled_at);
    const dash = await owner.get('/api/dashboard');
    assert.equal(dash.body.reminders.appointments[0].reason, 'Vacunación');
    assert.equal((await vet.post(`/api/clinics/${placeId}/appointment-requests/${pending[0].id}/reject`)).status, 409);
  });

  test('el dueño cancela y la clínica rechaza con un mensaje', async () => {
    const a = (await owner.post(`/api/pets/${petId}/appointment-requests`).send({ place_id: placeId, reason: 'Control' })).body.request;
    assert.equal((await owner.post(`/api/pets/${petId}/appointment-requests/${a.id}/cancel`)).status, 204);
    const b = (await owner.post(`/api/pets/${petId}/appointment-requests`).send({ place_id: placeId, reason: 'Baño' })).body.request;
    assert.equal((await vet.post(`/api/clinics/${placeId}/appointment-requests/${b.id}/reject`).send({ response: 'No ofrecemos baños' })).status, 204);
    assert.ok(mailsTo('dueno3@kaimi.test').some((m) => m.text.includes('No ofrecemos baños')));
  });
});

describe('plan Pro: reportes y WhatsApp', () => {
  test('los reportes son del plan Pro y se activan con la solicitud aprobada', async () => {
    assert.equal((await vet.get(`/api/clinics/${placeId}/reports`)).status, 402);
    const req = await vet.post(`/api/clinics/${placeId}/plan-request`).send({ plan: 'pro' });
    assert.equal(req.status, 201);
    assert.equal((await vet.get(`/api/clinics/${placeId}`)).body.counts.pending_plan, 'pro');
    const pending = (await admin.get('/api/admin/plan-requests')).body.requests;
    assert.equal(pending[0].place_name, 'Clínica Nueva');
    assert.equal((await admin.post(`/api/admin/plan-requests/${pending[0].id}/approve`)).status, 204);

    await vet.post(`/api/clinics/${placeId}/patients/${petId}/preventive`).send({ kind: 'vacuna', name: 'Rabia', applied_on: addDays(-358), next_due: addDays(7) });
    const report = await vet.get(`/api/clinics/${placeId}/reports`);
    assert.equal(report.status, 200, JSON.stringify(report.body));
    assert.equal(report.body.patients, 1);
    assert.deepEqual(report.body.vaccines.map((v) => [v.name, v.total, v.up_to_date]), [['Rabia', 1, 1]]);
    assert.ok(report.body.validated_last_30 >= 2);

    await owner.put(`/api/pets/${petId}`).send({ name: '=HYPERLINK("x")', species: 'perro' });
    const csv = await vet.get(`/api/clinics/${placeId}/reports/patients.csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.ok(csv.text.startsWith('﻿Mascota,'));
    assert.ok(csv.text.includes(`"'=HYPERLINK(""x"")"`)); // sin fórmulas ejecutables en Excel
    await owner.put(`/api/pets/${petId}`).send({ name: 'Kira', species: 'perro' });
  });

  test('WhatsApp solo a dueños que lo autorizaron, una vez por día', async () => {
    const follow = (await vet.get(`/api/clinics/${placeId}/follow-ups`)).body.preventive[0];
    const notAllowed = await vet.post(`/api/clinics/${placeId}/follow-ups/${follow.id}/whatsapp`);
    assert.equal(notAllowed.status, 400);

    const badPhone = await owner.put('/api/auth/me').send({ phone: '123', whatsapp_opt_in: true });
    assert.equal(badPhone.status, 400);
    const optIn = await owner.put('/api/auth/me').send({ phone: '300 123 4567', whatsapp_opt_in: true });
    assert.equal(optIn.body.user.whatsapp_opt_in, true);

    const sent = await vet.post(`/api/clinics/${placeId}/follow-ups/${follow.id}/whatsapp`);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const msg = testWhatsApp.at(-1);
    assert.equal(msg.to, '573001234567');
    assert.deepEqual([msg.params[0], msg.params[1], msg.params[2], msg.params[4]], ['Daniela', 'Kira', 'Rabia', 'Clínica Nueva']);
    assert.equal((await vet.post(`/api/clinics/${placeId}/follow-ups/${follow.id}/whatsapp`)).status, 409);

    // Envío automático: el refuerzo vence en 7 días
    const before = testWhatsApp.length;
    assert.equal(await runClinicWhatsApp(), 1);
    assert.equal(await runClinicWhatsApp(), 0);
    assert.equal(testWhatsApp.length, before + 1);

    // Retirar la autorización borra el celular
    const out = await owner.put('/api/auth/me').send({ whatsapp_opt_in: false });
    assert.equal(out.body.user.phone, null);
    assert.equal(out.body.user.whatsapp_opt_in, false);
  });
});

describe('moderación', () => {
  test('el admin oculta y vuelve a mostrar una reseña', async () => {
    const appt = await vet.post(`/api/clinics/${placeId}/patients/${petId}/appointments`).send({
      scheduled_at: new Date(Date.now() - 86400000).toISOString(),
      reason: 'Control',
      status: 'completada',
    });
    await owner.post(`/api/pets/${petId}/appointments/${appt.body.record.id}/review`).send({ rating: 1, comment: 'Ofensivo' });
    const reviews = (await admin.get('/api/admin/reviews')).body.reviews;
    assert.equal((await admin.post(`/api/admin/reviews/${reviews[0].id}/hide`)).status, 204);
    assert.equal((await request(app).get(`/api/places/${placeId}`)).body.reviews.length, 0);
    assert.equal((await admin.post(`/api/admin/reviews/${reviews[0].id}/show`)).status, 204);
    assert.equal((await request(app).get(`/api/places/${placeId}`)).body.reviews.length, 1);
  });
});
