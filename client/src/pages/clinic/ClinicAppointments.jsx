import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, FormError } from '../../components/Field.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import PetAvatar from '../../components/PetAvatar.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import { EmptyState, Spinner } from '../../components/States.jsx';
import { api } from '../../lib/api.js';
import { waLink } from '../../lib/contact.js';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useClinic } from './ClinicLayout.jsx';

export const TIMES = { manana: 'En la mañana', tarde: 'En la tarde', cualquiera: 'Cualquier hora' };
const STATUS = {
  pendiente: { tone: 'warning', text: 'Pendiente' },
  confirmada: { tone: 'ok', text: 'Confirmada' },
  rechazada: { tone: 'neutral', text: 'No agendada' },
  cancelada: { tone: 'neutral', text: 'Cancelada por el dueño' },
};

// Sugerencia para el campo de fecha y hora: el día pedido a las 9:00 o 14:00
function suggested(r) {
  const day = r.preferred_date ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return `${day}T${r.preferred_time === 'tarde' ? '14:00' : '09:00'}`;
}

function ConfirmForm({ placeId, request, defaultVet, onDone, onCancel }) {
  const [when, setWhen] = useState(suggested(request));
  const [vet, setVet] = useState(defaultVet ?? '');
  const [response, setResponse] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/clinics/${placeId}/appointment-requests/${request.id}/confirm`, { scheduled_at: new Date(when).toISOString(), vet, response });
      onDone();
    } catch (err) {
      setErrors(err.fields ?? {});
      if (!err.fields || !Object.keys(err.fields).length) setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <p className="muted">
        {request.pet_name} · {request.reason}. La cita quedará en su historia, registrada por tu clínica, y le avisaremos a {request.owner_name?.split(' ')[0]}.
      </p>
      <FormError error={error} />
      <Field label="Fecha y hora" error={errors.scheduled_at}>
        {(p) => <input type="datetime-local" required {...p} value={when} onChange={(e) => setWhen(e.target.value)} />}
      </Field>
      <Field label="Veterinario" optional>
        {(p) => <input {...p} value={vet} onChange={(e) => setVet(e.target.value)} maxLength={100} />}
      </Field>
      <Field label="Mensaje para el dueño" optional hint="Ej. llegar 10 minutos antes, traer el carné.">
        {(p) => <textarea rows={2} maxLength={500} {...p} value={response} onChange={(e) => setResponse(e.target.value)} />}
      </Field>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy || !when}>
          {busy ? 'Confirmando…' : 'Confirmar cita'}
        </button>
      </div>
    </form>
  );
}

function RejectForm({ placeId, request, onDone, onCancel }) {
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/clinics/${placeId}/appointment-requests/${request.id}/reject`, { response });
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <Field label="Mensaje para el dueño" hint="Explica por qué y, si puedes, ofrece otra opción.">
        {(p) => <textarea rows={3} maxLength={500} {...p} value={response} onChange={(e) => setResponse(e.target.value)} />}
      </Field>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Volver
        </button>
        <button className="btn btn-danger" disabled={busy}>
          {busy ? 'Enviando…' : 'No agendar'}
        </button>
      </div>
    </form>
  );
}

export default function ClinicAppointments() {
  const { place, member, reload: reloadClinic } = useClinic();
  const toast = useToast();
  const [status, setStatus] = useState('pendiente');
  const { data, reload } = useFetch(`/clinics/${place.id}/appointment-requests?status=${status}`);
  const [confirming, setConfirming] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const canAnswer = !member.site_admin;

  const done = (message) => {
    toast(message);
    setConfirming(null);
    setRejecting(null);
    reload();
    reloadClinic();
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <Icon name="calendar" /> Solicitudes de cita
        </h2>
      </div>
      <div className="chips" role="group" aria-label="Filtrar solicitudes">
        {[
          ['pendiente', 'Pendientes'],
          ['todas', 'Todas'],
        ].map(([id, label]) => (
          <button key={id} className={`chip${status === id ? ' active' : ''}`} aria-pressed={status === id} onClick={() => setStatus(id)}>
            {label}
          </button>
        ))}
      </div>
      {!data ? (
        <Spinner />
      ) : data.requests.length === 0 ? (
        <EmptyState icon="calendar" title={status === 'pendiente' ? 'Sin solicitudes pendientes' : 'Aún no hay solicitudes'}>
          Los dueños piden cita desde tu perfil público o desde el perfil de su mascota.
        </EmptyState>
      ) : (
        <ul className="follow-list request-list">
          {data.requests.map((r) => (
            <li key={r.id} className={`follow follow-${r.status === 'pendiente' ? 'warning' : 'info'}`}>
              <div className="request-head">
                <PetAvatar pet={r} size={44} />
                <div className="follow-main">
                  <Link to={`/clinica/${place.id}/pacientes/${r.pet_id}`}>
                    <strong>
                      {r.pet_name} · {r.reason}
                    </strong>
                  </Link>
                  <span className="muted small">
                    {r.owner_name} · pedida el {formatDate(r.created_at.slice(0, 10))}
                    {r.preferred_date ? ` · prefiere el ${formatDate(r.preferred_date)}` : ''} · {TIMES[r.preferred_time ?? 'cualquiera']}
                  </span>
                  {r.notes && <span className="small">“{r.notes}”</span>}
                  {r.scheduled_at && <span className="small tone-ok">Cita: {formatDateTime(r.scheduled_at)}</span>}
                  {r.response && <span className="small muted">Respuesta: {r.response}</span>}
                </div>
              </div>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
              {r.status === 'pendiente' && canAnswer && (
                <div className="follow-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => setConfirming(r)}>
                    <Icon name="check" size={16} /> Confirmar con fecha
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(r)}>
                    No podemos
                  </button>
                  {r.owner_phone && (
                    <a className="btn btn-ghost btn-sm" href={waLink(r.owner_phone, `Hola ${r.owner_name.split(' ')[0]}, te escribimos de ${place.name} por la cita de ${r.pet_name}.`)} target="_blank" rel="noreferrer">
                      <Icon name="message" size={16} /> WhatsApp
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={confirming !== null} onClose={() => setConfirming(null)} title="Confirmar cita">
        {confirming && (
          <ConfirmForm
            placeId={place.id}
            request={confirming}
            defaultVet={member.role !== 'staff' ? member.display_name : ''}
            onCancel={() => setConfirming(null)}
            onDone={() => done('Cita confirmada. Le avisamos al dueño.')}
          />
        )}
      </Modal>
      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="No agendar la cita">
        {rejecting && <RejectForm placeId={place.id} request={rejecting} onCancel={() => setRejecting(null)} onDone={() => done('Le avisamos al dueño')} />}
      </Modal>
    </section>
  );
}
