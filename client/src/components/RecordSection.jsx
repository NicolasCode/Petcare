import { useState } from 'react';
import { api } from '../lib/api.js';
import { RECORD_TYPES, isLocked } from '../lib/records.js';
import { useToast } from '../lib/toast.jsx';
import { FormError, FormFields, useForm } from './Form.jsx';
import Icon from './Icon.jsx';
import Modal, { ConfirmModal } from './Modal.jsx';
import { EmptyState } from './States.jsx';
import Stars, { StarsInput } from './Stars.jsx';

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

// Quién respalda el registro: cuidador o clínica (con el veterinario y su tarjeta profesional)
export function OriginLine({ origin }) {
  if (!origin) return null;
  return (
    <p className={`record-origin${origin.validated ? ' is-validated' : ''}`}>
      <Icon name={origin.validated ? 'shield' : 'user'} size={14} />
      <span>
        {origin.text}
        {origin.detail && <span className="muted"> · {origin.detail}</span>}
      </span>
    </p>
  );
}

export function RecordItem({ view, onEdit, onDelete, locked, actions }) {
  return (
    <li className="record">
      <div className="record-main">
        <div className="record-title">
          <strong>{view.title}</strong>
          {view.badge && <Badge tone={view.badge.tone}>{view.badge.text}</Badge>}
        </div>
        {view.subtitle && <p className="record-sub">{view.subtitle}</p>}
        {view.meta && <p className="record-meta">{view.meta}</p>}
        {view.warning && (
          <p className="record-warning">
            <Icon name="alert" size={14} /> {view.warning}
          </p>
        )}
        <OriginLine origin={view.origin} />
        {actions && <div className="record-extra">{actions}</div>}
      </div>
      {locked ? (
        <span className="record-lock" title="Validado por la clínica: solo ella puede modificarlo">
          <Icon name="lock" size={18} />
          <span className="sr-only">Validado por la clínica</span>
        </span>
      ) : (
        (onEdit || onDelete) && (
          <div className="record-actions">
            {onEdit && (
              <button className="icon-btn" onClick={onEdit} aria-label={`Editar ${view.title}`}>
                <Icon name="edit" size={18} />
              </button>
            )}
            {onDelete && (
              <button className="icon-btn icon-btn-danger" onClick={onDelete} aria-label={`Eliminar ${view.title}`}>
                <Icon name="trash" size={18} />
              </button>
            )}
          </div>
        )
      )}
    </li>
  );
}

// base: ruta de la API de los registros de esta mascota (del dueño o del panel de clínica)
export function RecordForm({ type, pet, record, onSaved, onCancel, base = `/pets/${pet.id}` }) {
  const config = RECORD_TYPES[type];
  const fields = config.fields(pet);
  const form = useForm(fields, record, async (payload) => {
    const url = `${base}/${type}`;
    const res = record?.id ? await api.put(`${url}/${record.id}`, payload) : await api.post(url, payload);
    onSaved(res.record);
  });
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormError error={form.formError} />
      <FormFields fields={fields} form={form} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={form.busy}>
          {form.busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function ReviewForm({ pet, appointment, review, onSaved, onCancel }) {
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Elige de 1 a 5 estrellas');
    setBusy(true);
    try {
      await api.post(`/pets/${pet.id}/appointments/${appointment.id}/review`, { rating, comment });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <p className="muted">
        Tu reseña aparece como <strong>visita verificada</strong> porque {appointment.validated_place_name} registró esta consulta. Se publica con tu
        primer nombre.
      </p>
      <FormError error={error} />
      <StarsInput value={rating} onChange={setRating} />
      <label className="field">
        <span>Comentario (opcional)</span>
        <textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="¿Cómo los atendieron?" />
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Publicando…' : 'Publicar reseña'}
        </button>
      </div>
    </form>
  );
}

const reviewable = (r) => r.validated_place_id && r.status === 'completada' && new Date(r.scheduled_at) <= new Date();

// mode: 'owner' (dueño o cuidador) o 'clinic' (panel de la clínica, con placeId)
export default function RecordSection({ type, pet, records, onChange, children, mode = 'owner', base, placeId, reviews = [] }) {
  const config = RECORD_TYPES[type];
  const toast = useToast();
  const apiBase = base ?? `/pets/${pet.id}`;
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | registro
  const [deleting, setDeleting] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const clinic = mode === 'clinic';

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`${apiBase}/${type}/${deleting.id}`);
      toast('Registro eliminado');
      setDeleting(null);
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const validate = async (r) => {
    try {
      await api.post(`${apiBase}/${type}/${r.id}/validate`);
      toast('Registro validado por tu clínica');
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const itemProps = (r) => {
    if (clinic) {
      const ours = r.validated_place_id === placeId;
      return {
        onEdit: ours ? () => setEditing(r) : undefined,
        locked: Boolean(r.validated_at) && !ours,
        actions: !r.validated_at && (
          <button className="btn btn-secondary btn-sm" onClick={() => validate(r)}>
            <Icon name="shield" size={16} /> Validar
          </button>
        ),
      };
    }
    const review = type === 'appointments' ? reviews.find((x) => x.appointment_id === r.id) : null;
    return {
      onEdit: () => setEditing(r),
      onDelete: () => setDeleting(r),
      locked: isLocked(r),
      actions:
        type === 'appointments' && reviewable(r) ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setReviewing({ appointment: r, review })}>
            {review ? (
              <>
                <Stars value={review.rating} size={14} /> Editar reseña
              </>
            ) : (
              <>
                <Icon name="star" size={16} /> Calificar la atención
              </>
            )}
          </button>
        ) : null,
    };
  };

  return (
    <section className="card" aria-labelledby={`sec-${type}`}>
      <div className="card-head">
        <h2 id={`sec-${type}`}>
          <Icon name={config.icon} /> {config.title}
        </h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
          <Icon name="plus" size={18} /> <span className="hide-xs">{config.addLabel}</span>
          <span className="show-xs">Agregar</span>
        </button>
      </div>
      {clinic && <p className="muted small section-note">Lo que registres aquí queda validado por tu clínica con tu nombre y tarjeta profesional.</p>}
      {children}
      {records.length === 0 ? (
        <EmptyState icon={config.icon} title={`Aún no hay registros`}>
          {config.empty}
        </EmptyState>
      ) : (
        <ul className="record-list">
          {records.map((r) => (
            <RecordItem key={r.id} view={config.view(r)} {...itemProps(r)} />
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? `Editar ${config.singular}` : config.addLabel}>
        {editing !== null && (
          <RecordForm
            type={type}
            pet={pet}
            record={editing}
            base={apiBase}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              toast(editing.id ? 'Cambios guardados' : 'Registro agregado');
              setEditing(null);
              onChange();
            }}
          />
        )}
      </Modal>
      <Modal open={reviewing !== null} onClose={() => setReviewing(null)} title="Calificar la atención">
        {reviewing && (
          <ReviewForm
            pet={pet}
            {...reviewing}
            onCancel={() => setReviewing(null)}
            onSaved={() => {
              toast('¡Gracias! Tu reseña ayuda a otros dueños');
              setReviewing(null);
              onChange();
            }}
          />
        )}
      </Modal>
      <ConfirmModal
        open={deleting !== null}
        title="¿Eliminar registro?"
        message="Esta acción no se puede deshacer."
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
