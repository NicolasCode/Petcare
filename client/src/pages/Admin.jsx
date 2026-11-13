import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Field, FormError } from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { Badge } from '../components/RecordSection.jsx';
import Stars from '../components/Stars.jsx';
import { EmptyState, Spinner } from '../components/States.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { PLACE_KINDS, formatDate, placeUrl } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

const TABS = [
  { id: 'solicitudes', label: 'Solicitudes', icon: 'clinic' },
  { id: 'planes', label: 'Planes', icon: 'card' },
  { id: 'lugares', label: 'Lugares', icon: 'map' },
  { id: 'resenas', label: 'Reseñas', icon: 'star' },
];

// Administración de Kaimi: solo correos en ADMIN_EMAILS
export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('solicitudes');
  const { data: overview, reload } = useFetch(user.is_admin ? '/admin/overview' : null);
  if (!user.is_admin) return <Navigate to="/" replace />;

  return (
    <div className="page page-wide">
      <PageHeader title="Administración" subtitle="Clínicas, planes y moderación del directorio." />
      {overview && (
        <div className="stat-row stat-row-4">
          {[
            [overview.users, 'Usuarios'],
            [overview.pets, 'Mascotas'],
            [overview.clinics, 'Clínicas con panel'],
            [overview.patients, 'Pacientes vinculados'],
          ].map(([n, label]) => (
            <div key={label} className="card stat">
              <strong>{n}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <nav className="tabs" aria-label="Secciones de administración">
        {TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={18} />
            {t.label}
            {t.id === 'solicitudes' && overview?.pending_places > 0 && <span className="tab-count tab-count-alert">{overview.pending_places}</span>}
            {t.id === 'planes' && overview?.pending_plans > 0 && <span className="tab-count tab-count-alert">{overview.pending_plans}</span>}
          </button>
        ))}
      </nav>
      {tab === 'solicitudes' && <PlaceRequests onChange={reload} />}
      {tab === 'planes' && <PlanRequests onChange={reload} />}
      {tab === 'lugares' && <Places />}
      {tab === 'resenas' && <Reviews />}
    </div>
  );
}

function PlaceRequests({ onChange }) {
  const toast = useToast();
  const [status, setStatus] = useState('pendiente');
  const { data, reload } = useFetch(`/admin/place-requests?status=${status}`);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const done = (msg) => {
    toast(msg);
    setApproving(null);
    setRejecting(null);
    reload();
    onChange();
  };
  return (
    <section className="card">
      <div className="chips" role="group" aria-label="Estado">
        {['pendiente', 'aprobada', 'rechazada'].map((s) => (
          <button key={s} className={`chip${status === s ? ' active' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === 'pendiente' ? 'Pendientes' : s === 'aprobada' ? 'Aprobadas' : 'Rechazadas'}
          </button>
        ))}
      </div>
      {!data ? (
        <Spinner />
      ) : data.requests.length === 0 ? (
        <EmptyState icon="check" title="Nada por revisar" />
      ) : (
        <ul className="follow-list">
          {data.requests.map((r) => (
            <li key={r.id} className="follow follow-info">
              <div className="follow-main">
                <strong>
                  {r.name} <Badge>{PLACE_KINDS[r.kind]?.label}</Badge>
                  {r.existing_place_name && <Badge tone="info">Reclama un lugar existente</Badge>}
                </strong>
                <span className="muted small">
                  {r.display_name}
                  {r.professional_card ? ` · Tarjeta ${r.professional_card}` : ' · sin tarjeta profesional'} · {r.user_email}
                </span>
                <span className="muted small">
                  {[r.address, r.locality, r.city, r.phone && `Tel. ${r.phone}`, r.lat != null && `${r.lat}, ${r.lng}`].filter(Boolean).join(' · ')}
                </span>
                {r.message && <span className="small">“{r.message}”</span>}
                <span className="muted small">Enviada el {formatDate(r.created_at.slice(0, 10))}</span>
              </div>
              {r.status === 'pendiente' ? (
                <div className="follow-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => setApproving(r)}>
                    <Icon name="check" size={16} /> Aprobar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(r)}>
                    Rechazar
                  </button>
                </div>
              ) : (
                r.place_id && (
                  <div className="follow-actions">
                    <Link className="btn btn-ghost btn-sm" to={`/clinica/${r.place_id}`}>
                      Ver panel
                    </Link>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={approving !== null} onClose={() => setApproving(null)} title="Aprobar solicitud">
        {approving && <ApproveForm request={approving} onCancel={() => setApproving(null)} onDone={() => done(`${approving.name} ya tiene su panel`)} />}
      </Modal>
      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Rechazar solicitud">
        {rejecting && <RejectForm request={rejecting} onCancel={() => setRejecting(null)} onDone={() => done('Solicitud rechazada')} />}
      </Modal>
    </section>
  );
}

function ApproveForm({ request, onCancel, onDone }) {
  const [coords, setCoords] = useState(request.lat != null ? `${request.lat}, ${request.lng}` : '');
  const [plan, setPlan] = useState('gratis');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const body = { plan };
    if (!request.existing_place_id) {
      const [lat, lng] = coords.split(',').map((n) => Number(n.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setError('Escribe las coordenadas como “latitud, longitud”');
      Object.assign(body, { lat, lng });
    }
    setBusy(true);
    try {
      await api.post(`/admin/place-requests/${request.id}/approve`, body);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <p className="muted">
        {request.existing_place_name
          ? `${request.display_name} quedará como administrador de ${request.existing_place_name}.`
          : `Se creará ${request.name} en el directorio y ${request.display_name} quedará como administrador.`}{' '}
        Verifica la tarjeta profesional antes de aprobar.
      </p>
      <FormError error={error} />
      {!request.existing_place_id && (
        <Field label="Coordenadas" hint="Clic derecho en Google Maps → copiar coordenadas.">
          {(p) => <input {...p} value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="4.6765, -74.0480" />}
        </Field>
      )}
      <Field label="Plan inicial">
        {(p) => (
          <select {...p} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="gratis">Gratis</option>
            <option value="pro">Pro (clínica fundadora)</option>
          </select>
        )}
      </Field>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Aprobando…' : 'Aprobar y crear panel'}
        </button>
      </div>
    </form>
  );
}

function RejectForm({ request, onCancel, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/admin/place-requests/${request.id}/reject`, { note });
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <Field label="Motivo (se le envía por correo)">
        {(p) => <textarea rows={3} maxLength={500} {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-danger" disabled={busy}>
          Rechazar
        </button>
      </div>
    </form>
  );
}

function PlanRequests({ onChange }) {
  const toast = useToast();
  const { data, reload } = useFetch('/admin/plan-requests');
  const decide = async (r, decision) => {
    try {
      await api.post(`/admin/plan-requests/${r.id}/${decision}`);
      toast(decision === 'approve' ? `Plan ${r.plan} activado para ${r.place_name}` : 'Solicitud rechazada');
      reload();
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  if (!data) return <Spinner />;
  return (
    <section className="card">
      {data.requests.length === 0 ? (
        <EmptyState icon="card" title="Sin solicitudes de plan" />
      ) : (
        <ul className="link-list">
          {data.requests.map((r) => (
            <li key={r.id}>
              <span>
                <strong>
                  {r.place_name}: {r.current_plan} → {r.plan}
                </strong>
                <span className="muted small">
                  {r.user_name} · {r.user_email} · {formatDate(r.created_at.slice(0, 10))}
                </span>
              </span>
              <span className="row-actions">
                <button className="btn btn-primary btn-sm" onClick={() => decide(r, 'approve')}>
                  Activar
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => decide(r, 'reject')}>
                  Rechazar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small section-note">Activa el plan cuando el pago esté acordado. El plan nunca cambia la posición en el directorio.</p>
    </section>
  );
}

function Places() {
  const toast = useToast();
  const { data, reload } = useFetch('/admin/places');
  const setPlan = async (p, plan) => {
    try {
      await api.put(`/admin/places/${p.id}/plan`, { plan });
      toast(`${p.name}: plan ${plan}`);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  if (!data) return <Spinner />;
  return (
    <section className="card">
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Lugares del directorio">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lugar</th>
              <th>Tipo</th>
              <th>Equipo</th>
              <th>Pacientes</th>
              <th>Plan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.places.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={placeUrl(p)}>{p.name}</Link>
                  <span className="muted small"> {p.locality}</span>
                </td>
                <td>{PLACE_KINDS[p.kind]?.label}</td>
                <td>{p.members}</td>
                <td>{p.patients}</td>
                <td>
                  <select value={p.plan} onChange={(e) => setPlan(p, e.target.value)} aria-label={`Plan de ${p.name}`}>
                    <option value="gratis">Gratis</option>
                    <option value="pro">Pro</option>
                  </select>
                </td>
                <td>
                  <Link className="btn btn-ghost btn-sm" to={`/clinica/${p.id}/equipo`}>
                    Equipo
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Reviews() {
  const toast = useToast();
  const { data, reload } = useFetch('/admin/reviews');
  const act = async (r, action) => {
    try {
      await api.post(`/admin/reviews/${r.id}/${action}`);
      toast(action === 'hide' ? 'Reseña oculta' : 'Reseña visible de nuevo');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  if (!data) return <Spinner />;
  return (
    <section className="card">
      <p className="muted small section-note">Oculta solo reseñas ofensivas, con datos personales o falsas. Nunca por ser negativas.</p>
      <ul className="reviews">
        {data.reviews.map((r) => (
          <li key={r.id} className="review">
            <div className="review-head">
              <Stars value={r.rating} />
              <strong>
                {r.author} → {r.place_name}
              </strong>
              <span className="muted small">{formatDate(r.created_at.slice(0, 10))}</span>
              {r.hidden_at && <Badge tone="danger">Oculta</Badge>}
            </div>
            {r.comment && <p>{r.comment}</p>}
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => act(r, r.hidden_at ? 'show' : 'hide')}>
                {r.hidden_at ? 'Mostrar' : 'Ocultar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
