import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { getPetProfile } from '../profile.js';
import { id } from '../validation.js';

// Montado en /api/pets/:petId/share (requiere sesión y propiedad de la mascota)
const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, token, expires_at, view_count, last_viewed_at, created_at FROM share_links
     WHERE pet_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
    [req.pet.id],
  );
  res.json({ links: rows });
});

router.post('/', async (req, res) => {
  const { days } = z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(1) }).parse(req.body ?? {});
  const token = randomBytes(24).toString('base64url');
  const { rows } = await query(
    `INSERT INTO share_links (pet_id, token, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))
     RETURNING id, token, expires_at, view_count, last_viewed_at, created_at`,
    [req.pet.id, token, days],
  );
  res.status(201).json({ link: rows[0] });
});

router.delete('/:linkId', async (req, res) => {
  const linkId = id.safeParse(req.params.linkId);
  if (!linkId.success) throw notFound('Enlace');
  const { rowCount } = await query('UPDATE share_links SET revoked_at = now() WHERE id = $1 AND pet_id = $2 AND revoked_at IS NULL', [
    linkId.data,
    req.pet.id,
  ]);
  if (!rowCount) throw notFound('Enlace');
  res.status(204).end();
});

export default router;

// Acceso público de solo lectura para el veterinario: /api/shared/:token
export const publicShareRouter = Router();

publicShareRouter.get('/:token', async (req, res) => {
  const token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/).safeParse(req.params.token);
  const expired = new HttpError(404, 'Este enlace no es válido o ya expiró. Pide al propietario uno nuevo.');
  if (!token.success) throw expired;
  const { rows } = await query(
    `UPDATE share_links SET view_count = view_count + 1, last_viewed_at = now()
     WHERE token = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING pet_id, expires_at`,
    [token.data],
  );
  if (!rows[0]) throw expired;
  const { pet: { user_id, ...pet }, ...records } = await getPetProfile(rows[0].pet_id);
  const { rows: owner } = await query('SELECT name FROM users WHERE id = $1', [user_id]);
  // No se exponen datos de contacto del propietario
  res.json({ pet, ...records, owner_name: owner[0]?.name ?? null, expires_at: rows[0].expires_at });
});
