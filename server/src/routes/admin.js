import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { notifyUser } from '../notify.js';
import { PLANS } from '../plans.js';
import { randomToken } from '../tokens.js';
import { id, insertSql, optText } from '../validation.js';

// Administración de Kaimi (correos en ADMIN_EMAILS): /api/admin
const router = Router();
router.use(requireAdmin);

router.get('/overview', async (req, res) => {
  const { rows } = await query(
    `SELECT (SELECT count(*)::int FROM users) AS users,
            (SELECT count(*)::int FROM pets) AS pets,
            (SELECT count(*)::int FROM places) AS places,
            (SELECT count(DISTINCT place_id)::int FROM place_members) AS clinics,
            (SELECT count(*)::int FROM place_requests WHERE status = 'pendiente') AS pending_places,
            (SELECT count(*)::int FROM plan_requests WHERE status = 'pendiente') AS pending_plans,
            (SELECT count(*)::int FROM clinic_patients WHERE revoked_at IS NULL) AS patients,
            (SELECT count(*)::int FROM reviews WHERE hidden_at IS NULL) AS reviews`,
  );
  res.json(rows[0]);
});

// ===== Solicitudes de clínicas y veterinarios =====
router.get('/place-requests', async (req, res) => {
  const status = z.enum(['pendiente', 'aprobada', 'rechazada']).catch('pendiente').parse(req.query.status);
  const { rows } = await query(
    `SELECT r.*, u.name AS user_name, u.email AS user_email, ep.name AS existing_place_name
     FROM place_requests r JOIN users u ON u.id = r.user_id LEFT JOIN places ep ON ep.id = r.existing_place_id
     WHERE r.status = $1 ORDER BY r.created_at ${status === 'pendiente' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status],
  );
  res.json({ requests: rows });
});

async function pendingRequest(value) {
  const reqId = id.safeParse(value);
  if (!reqId.success) throw notFound('Solicitud');
  const { rows } = await query('SELECT * FROM place_requests WHERE id = $1', [reqId.data]);
  if (!rows[0]) throw notFound('Solicitud');
  if (rows[0].status !== 'pendiente') throw new HttpError(409, 'Esta solicitud ya fue revisada');
  return rows[0];
}

// Aprobar: crea el lugar (o usa el existente) y deja al solicitante como administrador
router.post('/place-requests/:requestId/approve', async (req, res) => {
  const request = await pendingRequest(req.params.requestId);
  const data = z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      plan: z.enum(Object.keys(PLANS)).default('gratis'),
    })
    .parse(req.body ?? {});
  const lat = data.lat ?? request.lat;
  const lng = data.lng ?? request.lng;
  if (!request.existing_place_id && (lat == null || lng == null)) {
    return res.status(400).json({ error: 'Faltan las coordenadas del lugar', fields: { lat: 'Escribe las coordenadas para ubicarlo en el mapa' } });
  }
  const placeId = await withTransaction(async (client) => {
    let pid = request.existing_place_id;
    if (!pid) {
      const { rows } = await client.query(
        insertSql('places', {
          name: request.name,
          kind: request.kind,
          address: request.address,
          locality: request.locality,
          city: request.city,
          phone: request.phone,
          whatsapp: request.whatsapp,
          home_visits: request.kind === 'independiente',
          lat,
          lng,
          plan: data.plan,
          intake_code: randomToken(9),
        }),
      );
      pid = rows[0].id;
    }
    await client.query(
      `INSERT INTO place_members (place_id, user_id, role, display_name, professional_card) VALUES ($1, $2, 'admin', $3, $4)
       ON CONFLICT (place_id, user_id) DO UPDATE SET role = 'admin'`,
      [pid, request.user_id, request.display_name, request.professional_card],
    );
    await client.query("UPDATE place_requests SET status = 'aprobada', reviewed_at = now(), place_id = $1 WHERE id = $2", [pid, request.id]);
    return pid;
  });
  await notifyUser(request.user_id, {
    subject: `${request.name} ya está en Kaimi`,
    title: '¡Tu panel de clínica está listo!',
    lines: [
      `Aprobamos la solicitud de ${request.name}. Ya puedes completar el perfil y el horario, agregar a tu equipo e imprimir el QR para registrar pacientes.`,
    ],
    path: `/clinica/${placeId}`,
  });
  res.json({ place_id: placeId });
});

router.post('/place-requests/:requestId/reject', async (req, res) => {
  const request = await pendingRequest(req.params.requestId);
  const { note } = z.object({ note: optText(500) }).parse(req.body ?? {});
  await query("UPDATE place_requests SET status = 'rechazada', reviewed_at = now(), review_note = $1 WHERE id = $2", [note, request.id]);
  await notifyUser(request.user_id, {
    subject: `Sobre la solicitud de ${request.name} en Kaimi`,
    title: 'No pudimos aprobar tu solicitud',
    lines: [note ? `Motivo: ${note}` : 'Escríbenos a hola@kaimi.co si quieres más información.', 'Puedes enviar una nueva solicitud cuando quieras.'],
    path: '/registrar-clinica',
  });
  res.status(204).end();
});

// ===== Planes =====
router.get('/plan-requests', async (req, res) => {
  const { rows } = await query(
    `SELECT pr.*, p.name AS place_name, p.plan AS current_plan, u.name AS user_name, u.email AS user_email
     FROM plan_requests pr JOIN places p ON p.id = pr.place_id LEFT JOIN users u ON u.id = pr.user_id
     WHERE pr.status = 'pendiente' ORDER BY pr.created_at`,
  );
  res.json({ requests: rows });
});

router.post('/plan-requests/:requestId/:decision', async (req, res) => {
  const decision = z.enum(['approve', 'reject']).safeParse(req.params.decision);
  const reqId = id.safeParse(req.params.requestId);
  if (!decision.success || !reqId.success) throw notFound('Solicitud');
  const { rows } = await query("SELECT * FROM plan_requests WHERE id = $1 AND status = 'pendiente'", [reqId.data]);
  const request = rows[0];
  if (!request) throw notFound('Solicitud');
  const approved = decision.data === 'approve';
  await withTransaction(async (client) => {
    await client.query('UPDATE plan_requests SET status = $1, reviewed_at = now() WHERE id = $2', [approved ? 'aprobada' : 'rechazada', request.id]);
    if (approved) await client.query('UPDATE places SET plan = $1, updated_at = now() WHERE id = $2', [request.plan, request.place_id]);
  });
  if (request.user_id) {
    await notifyUser(request.user_id, {
      subject: approved ? `Plan ${PLANS[request.plan].label} activado` : 'Sobre tu solicitud de plan',
      title: approved ? `¡Plan ${PLANS[request.plan].label} activado!` : 'No activamos el cambio de plan',
      lines: [approved ? 'Ya tienes disponibles todas las funciones del plan en tu panel.' : 'Escríbenos a hola@kaimi.co para revisarlo.'],
      path: `/clinica/${request.place_id}/plan`,
    });
  }
  res.status(204).end();
});

// Cambio directo de plan (p. ej. clínicas fundadoras)
router.put('/places/:placeId/plan', async (req, res) => {
  const placeId = id.safeParse(req.params.placeId);
  if (!placeId.success) throw notFound('Lugar');
  const { plan } = z.object({ plan: z.enum(Object.keys(PLANS)) }).parse(req.body);
  const { rowCount } = await query('UPDATE places SET plan = $1, updated_at = now() WHERE id = $2', [plan, placeId.data]);
  if (!rowCount) throw notFound('Lugar');
  res.status(204).end();
});

router.get('/places', async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.kind, p.locality, p.plan,
            (SELECT count(*)::int FROM place_members m WHERE m.place_id = p.id) AS members,
            (SELECT count(*)::int FROM clinic_patients cp WHERE cp.place_id = p.id AND cp.revoked_at IS NULL) AS patients
     FROM places p ORDER BY members DESC, p.name`,
  );
  res.json({ places: rows });
});

// ===== Moderación de reseñas =====
router.get('/reviews', async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.rating, r.comment, r.reply, r.created_at, r.hidden_at, p.name AS place_name, split_part(u.name, ' ', 1) AS author
     FROM reviews r JOIN places p ON p.id = r.place_id JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC LIMIT 100`,
  );
  res.json({ reviews: rows });
});

router.post('/reviews/:reviewId/:action', async (req, res) => {
  const action = z.enum(['hide', 'show']).safeParse(req.params.action);
  const reviewId = id.safeParse(req.params.reviewId);
  if (!action.success || !reviewId.success) throw notFound('Reseña');
  const { rowCount } = await query(`UPDATE reviews SET hidden_at = ${action.data === 'hide' ? 'now()' : 'NULL'} WHERE id = $1`, [reviewId.data]);
  if (!rowCount) throw notFound('Reseña');
  res.status(204).end();
});

export default router;
