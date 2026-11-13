import webpush from 'web-push';
import { config } from './config.js';
import { query } from './db.js';
import { bogotaClock } from './hours.js';
import { renderMail, sendMail } from './mailer.js';
import { getClinicFollowUps, getReminders } from './reminders.js';
import { bogotaTodayIso } from './validation.js';
import { sendWhatsAppReminder, whatsappEnabled, whatsappParams } from './whatsapp.js';

export const pushEnabled = () => Boolean(config.vapid.publicKey && config.vapid.privateKey);

if (pushEnabled()) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

// Envía a todos los dispositivos del usuario; borra las suscripciones que el navegador ya anuló
export async function sendPush(userId, payload) {
  if (!pushEnabled()) return 0;
  const { rows } = await query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId]);
  let sent = 0;
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 24 * 3600 });
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
        else console.error('Error enviando push', err.statusCode ?? err.message);
      }
    }),
  );
  return sent;
}

// Se avisa 7 días antes, el día anterior, el mismo día y 3 días después si sigue pendiente
const STAGES = new Set([7, 1, 0, -3]);
const dayDiff = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

function relative(days) {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days > 1) return `en ${days} días`;
  return `venció hace ${-days} días`;
}

// Lo que toca avisar hoy a un usuario, a partir de los mismos datos del tablero
export function digestItems(data, today) {
  const items = [
    ...data.reminders.preventive.map((p) => ({ date: p.next_due, text: `${p.name} de ${p.pet_name}` })),
    ...data.reminders.appointments.map((a) => ({ date: bogotaTodayIso(new Date(a.scheduled_at)), text: `Cita de ${a.pet_name}: ${a.reason}` })),
    ...data.reminders.food.map((f) => ({ date: f.runs_out_on, text: `Se acaba el alimento de ${f.pet_name}` })),
  ];
  return items
    .map((i) => ({ ...i, days: dayDiff(today, i.date) }))
    .filter((i) => STAGES.has(i.days))
    .sort((a, b) => a.days - b.days)
    .map((i) => ({ ...i, line: `${i.text} — ${relative(i.days)}` }));
}

// Resumen diario por correo y push. notification_log garantiza un solo envío por usuario y día,
// incluso con varias instancias del servidor
export async function runDailyDigest(now = new Date()) {
  const today = bogotaTodayIso(now);
  const { rows: users } = await query(
    `SELECT u.* FROM users u
     WHERE ((u.notify_email AND u.email_verified_at IS NOT NULL) OR EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id))
       AND NOT EXISTS (SELECT 1 FROM notification_log l WHERE l.user_id = u.id AND l.key = $1)
       AND (EXISTS (SELECT 1 FROM pets p WHERE p.user_id = u.id) OR EXISTS (SELECT 1 FROM pet_caregivers c WHERE c.user_id = u.id))`,
    [`digest:${today}`],
  );
  let notified = 0;
  for (const user of users) {
    const items = digestItems(await getReminders(user.id, today), today);
    if (!items.length) continue;
    const { rows: claimed } = await query(
      'INSERT INTO notification_log (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id',
      [user.id, `digest:${today}`],
    );
    if (!claimed[0]) continue;
    const title = items.length === 1 ? 'Tienes un cuidado pendiente' : `Tienes ${items.length} cuidados pendientes`;
    if (user.notify_email && user.email_verified_at) {
      const mail = renderMail({
        title,
        lines: [...items.map((i) => `• ${i.line}`), 'Marca cada cuidado como atendido desde la app para dejar de recibir este aviso.'],
        action: { label: 'Ver en Kaimi', url: config.appUrl },
      });
      await sendMail({ to: user.email, subject: `Kaimi: ${title.toLowerCase()}`, ...mail }).catch((err) => console.error(err));
    }
    await sendPush(user.id, { title, body: items.map((i) => i.line).join('\n'), url: '/' });
    notified++;
  }
  return notified;
}

// Clínicas Pro: WhatsApp a los dueños que lo autorizaron, 7 días antes y el día anterior de cada refuerzo
export async function runClinicWhatsApp(now = new Date()) {
  if (!whatsappEnabled()) return 0;
  const today = bogotaTodayIso(now);
  const { rows: places } = await query(`SELECT id, name FROM places WHERE plan = 'pro' AND EXISTS (SELECT 1 FROM place_members m WHERE m.place_id = places.id)`);
  let sent = 0;
  for (const place of places) {
    const { preventive } = await getClinicFollowUps(place.id, today, 7);
    for (const f of preventive) {
      const days = dayDiff(today, f.next_due);
      if (!f.owner_phone || (days !== 7 && days !== 1)) continue;
      // Una sola vez por cuidado y etapa, aunque el dueño tenga varias clínicas o haya varias instancias
      const { rows } = await query('INSERT INTO notification_log (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key', [
        f.owner_id,
        `wa-auto:${f.id}:${days}`,
      ]);
      if (!rows[0]) continue;
      try {
        await sendWhatsAppReminder(f.owner_phone, whatsappParams(f, place));
        sent++;
      } catch (err) {
        console.error('Error enviando WhatsApp', err.message);
      }
    }
  }
  return sent;
}

// Revisa cada hora; el resumen sale a partir de las 8 a. m. de Colombia
export function startScheduler() {
  const tick = () => {
    if (bogotaClock().minutes < 8 * 60) return;
    runDailyDigest().catch((err) => console.error('Error en el resumen diario', err));
    runClinicWhatsApp().catch((err) => console.error('Error en los WhatsApp de clínicas', err));
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}
