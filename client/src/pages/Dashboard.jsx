import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApplyModal } from '../components/FollowUps.jsx';
import Icon from '../components/Icon.jsx';
import PetAvatar from '../components/PetAvatar.jsx';
import { Badge } from '../components/RecordSection.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/States.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { telLink, waLink } from '../lib/contact.js';
import { PREVENTIVE_KINDS, SPECIES, age, daysUntil, formatDate, formatDateTime, greeting, relativeDays, todayIso } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

function buildReminders(r) {
  const items = [
    ...r.preventive.map((p) => ({
      key: `p${p.id}`,
      date: p.next_due,
      icon: 'syringe',
      pet: p,
      title: p.name.toLowerCase().includes(PREVENTIVE_KINDS[p.kind].toLowerCase()) ? p.name : `${PREVENTIVE_KINDS[p.kind]}: ${p.name}`,
      tab: 'vacunas',
      type: 'preventive',
    })),
    ...r.appointments.map((a) => ({
      key: `a${a.id}`,
      date: a.scheduled_at,
      icon: 'calendar',
      pet: a,
      title: a.reason,
      detail: [formatDateTime(a.scheduled_at), a.clinic].filter(Boolean).join(' · '),
      tab: 'citas',
      type: 'appointment',
    })),
    ...r.food.map((f) => ({
      key: `f${f.pet_id}`,
      date: f.runs_out_on,
      icon: 'bowl',
      pet: f,
      title: `Se acaba el alimento${f.food_name ? ` (${f.food_name})` : ''}`,
      tab: 'alimento',
    })),
  ];
  return items
    .map((i) => ({ ...i, days: daysUntil(i.date) }))
    .sort((a, b) => a.days - b.days || String(a.date).localeCompare(String(b.date)));
}

