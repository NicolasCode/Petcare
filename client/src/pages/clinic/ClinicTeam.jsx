import { useState } from 'react';
import { FormError, FormFields, useForm } from '../../components/Form.jsx';
import Icon from '../../components/Icon.jsx';
import Modal, { ConfirmModal } from '../../components/Modal.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import { Spinner } from '../../components/States.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useClinic } from './ClinicLayout.jsx';

const ROLES = { admin: 'Administrador', vet: 'Veterinario', staff: 'Recepción / auxiliar' };
const ROLE_HELP = {
  admin: 'Edita el perfil, el equipo y el código QR. Registra y valida historia clínica.',
  vet: 'Registra y valida vacunas, controles y consultas.',
  staff: 'Consulta pacientes y seguimientos. No registra ni valida.',
};

const fieldsFor = (isNew, isAdmin) => [
  ...(isNew ? [{ name: 'email', label: 'Correo de su cuenta en Kaimi', required: true, inputType: 'email', wide: true }] : []),
  { name: 'display_name', label: 'Nombre como aparece', required: true, max: 100, placeholder: 'Ej. Dra. Ana Gómez' },
  ...(isAdmin ? [{ name: 'role', label: 'Rol', type: 'select', options: ROLES, default: 'vet' }] : []),
  { name: 'professional_card', label: 'Tarjeta profesional', max: 40, hint: 'Aparece en los registros que valide.' },
  { name: 'specialty', label: 'Especialidad', max: 100 },
];

function MemberForm({ placeId, member, isAdmin, onSaved, onCancel }) {
  const fields = fieldsFor(!member.id, isAdmin);
  const form = useForm(fields, member, async (payload) => {
    if (member.id) await api.put(`/clinics/${placeId}/members/${member.id}`, payload);
    else await api.post(`/clinics/${placeId}/members`, payload);
    onSaved();
  });
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      {!member.id && <p className="muted">La persona debe crear antes su cuenta en Kaimi con ese correo.</p>}
      <FormError error={form.formError} />
      <FormFields fields={fields} form={form} />
      {isAdmin && <p className="small muted">{ROLE_HELP[form.values.role]}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={form.busy}>
          {form.busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

export default function ClinicTeam() {
  const { place, member, plan, reload: reloadClinic } = useClinic();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { data, reload } = useFetch(`/clinics/${place.id}/members`);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const isAdmin = member.role === 'admin';
  const members = data?.members ?? [];

  const remove = async () => {
    try {
      await api.del(`/clinics/${place.id}/members/${removing.id}`);
      toast(`${removing.display_name} ya no hace parte del equipo`);
      setRemoving(null);
      reload();
      reloadClinic();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <Icon name="users" /> Equipo
        </h2>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({})} disabled={members.length >= plan.memberLimit}>
            <Icon name="plus" size={18} /> Agregar
          </button>
        )}
      </div>
      <p className="muted small section-note">
        {members.length} de {plan.memberLimit} personas incluidas en el plan {plan.label}.
      </p>
      {!data ? (
        <Spinner />
      ) : (
        <ul className="link-list">
          {members.map((m) => (
            <li key={m.id}>
              <span>
                <strong>
                  {m.display_name} <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>{ROLES[m.role]}</Badge>
                </strong>
                <span className="muted small">{[m.email, m.specialty, m.professional_card && `Tarjeta ${m.professional_card}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="row-actions">
                {(isAdmin || m.user_id === user.id) && (
                  <button className="icon-btn" onClick={() => setEditing(m)} aria-label={`Editar a ${m.display_name}`}>
                    <Icon name="edit" size={18} />
                  </button>
                )}
                {isAdmin && (
                  <button className="icon-btn icon-btn-danger" onClick={() => setRemoving(m)} aria-label={`Quitar a ${m.display_name}`}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Editar persona' : 'Agregar al equipo'}>
        {editing !== null && (
          <MemberForm
            placeId={place.id}
            member={editing}
            isAdmin={isAdmin}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              toast('Equipo actualizado');
              setEditing(null);
              reload();
              reloadClinic();
              refresh().catch(() => {});
            }}
          />
        )}
      </Modal>
      <ConfirmModal
        open={removing !== null}
        title="¿Quitar del equipo?"
        message={`${removing?.display_name} perderá el acceso al panel. Los registros que validó conservan su nombre.`}
        confirmLabel="Quitar"
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}
