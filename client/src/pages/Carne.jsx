import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Field } from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import PetAvatar from '../components/PetAvatar.jsx';
import QrCode from '../components/QrCode.jsx';
import { ErrorState, Spinner } from '../components/States.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { SPECIES, age, formatDate } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

const emergencyUrl = (token) => `${window.location.origin}/e/${token}`;

// Última aplicación de cada vacuna (la lista viene de la más reciente a la más antigua)
function latestVaccines(preventive) {
  const seen = new Map();
  for (const p of preventive.filter((x) => x.kind === 'vacuna')) {
    const key = p.name.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

// Carné digital de Kaimi: se ve en el celular, se imprime y lleva un QR de emergencia
export default function Carne() {
  const { petId } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/pets/${petId}/profile`);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const { pet, allergies, preventive } = data;
  const isOwner = data.access_role === 'dueno';
  const vaccines = latestVaccines(preventive);
  const history = preventive.filter((p) => p.kind === 'vacuna');
  const deworming = preventive.find((p) => p.kind === 'desparasitacion');
  const facts = [
    ['Especie', SPECIES[pet.species]?.label],
    ['Raza', pet.breed],
    ['Sexo', pet.sex && (pet.sex === 'macho' ? 'Macho' : 'Hembra')],
    ['Nacimiento', pet.birth_date && `${formatDate(pet.birth_date)} (${age(pet.birth_date)})`],
    ['Color / señas', pet.color],
    ['Esterilizado', pet.sterilized ? 'Sí' : 'No'],
    ['Microchip', pet.microchip],
    ['Clínica habitual', pet.usual_place_name ?? pet.usual_clinic],
  ].filter(([, v]) => v);

  return (
    <div className="page carne-page">
      <div className="no-print">
        <Link to={`/mascotas/${pet.id}`} className="back-link">
          <Icon name="back" size={18} /> {pet.name}
        </Link>
      </div>

      <article className="carne" aria-label={`Carné de salud de ${pet.name}`}>
        <header className="carne-top">
          <Logo size={24} />
          <span>Carné de salud</span>
        </header>
        <div className="carne-id">
          <PetAvatar pet={pet} size={96} />
          <div>
            <h1>{pet.name}</h1>
            {isOwner && <p className="muted small">Tutor: {user.name}</p>}
          </div>
          {pet.emergency_token && (
            <figure className="carne-qr">
              <QrCode value={emergencyUrl(pet.emergency_token)} size={96} label="Código QR de emergencia" />
              <figcaption>Emergencia</figcaption>
            </figure>
          )}
        </div>
        <dl className="carne-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <section className={`carne-allergies${allergies.length ? ' has-allergies' : ''}`}>
          <h2>
            <Icon name="alert" size={16} /> Alergias
          </h2>
          <p>{allergies.length ? allergies.map((a) => `${a.allergen} (${a.severity})`).join(', ') : 'Ninguna registrada'}</p>
        </section>

        <section>
          <h2>
            <Icon name="syringe" size={16} /> Vacunas
          </h2>
          {history.length === 0 ? (
            <p className="muted">Sin vacunas registradas.</p>
          ) : (
            <div className="table-wrap">
              <table className="carne-table">
                <thead>
                  <tr>
                    <th>Vacuna</th>
                    <th>Aplicada</th>
                    <th>Lote · vence</th>
                    <th>Próxima</th>
                    <th>Respaldo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((v) => (
                    <tr key={v.id} className={vaccines.includes(v) ? undefined : 'is-old'}>
                      <td>
                        <strong>{v.name}</strong>
                      </td>
                      <td>{formatDate(v.applied_on)}</td>
                      <td>{[v.lot, v.product_expires_on && formatDate(v.product_expires_on)].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{vaccines.includes(v) && v.next_due ? formatDate(v.next_due) : '—'}</td>
                      <td>
                        {v.validated_at ? (
                          <span className="carne-valid">
                            <Icon name="shield" size={14} /> {v.validated_place_name}
                            {v.validated_by_name && <span className="muted"> · {[v.validated_by_name, v.validated_by_card].filter(Boolean).join(' · ')}</span>}
                          </span>
                        ) : (
                          <span className="muted">Cuidador{v.vet ? ` · ${v.vet}` : ''}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {deworming && (
            <p className="small">
              <strong>Última desparasitación:</strong> {deworming.name} · {formatDate(deworming.applied_on)}
              {deworming.next_due ? ` · próxima ${formatDate(deworming.next_due)}` : ''}
            </p>
          )}
        </section>
        <footer className="carne-foot">
          <span>
            <Icon name="shield" size={12} /> Validado por clínica · <Icon name="user" size={12} /> Registrado por el cuidador
          </span>
          <span>Generado en Kaimi el {formatDate(new Date().toISOString().slice(0, 10))}</span>
        </footer>
      </article>

      <div className="no-print stack">
        <button className="btn btn-primary btn-block" onClick={() => window.print()}>
          <Icon name="printer" size={18} /> Imprimir o guardar como PDF
        </button>
        {isOwner ? <EmergencySettings pet={pet} onChange={reload} /> : null}
      </div>
    </div>
  );
}

// Enlace permanente del QR: datos mínimos para una urgencia o si la mascota se pierde
function EmergencySettings({ pet, onChange }) {
  const toast = useToast();
  const [phone, setPhone] = useState(pet.emergency_phone ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (body, message) => {
    setBusy(true);
    try {
      await api.put(`/pets/${pet.id}/emergency`, { phone, ...body });
      toast(message);
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
          <Icon name="qr" /> QR de emergencia
        </h2>
      </div>
      <p className="muted">
        Quien escanee el QR del carné (o de una placa en el collar) verá el nombre y la foto de {pet.name}, sus alergias, medicamentos y vacunas, y el
        teléfono que pongas aquí. No muestra tu correo ni la historia completa.
      </p>
      <Field label="Teléfono de contacto" hint="Opcional. Si se pierde, es lo que más ayuda." optional>
        {(p) => <input type="tel" inputMode="tel" {...p} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej. 300 123 4567" />}
      </Field>
      <div className="row-actions wrap">
        {pet.emergency_token ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => save({ enabled: true }, 'Teléfono guardado')}>
              Guardar
            </button>
            <a className="btn btn-secondary" href={emergencyUrl(pet.emergency_token)} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /> Ver lo que se muestra
            </a>
            <button className="btn btn-ghost" disabled={busy} onClick={() => save({ enabled: true, rotate: true }, 'QR nuevo generado: el anterior ya no funciona')}>
              Generar QR nuevo
            </button>
            <button className="btn btn-ghost btn-danger-text" disabled={busy} onClick={() => save({ enabled: false }, 'QR desactivado')}>
              Desactivar
            </button>
          </>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => save({ enabled: true }, 'QR activado')}>
            <Icon name="qr" size={18} /> Activar QR de emergencia
          </button>
        )}
      </div>
    </section>
  );
}