function tone(days) {
  if (days < 0) return 'danger';
  if (days <= 7) return 'warning';
  return 'info';
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(`/dashboard?today=${todayIso()}`);
  const [applying, setApplying] = useState(null);

  const attended = async (r) => {
    try {
      await api.post(`/pets/${r.pet.pet_id}/appointments/${r.pet.id}/status`, { status: 'completada' });
      toast('Cita marcada como atendida');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const reminders = buildReminders(data.reminders);
  const overdue = reminders.filter((r) => r.days < 0).length;
  const firstName = user.name.split(' ')[0];

  return (
    <div className="page">
      <div className="hero">
        <div>
          <p className="hero-kicker">{greeting()},</p>
          <h1>{firstName} 👋</h1>
          <p className="muted">
            {data.pets.length === 0
              ? 'Empecemos creando el perfil de tu mascota.'
              : reminders.length === 0
                ? 'Todo al día. ¡Buen trabajo cuidando a tu familia peluda!'
                : overdue
                  ? `Tienes ${overdue} ${overdue === 1 ? 'pendiente vencido' : 'pendientes vencidos'}.`
                  : `Tienes ${reminders.length} ${reminders.length === 1 ? 'recordatorio' : 'recordatorios'} próximos.`}
          </p>
        </div>
      </div>

      {data.pets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="paw"
            title="Aún no has agregado mascotas"
            action={
              <Link to="/mascotas/nueva" className="btn btn-primary btn-lg">
                <Icon name="plus" /> Agregar mi primera mascota
              </Link>
            }
          >
            Crea su perfil con vacunas, alergias y peso. Tendrás su historia lista para cualquier veterinario.
          </EmptyState>
        </div>
      ) : (
        <div className="dash-grid">
          <section className="card" aria-labelledby="rem-title">
            <div className="card-head">
              <h2 id="rem-title">
                <Icon name="clock" /> Próximos cuidados
              </h2>
            </div>
            {reminders.length === 0 ? (
              <EmptyState icon="check" title="Nada pendiente">
                Cuando registres vacunas con fecha de refuerzo, citas o el plan de alimento, verás aquí los avisos.
              </EmptyState>
            ) : (
              <ul className="reminders">
                {reminders.map((r) => (
                  <li key={r.key} className={`reminder-item reminder-${tone(r.days)}`}>
                    <Link to={`/mascotas/${r.pet.pet_id}?tab=${r.tab}`} className="reminder">
                      <span className="reminder-icon">
                        <Icon name={r.icon} />
                      </span>
                      <span className="reminder-body">
                        <strong>{r.title}</strong>
                        <span className="muted">
                          {SPECIES[r.pet.species]?.emoji} {r.pet.pet_name}
                          {r.detail ? ` · ${r.detail}` : ` · ${formatDate(r.date)}`}
                        </span>
                      </span>
                      <Badge tone={tone(r.days)}>{r.days < 0 ? `Vencido ${relativeDays(r.days)}` : relativeDays(r.days)}</Badge>
                    </Link>
                    {(r.type || r.pet.clinic_phone || r.pet.clinic_whatsapp) && (
                      <div className="reminder-actions">
                        {r.type === 'preventive' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setApplying(r.pet)}>
                            <Icon name="check" size={16} /> Ya se aplicó
                          </button>
                        )}
                        {r.type === 'appointment' && !r.pet.validated && r.days <= 0 && (
                          <button className="btn btn-secondary btn-sm" onClick={() => attended(r)}>
                            <Icon name="check" size={16} /> Asistimos
                          </button>
                        )}
                        {r.pet.clinic_whatsapp && (
                          <a
                            className="btn btn-ghost btn-sm"
                            href={waLink(r.pet.clinic_whatsapp, `Hola, quiero agendar para ${r.pet.pet_name}: ${r.title}.`)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="message" size={16} /> {r.pet.clinic_name}
                          </a>
                        )}
                        {!r.pet.clinic_whatsapp && r.pet.clinic_phone && (
                          <a className="btn btn-ghost btn-sm" href={telLink(r.pet.clinic_phone)}>
                            <Icon name="phone" size={16} /> {r.pet.clinic_name}
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="stack">
            <section className="card" aria-labelledby="pets-title">
              <div className="card-head">
                <h2 id="pets-title">
                  <Icon name="paw" /> Mis mascotas
                </h2>
                <Link to="/mascotas/nueva" className="btn btn-ghost btn-sm">
                  <Icon name="plus" size={18} /> Agregar
                </Link>
              </div>
              <ul className="mini-pets">
                {data.pets.map((p) => (
                  <li key={p.id}>
                    <Link to={`/mascotas/${p.id}`} className="mini-pet">
                      <PetAvatar pet={p} size={44} />
                      <span>
                        <strong>{p.name}</strong>
                        <span className="muted">{[p.breed || SPECIES[p.species].label, age(p.birth_date)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Icon name="chevron" className="muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {data.active_medications.length > 0 && (
              <section className="card" aria-labelledby="meds-title">
                <div className="card-head">
                  <h2 id="meds-title">
                    <Icon name="pill" /> Tratamientos en curso
                  </h2>
                </div>
                <ul className="record-list">
                  {data.active_medications.map((m) => (
                    <li key={m.id} className="record">
                      <div className="record-main">
                        <strong>
                          {m.name} <span className="muted">· {m.pet_name}</span>
                        </strong>
                        <p className="record-sub">
                          {[m.dosage, m.frequency, m.end_date ? `hasta ${formatDate(m.end_date)}` : 'continuo'].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {user.clinics?.length > 0 && (
              <Link to="/clinica" className="card urgent-card clinic-card">
                <span className="urgent-icon">
                  <Icon name="clinic" />
                </span>
                <span>
                  <strong>Panel de {user.clinics[0].name}</strong>
                  <span>Pacientes, seguimientos y perfil de tu clínica</span>
                </span>
                <Icon name="chevron" />
              </Link>
            )}

            <Link to="/cerca?tipo=urgencias" className="card urgent-card">
              <span className="urgent-icon">
                <Icon name="alert" />
              </span>
              <span>
                <strong>¿Una urgencia?</strong>
                <span>Encuentra clínicas 24 horas cerca de ti</span>
              </span>
              <Icon name="chevron" />
            </Link>
          </div>
        </div>
      )}
      <ApplyModal
        pending={applying && { ...applying, place_name: applying.clinic_name ?? '' }}
        pet={applying ? { id: applying.pet_id, species: applying.species } : null}
        onClose={() => setApplying(null)}
        onSaved={() => {
          setApplying(null);
          reload();
        }}
      />
    </div>
  );
}
