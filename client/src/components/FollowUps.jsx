import { useState } from 'react';
import { api } from '../lib/api.js';
import { addToIso, daysUntil, formatDate, formatDateTime, PREVENTIVE_KINDS, relativeDays, todayIso } from '../lib/format.js';
import { isLocked } from '../lib/records.js';
import { useToast } from '../lib/toast.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import { Badge, RecordForm } from './RecordSection.jsx';

// Nueva aplicación con el mismo intervalo que la anterior (p. ej. rabia: +1 año)
export function nextApplication(prev) {
  const today = todayIso();
  const interval = prev.next_due ? Math.round((Date.parse(prev.next_due) - Date.parse(prev.applied_on)) / 86400000) : null;
  return {
    kind: prev.kind,
    name: prev.name,
    applied_on: today,
    next_due: interval > 0 ? addToIso(today, { days: interval }) : '',
    place_name: prev.place_name ?? '',
  };
}

// Registrar que ya se aplicó un refuerzo pendiente (desde el perfil o el inicio)
export function ApplyModal({ pending, pet, onClose, onSaved }) {
  const toast = useToast();
  return (
    <Modal open={pending !== null} onClose={onClose} title={pending ? `Registrar ${pending.name}` : ''}>
      {pending && (
        <RecordForm
          type="preventive"
          pet={pet}
          record={nextApplication(pending)}
          onCancel={onClose}
          onSaved={() => {
            toast('¡Listo! Registramos la aplicación y el próximo refuerzo');
            onSaved();
          }}
        />
      )}
    </Modal>
  );
}

function tone(days) {
  if (days < 0) return 'danger';
  if (days <= 7) return 'warning';
  return 'info';
}

// Seguimiento de la mascota: próximas fechas con su estado y acciones para marcarlas
export default function FollowUps({ profile, onChange }) {
  const toast = useToast();
  const { pet, preventive, appointments } = profile;
  const [applying, setApplying] = useState(null);

  // La aplicación más reciente de cada vacuna o tratamiento (la lista viene de la más nueva a la más vieja)
  const latest = [];
  const seen = new Set();
  for (const p of preventive) {
    const key = `${p.kind}:${p.name.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      latest.push(p);
    }
  }

  // Lo que falta más de 90 días no necesita acción todavía
  const all = [
    ...latest
      .filter((p) => p.next_due && !p.dismissed_at)
      .map((p) => ({ key: `p${p.id}`, kind: 'preventive', record: p, date: p.next_due, title: `${PREVENTIVE_KINDS[p.kind]}: ${p.name}` })),
    ...appointments
      .filter((a) => a.status === 'programada')
      .map((a) => ({ key: `a${a.id}`, kind: 'appointment', record: a, date: a.scheduled_at, title: a.reason })),
  ]
    .map((i) => ({ ...i, days: daysUntil(i.date) }))
    .sort((a, b) => a.days - b.days);
  const pending = all.filter((i) => i.days <= 90);
  const later = all.filter((i) => i.days > 90);

  const since = addToIso(todayIso(), { days: -60 });
  const done = [
    ...appointments
      .filter((a) => a.status !== 'programada' && a.scheduled_at.slice(0, 10) >= since)
      .map((a) => ({ key: `a${a.id}`, date: a.scheduled_at, title: a.reason, text: a.status === 'completada' ? 'Atendida' : 'Cancelada', tone: a.status === 'completada' ? 'ok' : 'neutral' })),
    ...preventive
      .filter((p) => p.applied_on >= since)
      .map((p) => ({ key: `p${p.id}`, date: p.applied_on, title: `${PREVENTIVE_KINDS[p.kind]}: ${p.name}`, text: 'Aplicada', tone: 'ok' })),
    ...latest
      .filter((p) => p.dismissed_at)
      .map((p) => ({ key: `d${p.id}`, date: p.next_due ?? p.applied_on, title: `${PREVENTIVE_KINDS[p.kind]}: ${p.name}`, text: 'No aplica', tone: 'neutral', undo: p })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const act = async (fn, message) => {
    try {
      await fn();
      toast(message);
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const dismiss = (p) => act(() => api.post(`/pets/${pet.id}/preventive/${p.id}/dismiss`), 'Listo, ya no te recordaremos este refuerzo');
  const undoDismiss = (p) => act(() => api.del(`/pets/${pet.id}/preventive/${p.id}/dismiss`), 'Recordatorio reactivado');
  const setStatus = (a, status) =>
    act(() => api.post(`/pets/${pet.id}/appointments/${a.id}/status`, { status }), status === 'completada' ? 'Cita marcada como atendida' : 'Cita cancelada');

  return (
    <section className="card" aria-labelledby="follow-title">
      <div className="card-head">
        <h2 id="follow-title">
          <Icon name="clock" /> Seguimiento
        </h2>
      </div>
      {pending.length === 0 ? (
        <p className="muted">
          {later.length ? 'Nada pendiente en los próximos 3 meses.' : 'No hay refuerzos ni citas pendientes. Registra una vacuna con su próximo refuerzo o agenda una cita.'}
        </p>
      ) : (
        <ul className="follow-list">
          {pending.map((i) => (
            <li key={i.key} className={`follow follow-${tone(i.days)}`}>
              <div className="follow-main">
                <strong>{i.title}</strong>
                <span className="muted small">
                  {i.kind === 'appointment' ? formatDateTime(i.date) : formatDate(i.date)}
                  {i.record.place_name ? ` · ${i.record.place_name}` : ''}
                </span>
              </div>
              <Badge tone={tone(i.days)}>{i.days < 0 ? `Vencido ${relativeDays(i.days)}` : `Pendiente · ${relativeDays(i.days)}`}</Badge>
              <div className="follow-actions">
                {i.kind === 'preventive' ? (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => setApplying(i.record)}>
                      <Icon name="check" size={16} /> Ya se aplicó
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => dismiss(i.record)}>
                      Ya no aplica
                    </button>
                  </>
                ) : isLocked(i.record) ? (
                  <span className="muted small">La clínica la marcará como atendida</span>
                ) : (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => setStatus(i.record, 'completada')}>
                      <Icon name="check" size={16} /> {i.days <= 0 ? 'Asistimos' : 'Marcar atendida'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setStatus(i.record, 'cancelada')}>
                      Cancelar cita
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {later.length > 0 && (
        <p className="muted small follow-later">
          Más adelante: {later.map((i) => `${i.record.name} (${formatDate(i.date.slice(0, 10))})`).join(', ')}.
        </p>
      )}

      {done.length > 0 && (
        <details className="follow-done">
          <summary>Atendidos en los últimos 60 días ({done.length})</summary>
          <ul className="follow-list">
            {done.map((i) => (
              <li key={i.key} className="follow">
                <div className="follow-main">
                  <strong>{i.title}</strong>
                  <span className="muted small">{i.date.length > 10 ? formatDateTime(i.date) : formatDate(i.date)}</span>
                </div>
                <Badge tone={i.tone}>{i.text}</Badge>
                {i.undo && (
                  <div className="follow-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => undoDismiss(i.undo)}>
                      Volver a recordar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ApplyModal
        pending={applying}
        pet={pet}
        onClose={() => setApplying(null)}
        onSaved={() => {
          setApplying(null);
          onChange();
        }}
      />
    </section>
  );
}
