import { createHash, randomBytes } from 'node:crypto';
import { query } from './db.js';

const hash = (token) => createHash('sha256').update(token).digest('hex');

export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');

// Crea un token de un solo uso; los anteriores del mismo propósito quedan anulados
export async function createAuthToken(userId, purpose, ttlMinutes) {
  const token = randomToken(32);
  await query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL", [userId, purpose]);
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, hash(token), ttlMinutes],
  );
  return token;
}

// Marca el token como usado y devuelve su usuario, o null si no existe, expiró o ya se usó
export async function consumeAuthToken(token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { rows } = await query(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hash(token), purpose],
  );
  return rows[0]?.user_id ?? null;
}
