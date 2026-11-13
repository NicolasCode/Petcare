import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FormError, FormFields, useForm } from '../../components/Form.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../lib/api.js';
import { placeUrl } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useClinic } from './ClinicLayout.jsx';
import HoursEditor from './HoursEditor.jsx';

const FIELDS = [
  { name: 'name', label: 'Nombre', required: true, max: 150, wide: true },
  { name: 'description', label: 'Descripción', type: 'textarea', max: 1000, placeholder: 'Qué los hace distintos, a quién atienden…' },
  { name: 'address', label: 'Dirección', max: 200, wide: true },
  { name: 'locality', label: 'Localidad', max: 80 },
  { name: 'phone', label: 'Teléfono', max: 40, inputType: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', max: 40, inputType: 'tel' },
  { name: 'email', label: 'Correo', max: 120, inputType: 'email' },
  { name: 'website', label: 'Sitio web', max: 200, inputType: 'url', placeholder: 'https://', wide: true },
  { name: 'services', label: 'Servicios', type: 'textarea', max: 500, placeholder: 'Consulta, vacunación, cirugía, laboratorio…' },
  { name: 'specialties', label: 'Especialidades', max: 500, wide: true, placeholder: 'Separadas por comas: Dermatología, Cardiología…' },
  { name: 'equipment', label: 'Equipos', max: 500, wide: true, placeholder: 'Separados por comas: Rayos X, Ecógrafo, Laboratorio…' },
  { name: 'open_24h', label: 'Abierto 24 horas', type: 'checkbox' },
  { name: 'home_visits', label: 'Atendemos a domicilio', type: 'checkbox' },
];

export default function ClinicProfileEdit() {
  const { place, member, reload } = useClinic();
  const toast = useToast();
  const [hours, setHours] = useState(place.hours);
  const canEdit = member.role === 'admin';
  const form = useForm(FIELDS, place, async (payload) => {
    await api.put(`/clinics/${place.id}/profile`, { ...payload, hours });
    toast('Perfil actualizado');
    reload();
  });

  return (
    <form onSubmit={form.handleSubmit} noValidate className="stack">
      <p className="muted">
        Esto es lo que ven los dueños en el directorio y en tu <Link to={placeUrl(place)}>perfil público</Link>. Un perfil completo con horario ayuda a que te
        encuentren, pero el orden del directorio siempre es por cercanía.
      </p>
      {!canEdit && <p className="alert">Solo el administrador de la clínica puede editar el perfil.</p>}
      <FormError error={form.formError} />
      <fieldset className="card" disabled={!canEdit}>
        <legend className="card-legend">Datos de la clínica</legend>
        <FormFields fields={FIELDS} form={form} />
      </fieldset>
      <fieldset className="card" disabled={!canEdit || form.values.open_24h}>
        <legend className="card-legend">
          <Icon name="clock" size={18} /> Horario
        </legend>
        {form.values.open_24h ? <p className="muted">Abierto las 24 horas: no hace falta horario.</p> : <HoursEditor value={hours} onChange={setHours} />}
      </fieldset>
      {canEdit && (
        <div className="form-actions sticky-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={form.busy}>
            {form.busy ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>
      )}
    </form>
  );
}
