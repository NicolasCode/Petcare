import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../errors.js';
import { renderMail, sendMailSafe } from '../mailer.js';
import { insertSql, optId, optText, reqText } from '../validation.js';

// Solicitudes de veterinarios y clínicas para tener su panel: /api/place-requests
const router = Router();

const requestSchema = z.object({
  existing_place_id: optId,
  name: reqText(150),
  kind: z.enum(['clinica', 'urgencias', 'independiente'], { error: 'Elige un tipo' }),
  address: optText(200),
  locality: optText(80),
  city: reqText(80).default('Bogotá'),
  phone: optText(40),
  whatsapp: optText(40),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  display_name: reqText(100),
  professional_card: optText(40),
  message: optText(1000),
});

router.get('/mine', async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, kind, status, review_note, place_id, created_at FROM place_requests WHERE user_id = $1 ORDER BY created_at DESC',
    [req.userId],
  );
  res.json({ requests: rows });
});

router.post('/', async (req, res) => {
  const data = requestSchema.parse(req.body);
  const { rows: pending } = await query("SELECT count(*)::int AS n FROM place_requests WHERE user_id = $1 AND status = 'pendiente'", [req.userId]);
  if (pending[0].n >= 3) throw new HttpError(429, 'Ya tienes solicitudes en revisión. Te escribiremos pronto.');
  if (data.existing_place_id) {
    const { rows } = await query('SELECT EXISTS (SELECT 1 FROM place_members WHERE place_id = $1) AS claimed', [data.existing_place_id]);
    if (rows[0]?.claimed) throw new HttpError(409, 'Ese lugar ya tiene un equipo en Kaimi. Pide a su administrador que te agregue.');
  }
  const { rows } = await query(insertSql('place_requests', { ...data, lat: data.lat ?? null, lng: data.lng ?? null }, { user_id: req.userId }));
  // Aviso a los administradores del directorio
  const mail = renderMail({
    title: 'Nueva solicitud de clínica',
    lines: [`${req.user.name} (${req.user.email}) quiere activar el panel de ${data.name}.`],
    action: { label: 'Revisar solicitudes', url: `${config.appUrl}/admin` },
  });
  for (const to of config.adminEmails) await sendMailSafe({ to, subject: `Kaimi: solicitud de ${data.name}`, ...mail });
  res.status(201).json({ request: rows[0] });
});

export default router;
