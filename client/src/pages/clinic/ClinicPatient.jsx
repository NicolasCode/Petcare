import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import PetAvatar from '../../components/PetAvatar.jsx';
import ProfileSummary from '../../components/ProfileSummary.jsx';
import RecordSection, { RecordItem } from '../../components/RecordSection.jsx';
import { ErrorState, Spinner } from '../../components/States.jsx';
import WeightChart from '../../components/WeightChart.jsx';
import { formatDate, petSummary } from '../../lib/format.js';
import { RECORD_TYPES } from '../../lib/records.js';
import { useFetch } from '../../lib/useFetch.js';
import { useClinic } from './ClinicLayout.jsx';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: 'heart' },
  { id: 'vacunas', label: 'Vacunas', icon: 'syringe', type: 'preventive' },
  { id: 'alergias', label: 'Alergias', icon: 'alert', type: 'allergies' },
  { id: 'medicamentos', label: 'Medicamentos', icon: 'pill', type: 'medications' },
  { id: 'citas', label: 'Consultas', icon: 'calendar', type: 'appointments' },
  { id: 'peso', label: 'Peso', icon: 'scale', type: 'weights' },
];

// Historia del paciente vista por la clínica: registra y valida, no borra
export default function ClinicPatient() {
  const { place, member } = useClinic();
  const { petId } = useParams();
  const [params, setParams] = useSearchParams();
  const base = `/clinics/${place.id}/patients/${petId}`;
  const { data, error, loading, reload } = useFetch(base);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const { pet, link } = data;
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  const canRecord = !member.site_admin && member.role !== 'staff';

  return (
    <div className="stack">
      <Link to={`/clinica/${place.id}/pacientes`} className="back-link">
        <Icon name="back" size={18} /> Pacientes
      </Link>
      <header className="pet-hero card">
        <PetAvatar pet={pet} size={72} />
        <div className="pet-hero-body">
          <h1>{pet.name}</h1>
          <p className="muted">{petSummary(pet)}</p>
          {data.allergies.length > 0 && (
            <p className="allergy-flag">
              <Icon name="alert" size={16} /> Alergia: {data.allergies.map((a) => a.allergen).join(', ')}
            </p>
          )}
          <p className="small muted">
            Dueño/a: {link.owner_name} · <a href={`mailto:${link.owner_email}`}>{link.owner_email}</a> · autorizó el {formatDate(link.consented_at.slice(0, 10))}
          </p>
        </div>
      </header>
      <nav className="tabs" aria-label={`Historia de ${pet.name}`}>
        {TABS.map((t) => (
          <button key={t.id} className={`tab${t.id === tab.id ? ' active' : ''}`} onClick={() => setParams(t.id === 'resumen' ? {} : { tab: t.id }, { replace: true })}>
            <Icon name={t.icon} size={18} />
            {t.label}
            {t.type && data[t.type].length > 0 && <span className="tab-count">{data[t.type].length}</span>}
          </button>
        ))}
      </nav>
      {tab.id === 'resumen' && (
        <section className="card">
          <div className="card-head">
            <h2>
              <Icon name="heart" /> Perfil 360°
            </h2>
          </div>
          <ProfileSummary profile={data} />
        </section>
      )}
      {tab.type &&
        (canRecord ? (
          <RecordSection key={tab.type} type={tab.type} pet={pet} records={data[tab.type]} onChange={reload} mode="clinic" base={base} placeId={place.id}>
            {tab.type === 'weights' && <WeightChart weights={data.weights} />}
          </RecordSection>
        ) : (
          <ReadOnlySection type={tab.type} records={data[tab.type]} weights={data.weights} />
        ))}
    </div>
  );
}

// Recepción (staff) consulta la historia pero no registra ni valida
function ReadOnlySection({ type, records, weights }) {
  const config = RECORD_TYPES[type];
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <Icon name={config.icon} /> {config.title}
        </h2>
      </div>
      <p className="muted small section-note">Solo los veterinarios del equipo pueden registrar o validar.</p>
      {type === 'weights' && <WeightChart weights={weights} />}
      {records.length === 0 ? (
        <p className="muted">Sin registros.</p>
      ) : (
        <ul className="record-list">
          {records.map((r) => (
            <RecordItem key={r.id} view={config.view(r)} />
          ))}
        </ul>
      )}
    </section>
  );
}
