import { Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import { EmptyState, ErrorState, Spinner } from '../../components/States.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { PLACE_KINDS, openText } from '../../lib/format.js';
import { useFetch } from '../../lib/useFetch.js';

const TABS = [
  { to: '', label: 'Inicio', icon: 'home', end: true },
  { to: 'pacientes', label: 'Pacientes', icon: 'paw' },
  { to: 'registro', label: 'Registro con QR', short: 'QR', icon: 'qr' },
  { to: 'perfil', label: 'Perfil y horario', short: 'Perfil', icon: 'clinic' },
  { to: 'equipo', label: 'Equipo', icon: 'users' },
  { to: 'resenas', label: 'Reseñas', icon: 'star' },
  { to: 'plan', label: 'Plan', icon: 'card' },
];

// /clinica: lleva a la primera clínica del usuario
export function ClinicIndex() {
  const { user } = useAuth();
  if (user.clinics?.length) return <Navigate to={`/clinica/${user.clinics[0].place_id}`} replace />;
  return (
    <div className="page page-narrow">
      <div className="card">
        <EmptyState icon="clinic" title="Aún no haces parte de una clínica">
          Si eres veterinario o tienes una clínica, escríbenos a hola@kaimi.co para activar tu panel gratis. Si ya trabajas en una clínica aliada, pide a su
          administrador que te agregue con tu correo ({user.email}).
        </EmptyState>
      </div>
    </div>
  );
}

export const useClinic = () => useOutletContext();

export default function ClinicLayout() {
  const { placeId } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/clinics/${placeId}`);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const { place, member } = data;
  const open = openText(place.status, place.open_24h);
  const others = (user.clinics ?? []).filter((c) => String(c.place_id) !== placeId);
  return (
    <div className="page page-wide">
      <header className="clinic-top">
        <div>
          <p className="hero-kicker">Panel de clínica · {member.site_admin ? 'administrador de Kaimi' : member.display_name}</p>
          <h1>{place.name}</h1>
          <div className="place-badges">
            <Badge>{PLACE_KINDS[place.kind]?.label}</Badge>
            {open && <Badge tone={open.tone}>{open.text}</Badge>}
            <Badge tone="info">Plan {data.plan.label}</Badge>
          </div>
        </div>
        {others.length > 0 && (
          <nav className="row-actions wrap" aria-label="Otras clínicas">
            {others.map((c) => (
              <NavLink key={c.place_id} className="btn btn-ghost btn-sm" to={`/clinica/${c.place_id}`}>
                {c.name}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <nav className="tabs" aria-label="Secciones de la clínica">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <Icon name={t.icon} size={18} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ ...data, reload }} />
    </div>
  );
}
