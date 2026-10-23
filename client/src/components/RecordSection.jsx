import { useState } from 'react';
import { api } from '../lib/api.js';
import { RECORD_TYPES } from '../lib/records.js';
import { useToast } from '../lib/toast.jsx';
import { FormError, FormFields, useForm } from './Form.jsx';
import Icon from './Icon.jsx';
import Modal, { ConfirmModal } from './Modal.jsx';
import { EmptyState } from './States.jsx';

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function RecordItem({ view, onEdit, onDelete }) {
  return (
    <li className="record">
      <div className="record-main">
        <div className="record-title">
          <strong>{view.title}</strong>
          {view.badge && <Badge tone={view.badge.tone}>{view.badge.text}</Badge>}
        </div>
        {view.subtitle && <p className="record-sub">{view.subtitle}</p>}
        {view.meta && <p className="record-meta">{view.meta}</p>}
      </div>
      {(onEdit || onDelete) && (
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
      )}
    </li>
  );
}

export function RecordForm({ type, pet, record, onSaved, onCancel }) {
  const config = RECORD_TYPES[type];
  const fields = config.fields(pet);
  const form = useForm(fields, record, async (payload) => {
    const base = `/pets/${pet.id}/${type}`;
    const res = record?.id ? await api.put(`${base}/${record.id}`, payload) : await api.post(base, payload);
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

export default function RecordSection({ type, pet, records, onChange, children }) {
  const config = RECORD_TYPES[type];
  const toast = useToast();
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | registro
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/pets/${pet.id}/${type}/${deleting.id}`);
      toast('Registro eliminado');
      setDeleting(null);
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
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
      {children}
      {records.length === 0 ? (
        <EmptyState icon={config.icon} title={`Aún no hay registros`}>
          {config.empty}
        </EmptyState>
      ) : (
        <ul className="record-list">
          {records.map((r) => (
            <RecordItem key={r.id} view={config.view(r)} onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? `Editar ${config.singular}` : config.addLabel}>
        {editing !== null && (
          <RecordForm
            type={type}
            pet={pet}
            record={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              toast(editing.id ? 'Cambios guardados' : 'Registro agregado');
              setEditing(null);
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
