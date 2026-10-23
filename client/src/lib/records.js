import { PREVENTIVE_KINDS, daysUntil, todayIso, formatDate, formatDateTime, formatKg, relativeDays } from './format.js';

const VACCINES = {
  perro: ['Rabia', 'Séxtuple (polivalente)', 'Parvovirus', 'Moquillo', 'Bordetella (tos de las perreras)', 'Leptospirosis'],
  gato: ['Rabia', 'Triple felina', 'Leucemia felina'],
};
const PREVENTIVE_SUGGESTIONS = {
  desparasitacion: ['Desparasitación interna', 'Desparasitación externa'],
  antipulgas: ['Pipeta antipulgas', 'Tableta antipulgas', 'Collar antipulgas'],
};

const quickDue = {
  from: 'applied_on',
  options: [
    { label: '+1 mes', add: { months: 1 } },
    { label: '+3 meses', add: { months: 3 } },
    { label: '+6 meses', add: { months: 6 } },
    { label: '+1 año', add: { years: 1 } },
  ],
};

const SEVERITY = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' };
const STATUS = { programada: 'Programada', completada: 'Completada', cancelada: 'Cancelada' };

function dueBadge(next) {
  if (!next) return null;
  const d = daysUntil(next);
  if (d < 0) return { tone: 'danger', text: `Vencida ${relativeDays(d)}` };
  if (d <= 30) return { tone: 'warning', text: `Refuerzo ${relativeDays(d)}` };
  return { tone: 'ok', text: 'Al día' };
}

