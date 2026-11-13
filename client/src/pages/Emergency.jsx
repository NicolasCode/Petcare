import { useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import PetAvatar from '../components/PetAvatar.jsx';
import { Badge } from '../components/RecordSection.jsx';
import { Spinner } from '../components/States.jsx';
import { telLink, waLink } from '../lib/contact.js';
import { SPECIES, age, formatDate } from '../lib/format.js';
import { useFetch } from '../lib/useFetch.js';

// Lo que ve quien escanea el QR del carné: público y sin cuenta
export default function Emergency() {
  const { token } = useParams();
  const { data, error, loading } = useFetch(`/emergency/${token}`);

  return (
    <div className="shared">
      <header className="shared-top">
        <Logo size={28} />
        <span className="badge badge-danger">
          <Icon name="alert" size={14} /> Carné de emergencia
        </span>
      </header>
      <main className="page page-narrow">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="card empty">
            <span className="empty-icon empty-icon-error">
              <Icon name="alert" size={28} />
            </span>
            <h1 className="h3">Carné no disponible</h1>
            <p>{error.message}</p>
          </div>
        ) : (
          <div className="stack">
            <section className="card emergency-hero">
              <PetAvatar pet={data.pet} size={112} />
              <h1>{data.pet.name}</h1>
              <p className="muted">
                {[SPECIES[data.pet.species]?.label, data.pet.breed, data.pet.sex && (data.pet.sex === 'macho' ? 'Macho' : 'Hembra'), age(data.pet.birth_date), data.pet.color]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {data.pet.microchip && <p className="small">Microchip: {data.pet.microchip}</p>}
              {data.emergency_phone ? (
                <>
                  <p>
                    <strong>¿Encontraste a {data.pet.name}?</strong> Comunícate con {data.owner_first_name ?? 'su familia'}:
                  </p>
                  <div className="row-actions wrap center-row">
                    <a className="btn btn-primary btn-lg" href={telLink(data.emergency_phone)}>
                      <Icon name="phone" size={18} /> Llamar
                    </a>
                    <a className="btn btn-secondary btn-lg" href={waLink(data.emergency_phone, `Hola, encontré a ${data.pet.name}.`)} target="_blank" rel="noreferrer">
                      <Icon name="message" size={18} /> WhatsApp
                    </a>
                  </div>
                </>
              ) : (
                <p className="muted small">La familia de {data.pet.name} no dejó un teléfono público.</p>
              )}
            </section>

            <section className="card">
              <h2 className="card-title">
                <Icon name="alert" /> Alergias
              </h2>
              {data.allergies.length === 0 ? (
                <p className="muted">Ninguna registrada.</p>
              ) : (
                <ul className="record-list">
                  {data.allergies.map((a) => (
                    <li key={a.allergen} className="record">
                      <div className="record-main">
                        <div className="record-title">
                          <strong>{a.allergen}</strong>
                          <Badge tone={a.severity === 'grave' ? 'danger' : a.severity === 'moderada' ? 'warning' : 'neutral'}>{a.severity}</Badge>
                        </div>
                        {a.reaction && <p className="record-sub">{a.reaction}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.active_medications.length > 0 && (
              <section className="card">
                <h2 className="card-title">
                  <Icon name="pill" /> Medicamentos actuales
                </h2>
                <ul className="record-list">
                  {data.active_medications.map((m) => (
                    <li key={m.name} className="record">
                      <div className="record-main">
                        <strong>{m.name}</strong>
                        <p className="record-sub">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card">
              <h2 className="card-title">
                <Icon name="syringe" /> Vacunas
              </h2>
              {data.vaccines.length === 0 ? (
                <p className="muted">Sin registros.</p>
              ) : (
                <ul className="record-list">
                  {data.vaccines.map((v) => (
                    <li key={v.name} className="record">
                      <div className="record-main">
                        <strong>{v.name}</strong>
                        <p className="record-sub">
                          Aplicada el {formatDate(v.applied_on)}
                          {v.next_due ? ` · próxima ${formatDate(v.next_due)}` : ''}
                        </p>
                        <p className={`record-origin${v.validated_at ? ' is-validated' : ''}`}>
                          <Icon name={v.validated_at ? 'shield' : 'user'} size={14} />
                          {v.validated_at ? `Validada por ${v.validated_place_name}` : 'Registrada por el cuidador'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.usual_clinic && (
              <section className="card">
                <h2 className="card-title">
                  <Icon name="clinic" /> Clínica habitual
                </h2>
                <p>{data.usual_clinic}</p>
                {data.usual_clinic_phone && (
                  <a className="btn btn-secondary btn-sm" href={telLink(data.usual_clinic_phone)}>
                    <Icon name="phone" size={16} /> {data.usual_clinic_phone}
                  </a>
                )}
              </section>
            )}
            <p className="small muted center">Información registrada en Kaimi. No reemplaza la valoración de un veterinario.</p>
          </div>
        )}
      </main>
    </div>
  );
}
