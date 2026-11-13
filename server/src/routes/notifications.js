import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../errors.js';
import { pushEnabled, sendPush } from '../notifications.js';

const router = Router();

router.get('/config', (req, res) => {
  res.json({ push_enabled: pushEnabled(), vapid_public_key: config.vapid.publicKey });
});

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

router.post('/subscribe', requireAuth, async (req, res) => {
  if (!pushEnabled()) throw new HttpError(503, 'Las notificaciones push no están configuradas en este servidor');
  const { endpoint, keys } = subscriptionSchema.parse(req.body);
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [req.userId, endpoint, keys.p256dh, keys.auth],
  );
  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.userId]);
  res.status(204).end();
});

router.post('/test', requireAuth, async (req, res) => {
  const sent = await sendPush(req.userId, { title: 'Kaimi', body: '¡Listo! Así te avisaremos de los cuidados de tus mascotas.', url: '/cuenta' });
  if (!sent) throw new HttpError(400, 'No encontramos un dispositivo con notificaciones activas');
  res.json({ sent });
});

export default router;
