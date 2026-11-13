import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { config, isAdminEmail } from '../config.js';
import { HttpError } from '../errors.js';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../auth.js';
import { renderMail, sendMailSafe } from '../mailer.js';
import { consumeAuthToken, createAuthToken } from '../tokens.js';
import { DEMO_CLINIC_EMAIL, DEMO_EMAIL } from '../seed-demo.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

const email = z.string().trim().toLowerCase().pipe(z.email({ error: 'Correo no válido' }));
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128);

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre').max(80),
  email,
  password,
  consent: z.literal(true, { error: 'Debes autorizar el tratamiento de datos para continuar' }),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Escribe tu contraseña'),
});

const RESET_MINUTES = 60;
const VERIFY_MINUTES = 7 * 24 * 60;

// Datos de la sesión para el cliente, incluidas las clínicas en las que trabaja
export async function publicUser(user) {
  const { rows: clinics } = await query(
    `SELECT m.place_id, m.role, p.name, p.kind FROM place_members m JOIN places p ON p.id = m.place_id
     WHERE m.user_id = $1 ORDER BY p.name`,
    [user.id],
  );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
    is_admin: isAdminEmail(user.email),
    email_verified: Boolean(user.email_verified_at),
    notify_email: user.notify_email,
    clinics,
  };
}

async function sendVerification(user) {
  const token = await createAuthToken(user.id, 'verify_email', VERIFY_MINUTES);
  const mail = renderMail({
    title: `Hola, ${user.name.split(' ')[0]}`,
    lines: ['Confirma tu correo para recibir los recordatorios de tus mascotas y poder recuperar tu cuenta si olvidas la contraseña.'],
    action: { label: 'Confirmar mi correo', url: `${config.appUrl}/verificar/${token}` },
  });
  await sendMailSafe({ to: user.email, subject: 'Confirma tu correo en Kaimi', ...mail });
}

router.post('/register', authLimiter, async (req, res) => {
  const data = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(data.password, 10);
  let user;
  try {
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash, consent_at) VALUES ($1, $2, $3, now()) RETURNING *',
      [data.name, data.email, hash],
    );
    user = rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo', fields: { email: 'Ya existe una cuenta con ese correo' } });
    }
    throw err;
  }
  await sendVerification(user);
  setSessionCookie(res, user);
  res.status(201).json({ user: await publicUser(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [data.email]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(data.password, user.password_hash));
  if (!ok) throw new HttpError(401, 'Correo o contraseña incorrectos');
  setSessionCookie(res, user);
  res.json({ user: await publicUser(user) });
});

// Siempre responde igual para no revelar qué correos tienen cuenta
router.post('/forgot', authLimiter, async (req, res) => {
  const data = z.object({ email }).parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [data.email]);
  if (rows[0]) {
    const token = await createAuthToken(rows[0].id, 'reset_password', RESET_MINUTES);
    const mail = renderMail({
      title: 'Restablece tu contraseña',
      lines: [
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta en Kaimi.',
        `El enlace vence en ${RESET_MINUTES} minutos y solo se puede usar una vez. Si no fuiste tú, ignora este correo: tu contraseña no cambia.`,
      ],
      action: { label: 'Crear contraseña nueva', url: `${config.appUrl}/restablecer/${token}` },
    });
    await sendMailSafe({ to: rows[0].email, subject: 'Restablece tu contraseña de Kaimi', ...mail });
  }
  res.status(204).end();
});

// Cambia la contraseña, cierra las demás sesiones y deja la cuenta iniciada
router.post('/reset', authLimiter, async (req, res) => {
  const data = z.object({ token: z.string(), password }).parse(req.body);
  const userId = await consumeAuthToken(data.token, 'reset_password');
  if (!userId) throw new HttpError(400, 'El enlace no es válido o ya venció. Pide uno nuevo.');
  const hash = await bcrypt.hash(data.password, 10);
  // Quien recibió el enlace en su correo también lo confirmó
  const { rows } = await query(
    `UPDATE users SET password_hash = $1, session_version = session_version + 1, email_verified_at = COALESCE(email_verified_at, now())
     WHERE id = $2 RETURNING *`,
    [hash, userId],
  );
  setSessionCookie(res, rows[0]);
  res.json({ user: await publicUser(rows[0]) });
});

router.post('/verify', async (req, res) => {
  const { token } = z.object({ token: z.string() }).parse(req.body);
  const userId = await consumeAuthToken(token, 'verify_email');
  if (!userId) throw new HttpError(400, 'El enlace no es válido o ya venció. Pide uno nuevo desde tu cuenta.');
  await query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [userId]);
  res.status(204).end();
});

router.post('/verify/resend', authLimiter, requireAuth, async (req, res) => {
  if (req.user.email_verified_at) return res.status(204).end();
  await sendVerification(req.user);
  res.status(204).end();
});

// Acceso de un clic a las cuentas demo; solo existe mientras SEED_DEMO=true
const demoEnabled = () => process.env.SEED_DEMO === 'true';
const DEMO_ACCOUNTS = { dueno: DEMO_EMAIL, clinica: DEMO_CLINIC_EMAIL };

router.get('/demo', (req, res) => {
  if (!demoEnabled()) return res.json({ enabled: false });
  // La contraseña solo se muestra si es la pública por defecto
  res.json({ enabled: true, email: DEMO_EMAIL, clinic_email: DEMO_CLINIC_EMAIL, password: process.env.DEMO_PASSWORD ? null : 'kaimi-demo' });
});

router.post('/demo', authLimiter, async (req, res) => {
  if (!demoEnabled()) throw new HttpError(404, 'La demo no está activa');
  const as = z.enum(['dueno', 'clinica']).catch('dueno').parse(req.body?.as);
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [DEMO_ACCOUNTS[as]]);
  if (!rows[0]) throw new HttpError(404, 'La cuenta demo aún no se ha creado');
  setSessionCookie(res, rows[0]);
  res.json({ user: await publicUser(rows[0]) });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await publicUser(req.user) });
});

router.put('/me', requireAuth, async (req, res) => {
  const data = z
    .object({ name: z.string().trim().min(1, 'Escribe tu nombre').max(80).optional(), notify_email: z.boolean().optional() })
    .parse(req.body);
  const { rows } = await query(
    'UPDATE users SET name = COALESCE($1, name), notify_email = COALESCE($2, notify_email) WHERE id = $3 RETURNING *',
    [data.name ?? null, data.notify_email ?? null, req.userId],
  );
  res.json({ user: await publicUser(rows[0]) });
});

router.put('/me/password', authLimiter, requireAuth, async (req, res) => {
  const data = z.object({ current: z.string().min(1, 'Escribe tu contraseña actual'), password }).parse(req.body);
  if (!(await bcrypt.compare(data.current, req.user.password_hash))) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta', fields: { current: 'La contraseña actual no es correcta' } });
  }
  const hash = await bcrypt.hash(data.password, 10);
  const { rows } = await query('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2 RETURNING *', [
    hash,
    req.userId,
  ]);
  setSessionCookie(res, rows[0]);
  res.status(204).end();
});

router.delete('/me', requireAuth, async (req, res) => {
  await query('DELETE FROM users WHERE id = $1', [req.userId]);
  clearSessionCookie(res);
  res.status(204).end();
});

export default router;
