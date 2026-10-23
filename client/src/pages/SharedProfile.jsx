import { useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import PetAvatar from '../components/PetAvatar.jsx';
import ProfileSummary from '../components/ProfileSummary.jsx';
import { RecordItem } from '../components/RecordSection.jsx';
import { Spinner } from '../components/States.jsx';
import WeightChart from '../components/WeightChart.jsx';
import { SPECIES, formatDate, formatDateTime, petSummary } from '../lib/format.js';
import { RECORD_TYPES } from '../lib/records.js';
import { useFetch } from '../lib/useFetch.js';

const SECTIONS = ['allergies', 'preventive', 'medications', 'appointments', 'weights'];

// Vista de solo lectura para el veterinario (no requiere cuenta)
export default function SharedProfile() {
  const { token } = useParams();
  const { data, error, loading } = useFetch(`/shared/${token}`);

  return (
    <div className="shared">
      <header className="shared-top">
        <Logo size={28} />
        <span className="badge badge-info">
          <Icon name="shield" size={14} /> Historia compartida · solo lectura
        </span>
      </header>
      <main className="page">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="card empty">
            <span className="empty-icon empty-icon-error">
              <Icon name="alert" size={28} />
            </span>
            <h1 className="h3">Enlace no disponible</h1>
            <p>{error.message}</p>
          </div>
        ) : (
          <div className="stack">
            <section className="pet-hero card">
              <PetAvatar pet={data.pet} size={72} />
              <div className="pet-hero-body">
                <h1>{data.pet.name}</h1>
                <p className="muted">
                  {SPECIES[data.pet.species]?.label} · {petSummary(data.pet)}
                  {data.pet.sex ? ` · ${data.pet.sex === 'macho' ? 'Macho' : 'Hembra'}` : ''}
                  {data.pet.birth_date ? ` · Nació el ${formatDate(data.pet.birth_date)}` : ''}
                </p>
                <p className="small muted">
                  Propietario: {data.owner_name} · Acceso válido hasta {formatDateTime(data.expires_at)}
                </p>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>
                  <Icon name="heart" /> Perfil 360°
                </h2>
              </div>
              <ProfileSummary profile={data} />
            </section>

            {SECTIONS.map((type) => {
              const config = RECORD_TYPES[type];
              const records = data[type];
              return (
                <section key={type} className="card">
                  <div className="card-head">
                    <h2>
                      <Icon name={config.icon} /> {config.title}
                    </h2>
                  </div>
                  {type === 'weights' && <WeightChart weights={records} />}
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
            })}
            <p className="small muted center">
              Información registrada por el propietario en KuraPet. No reemplaza la valoración clínica presencial.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
