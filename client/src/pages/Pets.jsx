import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/Layout.jsx';
import PetAvatar from '../components/PetAvatar.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/States.jsx';
import { petSummary } from '../lib/format.js';
import { useFetch } from '../lib/useFetch.js';

export default function Pets() {
  const { data, error, loading, reload } = useFetch('/pets');
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="page">
      <PageHeader
        title="Mis mascotas"
        subtitle={data.pets.length ? `${data.pets.length} ${data.pets.length === 1 ? 'mascota' : 'mascotas'}` : null}
        actions={
          data.pets.length > 0 && (
            <Link to="/mascotas/nueva" className="btn btn-primary">
              <Icon name="plus" /> Agregar
            </Link>
          )
        }
      />
      {data.pets.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Aún no has agregado mascotas"
            action={
              <Link to="/mascotas/nueva" className="btn btn-primary btn-lg">
                <Icon name="plus" /> Agregar mascota
              </Link>
            }
          >
            Todo empieza con su perfil: nombre, especie y fecha de nacimiento.
          </EmptyState>
        </div>
      ) : (
        <ul className="pet-grid">
          {data.pets.map((pet) => (
            <li key={pet.id}>
              <Link to={`/mascotas/${pet.id}`} className="card pet-card">
                <PetAvatar pet={pet} size={64} />
                <div className="pet-card-body">
                  <h2>{pet.name}</h2>
                  <p className="muted">{petSummary(pet)}</p>
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
