import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ErrorState, Spinner } from '../components/States.jsx';
import { PLACE_KINDS } from '../lib/format.js';
import { useFetch } from '../lib/useFetch.js';
import { LinkPetModal } from './ClinicProfile.jsx';

// Destino del enlace o QR de la clínica: el dueño elige sus mascotas y autoriza el acceso
export default function LinkClinic() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useFetch(`/places/intake/${code}`);
  const [open, setOpen] = useState(true);

  if (loading && !data) return <Spinner />;
  if (error && !data) {
    return error.status === 404 ? (
      <div className="page page-narrow">
        <div className="card empty">
          <span className="empty-icon empty-icon-error">
            <Icon name="alert" size={28} />
          </span>
          <h1 className="h3">Código no válido</h1>
          <p>Este enlace de registro ya no funciona. Pide a la clínica su código actual.</p>
        </div>
      </div>
    ) : (
      <ErrorState error={error} onRetry={reload} />
    );
  }

  const { place } = data;
  return (
    <div className="page page-narrow">
      <section className="card empty">
        <span className="empty-icon">
          <Icon name="clinic" size={28} />
        </span>
        <h1 className="h3">{place.name}</h1>
        <p className="muted">
          {PLACE_KINDS[place.kind]?.label} · {[place.address, place.locality].filter(Boolean).join(' · ')}
        </p>
        <p>Te invita a registrar a tu mascota como paciente. Así su equipo verá la historia clínica y registrará vacunas y controles validados.</p>
        <div className="row-actions wrap center-row">
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Icon name="link" size={18} /> Elegir mascotas
          </button>
          <Link className="btn btn-secondary" to="/mascotas/nueva" state={{ returnTo: `/vincular/${code}` }}>
            <Icon name="plus" size={18} /> Crear un perfil nuevo
          </Link>
        </div>
      </section>
      <LinkPetModal place={place} code={code} open={open} onClose={() => setOpen(false)} onLinked={() => navigate('/mascotas')} />
    </div>
  );
}
