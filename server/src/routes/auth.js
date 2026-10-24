import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { isAdminEmail } from '../config.js';
import { HttpError } from '../errors.js';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../auth.js';
import { DEMO_EMAIL } from '../seed-demo.js';

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

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre').max(80),
  email,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  consent: z.literal(true, { error: 'Debes autorizar el tratamiento de datos para continuar' }),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Escribe tu contraseña'),
});

const publicUser = ({ id, name, email, created_at }) => ({ id, name, email, created_at, is_admin: isAdminEmail(email) });

router.post('/register', authLimiter, async (req, res) => {
  const data = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(data.password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash, consent_at) VALUES ($1, $2, $3, now()) RETURNING *',
      [data.name, data.email, hash],
    );
    setSessionCookie(res, rows[0]);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo', fields: { email: 'Ya existe una cuenta con ese correo' } });
    }
    throw err;
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [data.email]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(data.password, user.password_hash));
  if (!ok) throw new HttpError(401, 'Correo o contraseña incorrectos');
  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
});

// Acceso de un clic a la cuenta demo; solo existe mientras SEED_DEMO=true
const demoEnabled = () => process.env.SEED_DEMO === 'true';

router.get('/demo', (req, res) => {
  if (!demoEnabled()) return res.json({ enabled: false });
  // La contraseña solo se muestra si es la pública por defecto
  res.json({ enabled: true, email: DEMO_EMAIL, password: process.env.DEMO_PASSWORD ? null : 'kaimi-demo' });
});

router.post('/demo', authLimiter, async (req, res) => {
  if (!demoEnabled()) throw new HttpError(404, 'La demo no está activa');
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [DEMO_EMAIL]);
  if (!rows[0]) throw new HttpError(404, 'La cuenta demo aún no se ha creado');
  setSessionCookie(res, rows[0]);
  res.json({ user: publicUser(rows[0]) });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) {
    clearSessionCookie(res);
    throw new HttpError(401, 'Inicia sesión para continuar');
  }
  res.json({ user: publicUser(rows[0]) });
});

router.delete('/me', requireAuth, async (req, res) => {
  await query('DELETE FROM users WHERE id = $1', [req.userId]);
  clearSessionCookie(res);
  res.status(204).end();
});

export default router;
