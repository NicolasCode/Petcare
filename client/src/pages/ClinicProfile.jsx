import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ContactButtons from '../components/ContactButtons.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { ConsentText } from '../components/PetPanels.jsx';
import PublicShell from '../components/PublicShell.jsx';
import RequestAppointment from '../components/RequestAppointment.jsx';
import { Badge } from '../components/RecordSection.jsx';
import Stars, { RatingSummary } from '../components/Stars.jsx';
import { ErrorState, Spinner } from '../components/States.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { PLACE_KINDS, SPECIES, WEEKDAYS, formatDate, formatTime, bogotaTime, openText, placeUrl, tags } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

// Lunes primero, como se lee un horario en Colombia
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function Tags({ title, value }) {
  const list = tags(value);
  if (!list.length) return null;
  return (
    <div>
      <h3 className="subhead">{title}</h3>
      <div className="tag-row">
        {list.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// Perfil público de una clínica o veterinario: se puede ver y compartir sin cuenta
export default function ClinicProfile() {
  const { slug } = useParams();
  const placeId = parseInt(slug, 10);
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(placeId ? `/places/${placeId}` : null);
  const [linking, setLinking] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (data?.place) document.title = `${data.place.name} · Kaimi`;
    return () => {
      document.title = 'Kaimi';
    };
  }, [data]);

  let body;
  if (loading && !data) body = <Spinner />;
  else if (error && !data) body = <ErrorState error={error} onRetry={reload} />;
  else {
    const { place: p, reviews } = data;
    const open = openText(p.status, p.open_24h);
    body = (
      <div className="stack">
        <section className="card clinic-hero">
          <div className="place-badges">
            <Badge tone={p.kind === 'urgencias' ? 'danger' : 'neutral'}>{PLACE_KINDS[p.kind].label}</Badge>
            {open && <Badge tone={open.tone}>{open.text}</Badge>}
            {p.home_visits && <Badge tone="info">A domicilio</Badge>}
            {p.on_kaimi && (
              <Badge tone="info">
                <Icon name="shield" size={12} /> Aliada Kaimi
              </Badge>
            )}
          </div>
          <h1>{p.name}</h1>
          {p.available_until && (
            <p className="available-line">
              <span className="availability-dot" aria-hidden="true" />
              <strong>Veterinario disponible ahora</strong> · hasta las{' '}
              {bogotaTime(p.available_until)}
              {p.available_note && <span className="muted"> · {p.available_note}</span>}
            </p>
          )}
          <p className="muted">{[p.address, p.locality, p.city].filter(Boolean).join(' · ')}</p>
          <RatingSummary avg={p.rating_avg} count={p.rating_count} />
          {p.description && <p>{p.description}</p>}
          <ContactButtons phone={p.phone} whatsapp={p.whatsapp} lat={p.lat} lng={p.lng} size="md" message="Hola, los encontré en Kaimi. " />
          <div className="row-actions wrap">
            {p.website && (
              <a className="btn btn-ghost btn-sm" href={p.website} target="_blank" rel="noreferrer">
                <Icon name="external" size={16} /> Sitio web
              </a>
            )}
            {p.email && (
              <a className="btn btn-ghost btn-sm" href={`mailto:${p.email}`}>
                <Icon name="message" size={16} /> {p.email}
              </a>
            )}
            {p.on_kaimi && user && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => setRequesting(true)}>
                  <Icon name="calendar" size={16} /> Pedir cita
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setLinking(true)}>
                  <Icon name="link" size={16} /> Vincular a mi mascota
                </button>
              </>
            )}
            {p.on_kaimi && !user && (
              <Link className="btn btn-primary btn-sm" to="/ingresar" state={{ from: placeUrl(p) }}>
                <Icon name="calendar" size={16} /> Ingresa para pedir cita
              </Link>
            )}
          </div>
          {!p.on_kaimi && p.kind !== 'farmacia' && (
            <p className="small muted">
              ¿Trabajas aquí? <Link to={`/registrar-clinica?lugar=${p.id}`}>Reclama este perfil</Link> para editarlo, recibir pacientes y solicitudes de cita.
            </p>
          )}
        </section>

        <div className="profile-grid">
          <section className="card">
            <div className="card-head">
              <h2>
                <Icon name="clock" /> Horario
              </h2>
            </div>
            {p.open_24h ? (
              <p>Abierto las 24 horas, todos los días.</p>
            ) : p.hours.length === 0 ? (
              <p className="muted">La clínica aún no ha publicado su horario. Llama antes de ir.</p>
            ) : (
              <table className="hours-table">
                <tbody>
                  {WEEK.map((d) => {
                    const slots = p.hours.filter((h) => h.weekday === d);
                    return (
                      <tr key={d}>
                        <th scope="row">{WEEKDAYS[d]}</th>
                        <td>{slots.length ? slots.map((h) => `${formatTime(h.opens)} – ${formatTime(h.closes)}`).join(', ') : <span className="muted">Cerrado</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="card stack">
            <div className="card-head">
              <h2>
                <Icon name="stethoscope" /> Servicios
              </h2>
            </div>
            {p.services ? <p>{p.services}</p> : <p className="muted">Sin información de servicios.</p>}
            <Tags title="Especialidades" value={p.specialties} />
            <Tags title="Equipos" value={p.equipment} />
          </section>
        </div>

        {p.vets.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h2>
                <Icon name="users" /> Veterinarios
              </h2>
            </div>
            <ul className="link-list">
              {p.vets.map((v) => (
                <li key={v.display_name}>
                  <span>
                    <strong>{v.display_name}</strong>
                    <span className="muted small">{[v.specialty, v.professional_card && `Tarjeta profesional ${v.professional_card}`].filter(Boolean).join(' · ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h2>
              <Icon name="star" /> Reseñas verificadas
            </h2>
          </div>
          <p className="muted small section-note">
            Solo pueden opinar dueños cuya consulta registró la propia clínica en Kaimi. Las calificaciones no cambian el orden del directorio.
          </p>
          {reviews.length === 0 ? (
            <p className="muted">Aún no hay reseñas.</p>
          ) : (
            <ul className="reviews">
              {reviews.map((r) => (
                <li key={r.id} className="review">
                  <div className="review-head">
                    <Stars value={r.rating} />
                    <strong>
                      {r.author} {SPECIES[r.species]?.emoji}
                    </strong>
                    <span className="muted small">{formatDate(r.created_at.slice(0, 10))}</span>
                    <Badge tone="ok">
                      <Icon name="check" size={12} /> Visita verificada
                    </Badge>
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  {r.reply && (
                    <p className="review-reply">
                      <strong>Respuesta de la clínica:</strong> {r.reply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <LinkPetModal place={p} open={linking} onClose={() => setLinking(false)} />
        {requesting && <RequestAppointment place={p} open onClose={() => setRequesting(false)} />}
      </div>
    );
  }

  // Con sesión se ve dentro de la app; sin sesión, con la cabecera pública
  return user ? (
    <div className="page">
      <Link to="/cerca" className="back-link">
        <Icon name="back" size={18} /> Cerca de mí
      </Link>
      {body}
    </div>
  ) : (
    <PublicShell>
      <div className="page">
        <Link to="/directorio" className="back-link">
          <Icon name="back" size={18} /> Directorio
        </Link>
        {body}
      </div>
    </PublicShell>
  );
}

// El dueño elige qué mascotas vincular y autoriza el acceso
export function LinkPetModal({ place, code, open, onClose, onLinked }) {
  const toast = useToast();
  const { data } = useFetch(open ? '/pets' : null);
  const [selected, setSelected] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const pets = (data?.pets ?? []).filter((p) => p.access_role === 'dueno');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Con el código de la clínica (enlace o QR) el vínculo queda registrado como alta por la clínica
      for (const id of selected) await api.post(`/pets/${id}/clinics`, { ...(code ? { code } : { place_id: place.id }), consent: true });
      toast(selected.length === 1 ? 'Mascota vinculada' : 'Mascotas vinculadas');
      onClose();
      onLinked?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Vincular con ${place.name}`}>
      <form onSubmit={submit} className="stack" noValidate>
        {pets.length === 0 ? (
          <p className="muted">
            Aún no tienes mascotas. <Link to="/mascotas/nueva">Crea su perfil</Link> y vuelve aquí.
          </p>
        ) : (
          <fieldset className="pick-list">
            <legend className="small muted">¿Qué mascotas atiende esta clínica?</legend>
            {pets.map((p) => (
              <label key={p.id} className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                />
                <span>
                  {SPECIES[p.species]?.emoji} {p.name}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <ConsentText pet={selected.length === 1 ? pets.find((p) => p.id === selected[0]) : null} clinicName={place.name} checked={consent} onChange={setConsent} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !consent || !selected.length}>
            {busy ? 'Vinculando…' : 'Autorizar y vincular'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
