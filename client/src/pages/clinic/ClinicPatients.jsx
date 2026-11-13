import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import PetAvatar from '../../components/PetAvatar.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import { EmptyState, ErrorState, Spinner } from '../../components/States.jsx';
import { SPECIES, age, formatDate } from '../../lib/format.js';
import { useFetch } from '../../lib/useFetch.js';
import { useClinic } from './ClinicLayout.jsx';

export default function ClinicPatients() {
  const { place } = useClinic();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useFetch(`/clinics/${place.id}/patients${search ? `?q=${encodeURIComponent(search)}` : ''}`);

  return (
    <div className="stack">
      <div className="filters">
        <div className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Buscar por mascota, dueño o microchip" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pacientes" />
        </div>
        <Link className="btn btn-primary" to={`/clinica/${place.id}/registro`}>
          <Icon name="qr" size={18} /> Registrar paciente
        </Link>
      </div>
      {loading && !data ? (
        <Spinner />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.patients.length === 0 ? (
        <div className="card">
          <EmptyState icon="paw" title={search ? 'Sin resultados' : 'Aún no hay pacientes'}>
            {search
              ? 'Prueba con otro nombre.'
              : 'Los dueños registran a sus mascotas escaneando el QR de la clínica o con su enlace, y autorizan el acceso a la historia.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="pet-grid">
          {data.patients.map((p) => (
            <li key={p.id}>
              <Link to={`/clinica/${place.id}/pacientes/${p.id}`} className="card pet-card">
                <PetAvatar pet={p} size={56} />
                <div className="pet-card-body">
                  <h2>{p.name}</h2>
                  <p className="muted small">{[p.breed || SPECIES[p.species]?.label, age(p.birth_date), p.owner_name].filter(Boolean).join(' · ')}</p>
                  <div className="place-badges">
                    {p.severe_allergy && <Badge tone="danger">Alergia grave</Badge>}
                    {p.next_due && <Badge tone={p.overdue ? 'danger' : 'neutral'}>{p.overdue ? 'Refuerzo vencido' : `Próximo: ${formatDate(p.next_due)}`}</Badge>}
                    {p.last_visit && <span className="muted small">Última visita {formatDate(p.last_visit.slice(0, 10))}</span>}
                  </div>
                </div>
                <Icon name="chevron" className="muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
