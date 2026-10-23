import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import PetAvatar from '../components/PetAvatar.jsx';
import ProfileSummary from '../components/ProfileSummary.jsx';
import RecordSection from '../components/RecordSection.jsx';
import ShareModal from '../components/ShareModal.jsx';
import { ErrorState, Spinner } from '../components/States.jsx';
import WeightChart from '../components/WeightChart.jsx';
import { api } from '../lib/api.js';
import { foodStatus, formatDate, petSummary, relativeDays } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: 'heart' },
  { id: 'vacunas', label: 'Vacunas', icon: 'syringe', type: 'preventive' },
  { id: 'alergias', label: 'Alergias', icon: 'alert', type: 'allergies' },
  { id: 'medicamentos', label: 'Medicamentos', icon: 'pill', type: 'medications' },
  { id: 'citas', label: 'Citas', icon: 'calendar', type: 'appointments' },
  { id: 'peso', label: 'Peso', icon: 'scale', type: 'weights' },
  { id: 'alimento', label: 'Alimento', icon: 'bowl' },
];

export default function PetDetail() {
  const { petId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(`/pets/${petId}/profile`);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const { pet } = data;
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  const records = { preventive: data.preventive, allergies: data.allergies, medications: data.medications, appointments: data.appointments, weights: data.weights };

  const removePet = async () => {
    setBusy(true);
    try {
      await api.del(`/pets/${pet.id}`);
      toast(`Se eliminó el perfil de ${pet.name}`);
      navigate('/mascotas', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <Link to="/mascotas" className="back-link">
        <Icon name="back" size={18} /> Mis mascotas
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
        </div>
        <div className="pet-hero-actions">
          <button className="btn btn-primary" onClick={() => setSharing(true)}>
            <Icon name="share" size={18} /> <span>Compartir</span>
          </button>
          <Link to={`/mascotas/${pet.id}/editar`} className="btn btn-secondary">
            <Icon name="edit" size={18} /> <span>Editar</span>
          </Link>
        </div>
      </header>

      <nav className="tabs" aria-label={`Secciones de ${pet.name}`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${t.id === tab.id ? ' active' : ''}`}
            aria-current={t.id === tab.id ? 'page' : undefined}
            onClick={() => setParams(t.id === 'resumen' ? {} : { tab: t.id }, { replace: true })}
          >
            <Icon name={t.icon} size={18} />
            {t.label}
            {t.type && records[t.type].length > 0 && <span className="tab-count">{records[t.type].length}</span>}
          </button>
        ))}
      </nav>

      {tab.id === 'resumen' && (
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>
                <Icon name="heart" /> Perfil 360°
              </h2>
            </div>
            <ProfileSummary profile={data} />
          </section>
          <div className="quick-add">
            {TABS.filter((t) => t.type).map((t) => (
              <button key={t.id} className="quick-tile" onClick={() => setParams({ tab: t.id })}>
                <Icon name={t.icon} />
                <span>{t.label}</span>
                <span className="muted small">{records[t.type].length || 'Sin'} registro{records[t.type].length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-danger-text" onClick={() => setDeleting(true)}>
            <Icon name="trash" size={18} /> Eliminar perfil de {pet.name}
          </button>
        </div>
      )}

      {tab.type && (
        <RecordSection key={tab.type} type={tab.type} pet={pet} records={records[tab.type]} onChange={reload}>
          {tab.type === 'weights' && <WeightChart weights={data.weights} />}
        </RecordSection>
      )}

      {tab.id === 'alimento' && <FoodPanel pet={pet} onChange={reload} />}

      <ShareModal pet={pet} open={sharing} onClose={() => setSharing(false)} />
      <ConfirmModal
        open={deleting}
        title={`¿Eliminar a ${pet.name}?`}
        message="Se borrará su perfil y toda su historia clínica. Esta acción no se puede deshacer."
        busy={busy}
        onConfirm={removePet}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}

function FoodPanel({ pet, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const status = foodStatus(pet);

  const restock = async () => {
    setBusy(true);
    try {
      await api.post(`/pets/${pet.id}/food-restock`);
      toast('¡Listo! Reiniciamos el conteo con la bolsa nueva');
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <Icon name="bowl" /> Plan nutricional
        </h2>
        <Link to={`/mascotas/${pet.id}/editar`} className="btn btn-ghost btn-sm">
          <Icon name="edit" size={18} /> Editar plan
        </Link>
      </div>
      {!status ? (
        <div className="empty">
          <span className="empty-icon">
            <Icon name="bowl" size={28} />
          </span>
          <h3>Configura el plan de alimento</h3>
          <p>Indica el tamaño de la bolsa, la ración diaria y cuándo la abriste. Te avisaremos antes de que se acabe.</p>
          <Link to={`/mascotas/${pet.id}/editar`} className="btn btn-primary">
            Configurar plan
          </Link>
        </div>
      ) : (
        <div className="food">
          <p className="food-name">{pet.food_name || 'Alimento'}</p>
          <div
            className={`meter${status.left <= 3 ? ' meter-danger' : status.left <= 7 ? ' meter-warning' : ''}`}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={status.totalDays}
            aria-valuenow={Math.max(0, status.left)}
            aria-label="Alimento restante"
          >
            <span style={{ width: `${status.pct * 100}%` }} />
          </div>
          <p className="food-left">
            {status.left > 0 ? (
              <>
                <strong>Quedan ~{status.left} días</strong> · se acaba {relativeDays(status.left)} ({formatDate(status.runsOutOn)})
              </>
            ) : (
              <strong className="tone-danger">El alimento ya debería haberse acabado</strong>
            )}
          </p>
          <p className="muted small">
            Bolsa de {Number(pet.food_bag_kg)} kg a {pet.food_daily_g} g/día = {status.totalDays} días. Abierta el {formatDate(pet.food_bag_started_on)}.
          </p>
          <button className="btn btn-primary" onClick={restock} disabled={busy}>
            <Icon name="check" size={18} /> {busy ? 'Guardando…' : 'Compré una bolsa nueva'}
          </button>
        </div>
      )}
    </section>
  );
}
