import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import { EmptyState, Spinner } from '../../components/States.jsx';
import { PREVENTIVE_KINDS, SPECIES, daysUntil, formatDate, formatDateTime, relativeDays } from '../../lib/format.js';
import { useFetch } from '../../lib/useFetch.js';
import { useClinic } from './ClinicLayout.jsx';

const tone = (d) => (d < 0 ? 'danger' : d <= 7 ? 'warning' : 'info');

// Correo al dueño con el asunto listo: el seguimiento lo hace la clínica
const mailto = (f) =>
  `mailto:${f.owner_email}?subject=${encodeURIComponent(`${f.name} de ${f.pet_name}`)}&body=${encodeURIComponent(
    `Hola ${f.owner_name.split(' ')[0]}, te escribimos para recordarte que ${f.pet_name} tiene pendiente: ${f.name} (${formatDate(f.next_due)}). ¿Agendamos?`,
  )}`;

export default function ClinicHome() {
  const { place, counts } = useClinic();
  const { data, loading } = useFetch(`/clinics/${place.id}/follow-ups?days=30`);
  const base = `/clinica/${place.id}`;

  return (
    <div className="stack">
      <div className="stat-row">
        <Link to={`${base}/pacientes`} className="card stat">
          <strong>{counts.patients}</strong>
          <span>Pacientes</span>
        </Link>
        <Link to={`${base}/equipo`} className="card stat">
          <strong>{counts.members}</strong>
          <span>En el equipo</span>
        </Link>
        <Link to={`${base}/resenas`} className="card stat">
          <strong>{counts.reviews}</strong>
          <span>Reseñas</span>
        </Link>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>
            <Icon name="clock" /> Próximos seguimientos
          </h2>
          <span className="muted small">Vencidos y próximos 30 días</span>
        </div>
        {loading && !data ? (
          <Spinner />
        ) : data.preventive.length + data.appointments.length === 0 ? (
          <EmptyState icon="check" title="Nada pendiente">
            {counts.patients ? 'Tus pacientes están al día.' : 'Registra a tus primeros pacientes con el QR de la clínica.'}
          </EmptyState>
        ) : (
          <ul className="follow-list">
            {data.appointments.map((a) => {
              const d = daysUntil(a.scheduled_at);
              return (
                <li key={`a${a.id}`} className={`follow follow-${tone(d)}`}>
                  <div className="follow-main">
                    <Link to={`${base}/pacientes/${a.pet_id}?tab=citas`}>
                      <strong>
                        {SPECIES[a.species]?.emoji} {a.pet_name} · {a.reason}
                      </strong>
                    </Link>
                    <span className="muted small">
                      {formatDateTime(a.scheduled_at)} · {a.owner_name}
                      {a.vet ? ` · ${a.vet}` : ''}
                    </span>
                  </div>
                  <Badge tone={d < 0 ? 'warning' : 'info'}>{d < 0 ? 'Cita sin cerrar' : `Cita ${relativeDays(d)}`}</Badge>
                </li>
              );
            })}
            {data.preventive.map((f) => {
              const d = daysUntil(f.next_due);
              return (
                <li key={`p${f.id}`} className={`follow follow-${tone(d)}`}>
                  <div className="follow-main">
                    <Link to={`${base}/pacientes/${f.pet_id}?tab=vacunas`}>
                      <strong>
                        {SPECIES[f.species]?.emoji} {f.pet_name} · {PREVENTIVE_KINDS[f.kind]}: {f.name}
                      </strong>
                    </Link>
                    <span className="muted small">
                      {formatDate(f.next_due)} · {f.owner_name}
                    </span>
                  </div>
                  <Badge tone={tone(d)}>{d < 0 ? `Vencido ${relativeDays(d)}` : relativeDays(d)}</Badge>
                  <div className="follow-actions">
                    <a className="btn btn-ghost btn-sm" href={mailto(f)}>
                      <Icon name="message" size={16} /> Escribir al dueño
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