// Configuración de cada sección de la historia clínica: campos del formulario y cómo se muestra
export const RECORD_TYPES = {
  preventive: {
    title: 'Vacunas y desparasitación',
    short: 'Vacunas',
    icon: 'syringe',
    singular: 'registro preventivo',
    addLabel: 'Registrar aplicación',
    empty: 'Registra vacunas, desparasitaciones y antipulgas para recibir recordatorios de los refuerzos.',
    fields: (pet) => [
      { name: 'kind', label: 'Tipo', type: 'select', options: PREVENTIVE_KINDS, default: 'vacuna', required: true },
      {
        name: 'name',
        label: 'Nombre',
        required: true,
        max: 100,
        placeholder: 'Ej. Rabia',
        suggestions: (v) => (v.kind === 'vacuna' ? VACCINES[pet.species] ?? ['Rabia'] : PREVENTIVE_SUGGESTIONS[v.kind] ?? []),
      },
      { name: 'applied_on', label: 'Fecha de aplicación', type: 'date', required: true, notFuture: true, default: todayIso() },
      { name: 'next_due', label: 'Próximo refuerzo', type: 'date', quick: quickDue, hint: 'Te avisaremos antes de la fecha.' },
      { name: 'vet', label: 'Veterinario o clínica', max: 100, wide: true },
      { name: 'notes', label: 'Notas', type: 'textarea', max: 1000 },
    ],
    view: (r) => ({
      title: r.name,
      subtitle: `${PREVENTIVE_KINDS[r.kind]} · ${formatDate(r.applied_on)}${r.vet ? ` · ${r.vet}` : ''}`,
      meta: r.next_due ? `Próximo: ${formatDate(r.next_due)}` : null,
      badge: dueBadge(r.next_due),
    }),
  },
  allergies: {
    title: 'Alergias',
    short: 'Alergias',
    icon: 'alert',
    singular: 'alergia',
    addLabel: 'Agregar alergia',
    empty: 'Registra alergias a medicamentos o alimentos. Es lo primero que ve un veterinario de urgencias.',
    fields: () => [
      { name: 'allergen', label: 'Alérgeno', required: true, max: 100, placeholder: 'Ej. Cefalexina, pollo…' },
      { name: 'severity', label: 'Severidad', type: 'select', options: SEVERITY, default: 'moderada' },
      { name: 'reaction', label: 'Reacción', max: 300, wide: true, placeholder: 'Ej. Vómito, picazón, inflamación' },
      { name: 'notes', label: 'Notas', type: 'textarea', max: 1000 },
    ],
    view: (r) => ({
      title: r.allergen,
      subtitle: r.reaction,
      badge: { tone: r.severity === 'grave' ? 'danger' : r.severity === 'moderada' ? 'warning' : 'neutral', text: SEVERITY[r.severity] },
    }),
  },
  medications: {
    title: 'Medicamentos',
    short: 'Medicamentos',
    icon: 'pill',
    singular: 'medicamento',
    addLabel: 'Agregar medicamento',
    empty: 'Lleva el control de tratamientos: dosis, frecuencia y duración.',
    fields: () => [
      { name: 'name', label: 'Medicamento', required: true, max: 100, wide: true },
      { name: 'dosage', label: 'Dosis', max: 100, placeholder: 'Ej. 10 mg' },
      { name: 'frequency', label: 'Frecuencia', max: 100, placeholder: 'Ej. Cada 12 horas' },
      { name: 'start_date', label: 'Inicio', type: 'date', required: true, default: todayIso() },
      { name: 'end_date', label: 'Fin', type: 'date', hint: 'Déjalo vacío si es un tratamiento continuo.' },
      { name: 'prescribed_by', label: 'Recetado por', max: 100, wide: true },
      { name: 'notes', label: 'Notas', type: 'textarea', max: 1000 },
    ],
    view: (r) => {
      const ended = r.end_date && daysUntil(r.end_date) < 0;
      const upcoming = daysUntil(r.start_date) > 0;
      return {
        title: r.name,
        subtitle: [r.dosage, r.frequency].filter(Boolean).join(' · ') || null,
        meta: `${formatDate(r.start_date)} → ${r.end_date ? formatDate(r.end_date) : 'continuo'}`,
        badge: ended ? { tone: 'neutral', text: 'Finalizado' } : upcoming ? { tone: 'neutral', text: 'Próximo' } : { tone: 'ok', text: 'En curso' },
      };
    },
  },
  appointments: {
    title: 'Citas y consultas',
    short: 'Citas',
    icon: 'calendar',
    singular: 'cita',
    addLabel: 'Agendar cita',
    empty: 'Guarda tus próximas citas y el resultado de cada consulta.',
    fields: () => [
      { name: 'scheduled_at', label: 'Fecha y hora', type: 'datetime', required: true },
      { name: 'status', label: 'Estado', type: 'select', options: STATUS, default: 'programada' },
      { name: 'reason', label: 'Motivo', required: true, max: 150, wide: true, placeholder: 'Ej. Control anual, vacunación…' },
      { name: 'clinic', label: 'Clínica', max: 150 },
      { name: 'vet', label: 'Veterinario', max: 100 },
      { name: 'diagnosis', label: 'Diagnóstico / resultado', type: 'textarea', max: 2000 },
      { name: 'notes', label: 'Notas', type: 'textarea', max: 2000 },
    ],
    view: (r) => ({
      title: r.reason,
      subtitle: [formatDateTime(r.scheduled_at), r.clinic, r.vet].filter(Boolean).join(' · '),
      meta: r.diagnosis,
      badge:
        r.status === 'programada'
          ? new Date(r.scheduled_at) < new Date()
            ? { tone: 'warning', text: '¿Cómo te fue?' }
            : { tone: 'info', text: 'Programada' }
          : { tone: r.status === 'completada' ? 'ok' : 'neutral', text: STATUS[r.status] },
    }),
  },
  weights: {
    title: 'Peso',
    short: 'Peso',
    icon: 'scale',
    singular: 'peso',
    addLabel: 'Registrar peso',
    empty: 'Registra el peso periódicamente para ver la curva de crecimiento.',
    fields: () => [
      { name: 'weight_kg', label: 'Peso', type: 'number', unit: 'kg', step: '0.01', required: true },
      { name: 'measured_on', label: 'Fecha', type: 'date', required: true, notFuture: true, default: todayIso() },
      { name: 'notes', label: 'Notas', type: 'textarea', max: 500 },
    ],
    view: (r) => ({ title: formatKg(r.weight_kg), subtitle: formatDate(r.measured_on), meta: r.notes }),
  },
};
