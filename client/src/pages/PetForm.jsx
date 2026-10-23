import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FormError, FormFields, useForm } from '../components/Form.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { ErrorState, Spinner } from '../components/States.jsx';
import { api } from '../lib/api.js';
import { SPECIES } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

const speciesOptions = Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, `${v.emoji} ${v.label}`]));

const SECTIONS = [
  {
    title: 'Datos básicos',
    fields: [
      { name: 'name', label: 'Nombre', required: true, max: 60, placeholder: 'Ej. Timothy' },
      { name: 'species', label: 'Especie', type: 'select', options: speciesOptions, placeholder: 'Elige una especie', required: true },
      { name: 'breed', label: 'Raza', max: 80, placeholder: 'Ej. Golden Retriever, criollo…' },
      { name: 'sex', label: 'Sexo', type: 'select', options: { macho: 'Macho', hembra: 'Hembra' }, placeholder: 'Sin especificar' },
      { name: 'birth_date', label: 'Fecha de nacimiento', type: 'date', notFuture: true, hint: 'Si no la sabes, pon una aproximada.' },
      { name: 'color', label: 'Color o señas particulares', max: 60 },
      { name: 'sterilized', label: 'Está esterilizado/a', type: 'checkbox', wide: true },
    ],
  },
  {
    title: 'Salud',
    fields: [
      { name: 'usual_clinic', label: 'Clínica habitual', max: 150, placeholder: 'Ej. Clínica Veterinaria del Norte' },
      { name: 'microchip', label: 'Número de microchip', max: 40 },
      { name: 'notes', label: 'Notas importantes', type: 'textarea', max: 2000, placeholder: 'Condiciones crónicas, comportamiento en consulta…' },
    ],
  },
  {
    title: 'Plan nutricional',
    description: 'Con estos datos calculamos cuándo se acabará el alimento y te avisamos con tiempo.',
    fields: [
      { name: 'food_name', label: 'Alimento', max: 120, placeholder: 'Ej. Alimento Premium Adulto', wide: true },
      { name: 'food_bag_kg', label: 'Tamaño de la bolsa', type: 'number', unit: 'kg', step: '0.1' },
      { name: 'food_daily_g', label: 'Ración diaria', type: 'number', unit: 'g/día', step: '1' },
      { name: 'food_bag_started_on', label: 'Fecha en que abriste la bolsa', type: 'date', notFuture: true },
    ],
  },
];
const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

function PetFormInner({ pet }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const form = useForm(ALL_FIELDS, pet, async (payload) => {
    const res = pet ? await api.put(`/pets/${pet.id}`, payload) : await api.post('/pets', payload);
    toast(pet ? 'Perfil actualizado' : `¡${res.pet.name} ya tiene su perfil!`);
    navigate(`/mascotas/${res.pet.id}`, { replace: true });
  });

  return (
    <div className="page page-narrow">
      <PageHeader
        back={
          <Link to={pet ? `/mascotas/${pet.id}` : '/mascotas'} className="back-link">
            <Icon name="back" size={18} /> Volver
          </Link>
        }
        title={pet ? `Editar a ${pet.name}` : 'Nueva mascota'}
        subtitle={location.state?.welcome ? '¡Cuenta creada! Ahora cuéntanos sobre tu mascota. Solo el nombre y la especie son obligatorios.' : null}
      />
      <form onSubmit={form.handleSubmit} noValidate className="stack">
        <FormError error={form.formError} />
        {SECTIONS.map((s) => (
          <fieldset key={s.title} className="card">
            <legend className="card-legend">{s.title}</legend>
            {s.description && <p className="muted small">{s.description}</p>}
            <FormFields fields={s.fields} form={form} />
          </fieldset>
        ))}
        <div className="form-actions sticky-actions">
          <Link to={pet ? `/mascotas/${pet.id}` : '/mascotas'} className="btn btn-ghost">
            Cancelar
          </Link>
          <button type="submit" className="btn btn-primary btn-lg" disabled={form.busy}>
            {form.busy ? 'Guardando…' : pet ? 'Guardar cambios' : 'Crear perfil'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function NewPet() {
  return <PetFormInner />;
}

export function EditPet() {
  const { petId } = useParams();
  const { data, error, loading, reload } = useFetch(`/pets/${petId}`);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return <PetFormInner pet={data.pet} />;
}
