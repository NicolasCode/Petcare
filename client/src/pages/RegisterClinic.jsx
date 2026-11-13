import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FormError, FormFields, useForm } from '../components/Form.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { Badge } from '../components/RecordSection.jsx';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatDate } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

const KINDS = { clinica: 'Clínica veterinaria', independiente: 'Veterinario independiente / a domicilio', urgencias: 'Urgencias 24 horas' };
const STATUS = { pendiente: ['warning', 'En revisión'], aprobada: ['ok', 'Aprobada'], rechazada: ['neutral', 'No aprobada'] };

const fields = (claiming) => [
  { name: 'kind', label: 'Tipo', type: 'select', options: KINDS, default: 'clinica', wide: true },
  { name: 'name', label: claiming ? 'Nombre del lugar' : 'Nombre de la clínica o consultorio', required: true, max: 150, wide: true },
  { name: 'address', label: 'Dirección', max: 200, wide: true, when: (v) => v.kind !== 'independiente' },
  { name: 'locality', label: 'Localidad o zona', max: 80, placeholder: 'Ej. Chapinero' },
  { name: 'phone', label: 'Teléfono', max: 40, inputType: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', max: 40, inputType: 'tel' },
  {
    name: 'coords',
    label: 'Coordenadas',
    max: 60,
    placeholder: '4.6765, -74.0480',
    hint: 'Opcional: en Google Maps haz clic derecho sobre el lugar y copia las coordenadas.',
    when: () => !claiming,
  },
  { name: 'display_name', label: 'Tu nombre como profesional', required: true, max: 100, placeholder: 'Ej. Dra. Ana Gómez' },
  { name: 'professional_card', label: 'Tarjeta profesional', max: 40, hint: 'Nos ayuda a verificar que eres veterinario.' },
  { name: 'message', label: 'Cuéntanos algo más', type: 'textarea', max: 1000 },
];

// Solicitud para tener el panel de clínica (la revisa el equipo de Kaimi)
export default function RegisterClinic() {
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const claimId = params.get('lugar');
  const { data: claimData } = useFetch(claimId ? `/places/${claimId}` : null);
  const { data, reload } = useFetch('/place-requests/mine');
  const claim = claimData?.place;
  const f = fields(Boolean(claimId));
  const initial = claim ? { name: claim.name, kind: claim.kind === 'farmacia' ? 'clinica' : claim.kind, address: claim.address, locality: claim.locality, phone: claim.phone } : { display_name: user.name };
  const formKey = claim ? `claim-${claim.id}` : 'new';

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Registra tu clínica"
        subtitle="Gratis para clínicas y veterinarios independientes: pacientes con QR, vacunas validadas, solicitudes de cita y seguimientos."
      />
      {data?.requests?.length > 0 && (
        <section className="card">
          <h2 className="card-title">
            <Icon name="list" /> Tus solicitudes
          </h2>
          <ul className="link-list">
            {data.requests.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.name}</strong>
                  <span className="muted small">
                    Enviada el {formatDate(r.created_at.slice(0, 10))}
                    {r.review_note ? ` · ${r.review_note}` : ''}
                  </span>
                </span>
                {r.status === 'aprobada' && r.place_id ? (
                  <Link className="btn btn-primary btn-sm" to={`/clinica/${r.place_id}`}>
                    Abrir panel
                  </Link>
                ) : (
                  <Badge tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(!claimId || claimData) && (
        <RequestForm
          key={formKey}
          fields={f}
          initial={initial}
          claim={claim}
          onSent={() => {
            toast('¡Solicitud enviada! Te escribiremos al correo cuando la revisemos.');
            reload();
          }}
        />
      )}
    </div>
  );
}

function RequestForm({ fields, initial, claim, onSent }) {
  const [sent, setSent] = useState(false);
  const form = useForm(fields, initial, async ({ coords, ...payload }) => {
    let lat = null;
    let lng = null;
    if (coords) {
      [lat, lng] = coords.split(',').map((n) => Number(n.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(400, 'Revisa las coordenadas', { coords: 'Usa el formato “latitud, longitud”' });
    }
    await api.post('/place-requests', { ...payload, lat, lng, existing_place_id: claim?.id ?? null });
    setSent(true);
    onSent();
  });
  if (sent) {
    return (
      <div className="card empty">
        <span className="empty-icon">
          <Icon name="check" size={28} />
        </span>
        <h2 className="h3">Recibimos tu solicitud</h2>
        <p>La revisamos en menos de 2 días hábiles. Cuando la aprobemos, verás “Mi clínica” en el menú.</p>
      </div>
    );
  }
  return (
    <form onSubmit={form.handleSubmit} noValidate className="stack">
      {claim && (
        <p className="alert">
          Estás reclamando <strong>{claim.name}</strong>, que ya aparece en el directorio. Al aprobarla quedarás como administrador de su perfil.
        </p>
      )}
      <FormError error={form.formError} />
      <fieldset className="card">
        <legend className="card-legend">Datos del lugar y del profesional</legend>
        <FormFields fields={fields} form={form} />
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={form.busy}>
          {form.busy ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  );
}
