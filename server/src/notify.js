import { config } from './config.js';
import { query } from './db.js';
import { renderMail, sendMail } from './mailer.js';
import { sendPush } from './notifications.js';

// Aviso puntual a una persona: correo (si lo confirmó) y push a sus dispositivos.
// Nunca hace fallar la acción que lo originó
export async function notifyUser(userId, { subject, title, lines, path = '/', push }) {
  try {
    const { rows } = await query('SELECT email, email_verified_at FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) return;
    const url = `${config.appUrl}${path}`;
    if (user.email_verified_at) {
      await sendMail({ to: user.email, subject, ...renderMail({ title, lines, action: { label: 'Abrir Kaimi', url } }) });
    }
    await sendPush(userId, { title, body: push ?? lines[0], url: path });
  } catch (err) {
    console.error('No se pudo enviar el aviso', err);
  }
}

// Aviso a todo el equipo de una clínica
export async function notifyClinic(placeId, message) {
  const { rows } = await query('SELECT user_id FROM place_members WHERE place_id = $1', [placeId]);
  await Promise.all(rows.map((r) => notifyUser(r.user_id, message)));
}
