import { daysUntil, foodStatus, formatDate } from '../lib/format.js';

// Ficha "Perfil 360°": lo esencial que necesita un veterinario de un vistazo
export default function ProfileSummary({ profile }) {
  const { pet, allergies, preventive } = profile;
  const latestVaccines = latestByName(preventive.filter((p) => p.kind === 'vacuna'));
  const overdue = latestVaccines.filter((v) => v.next_due && daysUntil(v.next_due) < 0);
  const lastDeworming = preventive.find((p) => p.kind === 'desparasitacion');
  const food = foodStatus(pet);

  const rows = [
    {
      label: 'Alergias',
      value: allergies.length ? allergies.map((a) => a.allergen).join(', ') : 'Ninguna registrada',
      tone: allergies.length ? 'danger' : 'muted',
    },
    {
      label: 'Vacunas',
      value: latestVaccines.length
        ? `${latestVaccines.map((v) => v.name).join(', ')} ${overdue.length ? `(${overdue.length} vencida${overdue.length > 1 ? 's' : ''})` : '(al día)'}`
        : 'Sin registros',
      tone: !latestVaccines.length ? 'muted' : overdue.length ? 'danger' : 'ok',
    },
    {
      label: 'Última desparasitación',
      value: lastDeworming ? `${lastDeworming.name} · ${formatDate(lastDeworming.applied_on)}` : 'Sin registros',
      tone: lastDeworming ? undefined : 'muted',
    },
    {
      label: 'Plan nutricional',
      value: pet.food_name
        ? `${pet.food_name}${pet.food_bag_kg ? ` ${Number(pet.food_bag_kg)} kg` : ''}${pet.food_daily_g ? ` · ${pet.food_daily_g} g/día` : ''}${food ? ` (ciclo ${food.totalDays} días)` : ''}`
        : 'Sin definir',
      tone: pet.food_name ? undefined : 'muted',
    },
    { label: 'Clínica habitual', value: pet.usual_clinic || 'Sin definir', tone: pet.usual_clinic ? undefined : 'muted' },
    { label: 'Esterilizado', value: pet.sterilized ? 'Sí' : 'No' },
    pet.microchip && { label: 'Microchip', value: pet.microchip },
    pet.color && { label: 'Color / señas', value: pet.color },
  ].filter(Boolean);

  return (
    <dl className="facts">
      {rows.map((r) => (
        <div key={r.label} className="fact">
          <dt>{r.label}</dt>
          <dd className={r.tone ? `tone-${r.tone}` : undefined}>{r.value}</dd>
        </div>
      ))}
      {pet.notes && (
        <div className="fact fact-wide">
          <dt>Notas</dt>
          <dd>{pet.notes}</dd>
        </div>
      )}
    </dl>
  );
}

// La aplicación más reciente de cada vacuna (la lista viene ordenada por fecha descendente)
function latestByName(list) {
  const seen = new Map();
  for (const item of list) {
    const key = item.name.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

