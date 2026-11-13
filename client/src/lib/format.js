export const SPECIES = {
  perro: { label: 'Perro', emoji: '🐶' },
  gato: { label: 'Gato', emoji: '🐱' },
  ave: { label: 'Ave', emoji: '🦜' },
  conejo: { label: 'Conejo', emoji: '🐰' },
  roedor: { label: 'Roedor', emoji: '🐹' },
  reptil: { label: 'Reptil', emoji: '🦎' },
  otro: { label: 'Otro', emoji: '🐾' },
};

export const PREVENTIVE_KINDS = {
  vacuna: 'Vacuna',
  desparasitacion: 'Desparasitación',
  antipulgas: 'Antipulgas',
  otro: 'Otro',
};

export const PLACE_KINDS = {
  clinica: { label: 'Clínica', color: '#5a33b5' },
  urgencias: { label: 'Urgencias', color: '#d63a4a' },
  farmacia: { label: 'Farmacia', color: '#2f6fd0' },
  independiente: { label: 'Vet independiente', color: '#b26a00' },
};

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// '18:00' -> '6:00 p. m.'
export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

// Hora de un instante en Colombia (los avisos de las clínicas se leen en su hora local)
export const bogotaTime = (iso) => new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' });

// Estado del horario que calcula el servidor en hora de Colombia
export function openText(status, open24h) {
  if (!status || status.open === null) return null;
  if (open24h) return { tone: 'ok', text: 'Abierto 24 horas' };
  if (status.open) return { tone: 'ok', text: status.closes_at ? `Abierto · cierra a las ${formatTime(status.closes_at)}` : 'Abierto' };
  if (!status.opens_at) return { tone: 'neutral', text: 'Cerrado' };
  const { in_days, weekday, time } = status.opens_at;
  const when = in_days === 0 ? 'hoy' : in_days === 1 ? 'mañana' : `el ${WEEKDAYS[weekday].toLowerCase()}`;
  return { tone: 'neutral', text: `Cerrado · abre ${when} a las ${formatTime(time)}` };
}

export const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const placeUrl = (p) => `/clinicas/${p.id}-${slugify(p.name)}`;

// Lista separada por comas -> etiquetas
export const tags = (s) => (s ? s.split(/[,\n]/).map((t) => t.trim()).filter(Boolean) : []);

export const photoUrl = (key) => (key ? `/api/photos/${key}` : null);

// Fecha local en formato YYYY-MM-DD (no UTC)
export function localIso(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

export const todayIso = () => localIso();

export function addToIso(iso, { days = 0, months = 0, years = 0 }) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y + years, m - 1 + months, d + days);
  return localIso(date);
}

// Interpreta 'YYYY-MM-DD' como fecha local (evita el desfase de un día)
const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function formatDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const date = iso.length === 10 ? parseIso(iso) : new Date(iso);
  return date.toLocaleDateString('es-CO', opts);
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function daysUntil(iso) {
  const target = iso.length === 10 ? parseIso(iso) : new Date(iso);
  const start = parseIso(todayIso());
  target.setHours(0, 0, 0, 0);
  return Math.round((target - start) / 86400000);
}

export function relativeDays(n) {
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n > 0) return `en ${n} días`;
  return `hace ${-n} días`;
}

export function age(birthIso) {
  if (!birthIso) return null;
  const birth = parseIso(birthIso);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 1) return 'Menos de 1 mes';
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'año' : 'años'}`;
}

export const formatKg = (kg) => `${Number(kg).toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg`;

export function petSummary(pet) {
  return [pet.breed || SPECIES[pet.species]?.label, age(pet.birth_date), pet.latest_weight && formatKg(pet.latest_weight)]
    .filter(Boolean)
    .join(' · ');
}

// Duración del alimento según el plan nutricional
export function foodStatus(pet) {
  if (!pet.food_bag_kg || !pet.food_daily_g || !pet.food_bag_started_on) return null;
  const totalDays = Math.floor((pet.food_bag_kg * 1000) / pet.food_daily_g);
  const runsOutOn = addToIso(pet.food_bag_started_on, { days: totalDays });
  const left = daysUntil(runsOutOn);
  return { totalDays, runsOutOn, left, pct: Math.max(0, Math.min(1, left / totalDays)) };
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
