import jwt from 'jsonwebtoken';
import { config, isAdminEmail } from './config.js';
import { query } from './db.js';
import { HttpError } from './errors.js';

export const COOKIE_NAME = 'petcare_session';

export function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new HttpError(401, 'Inicia sesión para continuar');
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = payload.sub;
    next();
  } catch {
    clearSessionCookie(res);
    throw new HttpError(401, 'Tu sesión expiró, vuelve a iniciar sesión');
  }
}

export async function requireAdmin(req, res, next) {
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
  if (!rows[0] || !isAdminEmail(rows[0].email)) throw new HttpError(403, 'No tienes permisos para esta acción');
  next();
}
