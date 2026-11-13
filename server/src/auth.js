import jwt from 'jsonwebtoken';
import { config, isAdminEmail } from './config.js';
import { query } from './db.js';
import { HttpError } from './errors.js';

export const COOKIE_NAME = 'kaimi_session';

// sv = session_version: al cambiar la contraseña se incrementa y las sesiones anteriores dejan de valer
export function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, sv: user.session_version ?? 0 }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
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

// Usuario de la sesión o null; una sesión inválida borra la cookie
async function sessionUser(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    clearSessionCookie(res);
    return null;
  }
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user || user.session_version !== (payload.sv ?? 0)) {
    clearSessionCookie(res);
    return null;
  }
  return user;
}

export async function requireAuth(req, res, next) {
  const hadCookie = Boolean(req.cookies?.[COOKIE_NAME]);
  const user = await sessionUser(req, res);
  if (!user) throw new HttpError(401, hadCookie ? 'Tu sesión expiró, vuelve a iniciar sesión' : 'Inicia sesión para continuar');
  req.user = user;
  req.userId = user.id;
  next();
}

// Rutas públicas que muestran algo más a quien tiene sesión
export async function optionalAuth(req, res, next) {
  const user = await sessionUser(req, res);
  if (user) {
    req.user = user;
    req.userId = user.id;
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || !isAdminEmail(req.user.email)) throw new HttpError(403, 'No tienes permisos para esta acción');
  next();
}
