import { z } from 'zod';
import { query } from './db.js';

// Horarios en hora de Colombia (sin horario de verano): "abierto ahora" no depende de la zona del servidor
const CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function bogotaClock(date = new Date()) {
  const parts = Object.fromEntries(CLOCK.formatToParts(date).map((p) => [p.type, p.value]));
  return { weekday: WEEKDAYS[parts.weekday], minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (t) => t.slice(0, 5);

// Franjas de la semana por día; una franja que cruza la medianoche se parte en dos
function segments(hours) {
  const out = [];
  for (const h of hours) {
    const start = toMinutes(h.opens);
    const end = toMinutes(h.closes);
    if (start < end) out.push({ day: h.weekday, start, end, closes: hhmm(h.closes), opening: true });
    else {
      out.push({ day: h.weekday, start, end: 1440, closes: hhmm(h.closes), opening: true });
      out.push({ day: (h.weekday + 1) % 7, start: 0, end, closes: hhmm(h.closes), opening: false });
    }
  }
  return out;
}

// open: true/false, o null si no hay horario registrado (no se puede afirmar nada)
export function openStatus(hours, open24h, date = new Date()) {
  if (open24h) return { open: true, closes_at: null, opens_at: null };
  if (!hours?.length) return { open: null, closes_at: null, opens_at: null };
  const { weekday, minutes } = bogotaClock(date);
  const segs = segments(hours);
  const current = segs.find((s) => s.day === weekday && minutes >= s.start && minutes < s.end);
  if (current) return { open: true, closes_at: current.closes, opens_at: null };
  for (let k = 0; k < 8; k++) {
    const day = (weekday + k) % 7;
    const next = segs
      .filter((s) => s.opening && s.day === day && (k > 0 || s.start > minutes))
      .sort((a, b) => a.start - b.start)[0];
    if (next) {
      const time = `${String(Math.floor(next.start / 60)).padStart(2, '0')}:${String(next.start % 60).padStart(2, '0')}`;
      return { open: false, closes_at: null, opens_at: { weekday: day, time, in_days: k } };
    }
  }
  return { open: false, closes_at: null, opens_at: null };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:MM)');

export const hoursSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), opens: time, closes: time }))
  .max(28)
  .refine((list) => list.every((h) => h.opens !== h.closes), 'La hora de apertura y la de cierre no pueden ser iguales');

export async function listHours(placeIds) {
  if (!placeIds.length) return new Map();
  const { rows } = await query(
    `SELECT place_id, weekday, to_char(opens, 'HH24:MI') AS opens, to_char(closes, 'HH24:MI') AS closes
     FROM place_hours WHERE place_id = ANY($1) ORDER BY weekday, opens`,
    [placeIds],
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.place_id)) map.set(r.place_id, []);
    map.get(r.place_id).push({ weekday: r.weekday, opens: r.opens, closes: r.closes });
  }
  return map;
}

// Reemplaza el horario completo en una transacción
export async function saveHours(client, placeId, hours) {
  await client.query('DELETE FROM place_hours WHERE place_id = $1', [placeId]);
  for (const h of hours) {
    await client.query('INSERT INTO place_hours (place_id, weekday, opens, closes) VALUES ($1, $2, $3, $4)', [placeId, h.weekday, h.opens, h.closes]);
  }
}
