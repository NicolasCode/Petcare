import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link, useSearchParams } from 'react-router-dom';
import ContactButtons from '../components/ContactButtons.jsx';
import { FormError, FormFields, useForm } from '../components/Form.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/Layout.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import { Badge } from '../components/RecordSection.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/States.jsx';
import { RatingSummary } from '../components/Stars.jsx';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { PLACE_KINDS, bogotaTime, openText, placeUrl, tags } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';

const BOGOTA = [4.6533, -74.0836];
const FILTERS = [{ id: '', label: 'Todos' }, ...Object.entries(PLACE_KINDS).map(([id, k]) => ({ id, label: k.label }))];

const directions = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
const distance = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`);

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [target, map]);
  return null;
}

// Funciona con o sin sesión: en /directorio es público, en /cerca está dentro de la app
export default function Places() {
  const { user: sessionUser } = useAuth();
  const user = sessionUser ?? { is_admin: false };
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const kind = params.get('tipo') ?? '';
  const only24h = params.get('24h') === '1' || kind === 'urgencias';

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (coords) {
      p.set('lat', coords[0]);
      p.set('lng', coords[1]);
    }
    if (kind) p.set('kind', kind);
    if (params.get('24h') === '1') p.set('open24h', 'true');
    if (params.get('abierto') === '1') p.set('openNow', 'true');
    if (params.get('vet') === '1') p.set('vetNow', 'true');
    if (search) p.set('q', search);
    return `/places?${p}`;
  }, [coords, kind, params, search]);
  const { data, error, loading, reload } = useFetch(url);

  const locate = () => {
    if (!navigator.geolocation) return toast('Tu navegador no permite obtener la ubicación', 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = [pos.coords.latitude, pos.coords.longitude];
        setCoords(c);
        setFocus(c);
        setLocating(false);
      },
      () => {
        toast('No pudimos obtener tu ubicación. Revisa los permisos del navegador.', 'error');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const places = data?.places ?? [];

  return (
    <div className="page page-wide">
      <PageHeader
        title="Cerca de mí"
        subtitle="Clínicas, urgencias 24 horas, farmacias y veterinarios independientes. El orden es por cercanía: nadie paga por aparecer primero."
        actions={
          user.is_admin && (
            <button className="btn btn-secondary" onClick={() => setEditing({})}>
              <Icon name="plus" /> Agregar lugar
            </button>
          )
        }
      />

      <div className="filters">
        <div className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Buscar por nombre, localidad o servicio" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <button className={`btn ${coords ? 'btn-secondary' : 'btn-primary'}`} onClick={locate} disabled={locating}>
          <Icon name="locate" size={18} /> {locating ? 'Ubicando…' : coords ? 'Actualizar ubicación' : 'Usar mi ubicación'}
        </button>
      </div>
      <div className="chips chips-scroll" role="group" aria-label="Filtrar por tipo">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip${kind === f.id ? ' active' : ''}`} aria-pressed={kind === f.id} onClick={() => setFilter('tipo', f.id)}>
            {f.label}
          </button>
        ))}
        <button className={`chip${params.get('abierto') === '1' ? ' active' : ''}`} aria-pressed={params.get('abierto') === '1'} onClick={() => setFilter('abierto', params.get('abierto') === '1' ? '' : '1')}>
          <Icon name="check" size={14} /> Abierto ahora
        </button>
        <button className={`chip${params.get('vet') === '1' ? ' active' : ''}`} aria-pressed={params.get('vet') === '1'} onClick={() => setFilter('vet', params.get('vet') === '1' ? '' : '1')}>
          <Icon name="stethoscope" size={14} /> Vet disponible
        </button>
        <button className={`chip${params.get('24h') === '1' ? ' active' : ''}`} aria-pressed={params.get('24h') === '1'} onClick={() => setFilter('24h', params.get('24h') === '1' ? '' : '1')}>
          <Icon name="clock" size={14} /> 24 horas
        </button>
      </div>

      <div className="places-layout">
        <div className="map-box">
          <MapContainer center={coords ?? BOGOTA} zoom={12} scrollWheelZoom className="map">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FlyTo target={focus} />
            {coords && <CircleMarker center={coords} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2f6fd0', fillOpacity: 1 }} />}
            {places.map((p) => (
              <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: PLACE_KINDS[p.kind].color, fillOpacity: 1 }}>
                <Popup>
                  <strong>{p.name}</strong>
                  <br />
                  {PLACE_KINDS[p.kind].label}
                  {p.open_24h ? ' · 24h' : ''}
                  {openText(p.status, p.open_24h) && (
                    <>
                      <br />
                      {openText(p.status, p.open_24h).text}
                    </>
                  )}
                  <br />
                  <Link to={placeUrl(p)}>Ver perfil</Link> ·{' '}
                  <a href={directions(p)} target="_blank" rel="noreferrer">
                    Cómo llegar
                  </a>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="places-list">
          {loading && !data ? (
            <Spinner />
          ) : error && !data ? (
            <ErrorState error={error} onRetry={reload} />
          ) : places.length === 0 ? (
            <div className="card">
              <EmptyState icon="map" title="No encontramos lugares">
                {search || kind || only24h
                  ? 'Prueba con otros filtros o borra la búsqueda.'
                  : user.is_admin
                    ? 'El directorio está vacío. Agrega la primera clínica con el botón “Agregar lugar”.'
                    : 'Estamos sumando clínicas aliadas en Bogotá. ¡Vuelve pronto!'}
              </EmptyState>
            </div>
          ) : (
            <ul className="stack">
              {places.map((p) => {
                const open = openText(p.status, p.open_24h);
                return (
                <li key={p.id} className="card place">
                  <button className="place-head" onClick={() => setFocus([p.lat, p.lng])} aria-label={`Ver ${p.name} en el mapa`}>
                    <span className="place-dot" style={{ background: PLACE_KINDS[p.kind].color }} />
                    <span className="place-title">
                      <strong>{p.name}</strong>
                      <span className="muted small">{[p.locality, p.address].filter(Boolean).join(' · ')}</span>
                    </span>
                    {p.distance_km !== null && <span className="place-distance">{distance(p.distance_km)}</span>}
                  </button>
                  <div className="place-badges">
                    <Badge tone={p.kind === 'urgencias' ? 'danger' : 'neutral'}>{PLACE_KINDS[p.kind].label}</Badge>
                    {open && <Badge tone={open.tone}>{open.text}</Badge>}
                    {p.available_until && <AvailableBadge place={p} />}
                    {p.home_visits && <Badge tone="info">A domicilio</Badge>}
                    {p.on_kaimi && (
                      <Badge tone="info">
                        <Icon name="shield" size={12} /> Aliada Kaimi
                      </Badge>
                    )}
                  </div>
                  <RatingSummary avg={p.rating_avg} count={p.rating_count} compact />
                  {tags(p.specialties).length > 0 && (
                    <div className="tag-row">
                      {tags(p.specialties).map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.services && <p className="small muted">{p.services}</p>}
                  <div className="place-actions">
                    <ContactButtons phone={p.phone} whatsapp={p.whatsapp} lat={p.lat} lng={p.lng} />
                    <Link className="btn btn-ghost btn-sm" to={placeUrl(p)}>
                      Ver perfil <Icon name="chevron" size={16} />
                    </Link>
                    {user.is_admin && (
                      <span className="admin-actions">
                        <Link className="icon-btn" to={`/clinica/${p.id}`} aria-label={`Gestionar equipo y horarios de ${p.name}`} title="Equipo, horarios y plan">
                          <Icon name="users" size={18} />
                        </Link>
                        <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>
                          <Icon name="edit" size={18} />
                        </button>
                        <button className="icon-btn icon-btn-danger" onClick={() => setDeleting(p)} aria-label={`Eliminar ${p.name}`}>
                          <Icon name="trash" size={18} />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {user.is_admin && (
        <>
          <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Editar lugar' : 'Agregar lugar'}>
            {editing !== null && (
              <PlaceForm
                place={editing}
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  toast('Lugar guardado');
                  setEditing(null);
                  reload();
                }}
              />
            )}
          </Modal>
          <ConfirmModal
            open={deleting !== null}
            title="¿Eliminar lugar?"
            message={`Se quitará “${deleting?.name}” del directorio.`}
            onConfirm={async () => {
              await api.del(`/places/${deleting.id}`).catch((err) => toast(err.message, 'error'));
              setDeleting(null);
              reload();
            }}
            onClose={() => setDeleting(null)}
          />
        </>
      )}
    </div>
  );
}

// Aviso temporal de la clínica; el servidor ya oculta los vencidos
export function AvailableBadge({ place }) {
  const until = bogotaTime(place.available_until);
  return (
    <Badge tone="ok">
      <Icon name="stethoscope" size={12} /> Vet disponible hasta las {until}
    </Badge>
  );
}

const PLACE_FIELDS = [
  { name: 'name', label: 'Nombre', required: true, max: 150, wide: true },
  { name: 'kind', label: 'Tipo', type: 'select', options: Object.fromEntries(Object.entries(PLACE_KINDS).map(([k, v]) => [k, v.label])), default: 'clinica' },
  { name: 'locality', label: 'Localidad', max: 80, placeholder: 'Ej. Chapinero' },
  { name: 'address', label: 'Dirección', max: 200, wide: true },
  {
    name: 'coords',
    label: 'Coordenadas',
    required: true,
    wide: true,
    placeholder: '4.6765, -74.0480',
    hint: 'En Google Maps haz clic derecho sobre el lugar y copia las coordenadas.',
  },
  { name: 'phone', label: 'Teléfono', max: 40, inputType: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', max: 40, inputType: 'tel' },
  { name: 'website', label: 'Sitio web', max: 200, inputType: 'url', placeholder: 'https://', wide: true },
  { name: 'email', label: 'Correo', max: 120, inputType: 'email' },
  { name: 'description', label: 'Descripción', type: 'textarea', max: 1000 },
  { name: 'services', label: 'Servicios', type: 'textarea', max: 500, placeholder: 'Consulta, vacunación, cirugía, laboratorio…' },
  { name: 'specialties', label: 'Especialidades', max: 500, wide: true, placeholder: 'Separadas por comas: Dermatología, Cardiología…' },
  { name: 'equipment', label: 'Equipos', max: 500, wide: true, placeholder: 'Separados por comas: Rayos X, Ecógrafo…' },
  { name: 'open_24h', label: 'Abierto 24 horas', type: 'checkbox' },
  { name: 'home_visits', label: 'Atiende a domicilio', type: 'checkbox' },
];

function PlaceForm({ place, onSaved, onCancel }) {
  const record = place.id ? { ...place, coords: `${place.lat}, ${place.lng}` } : {};
  const form = useForm(PLACE_FIELDS, record, async ({ coords, ...payload }) => {
    const [lat, lng] = coords.split(',').map((n) => Number(n.trim()));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(400, 'Revisa las coordenadas', { coords: 'Usa el formato “latitud, longitud”' });
    }
    const body = { ...payload, city: 'Bogotá', lat, lng };
    if (place.id) await api.put(`/places/${place.id}`, body);
    else await api.post('/places', body);
    onSaved();
  });
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormError error={form.formError} />
      <FormFields fields={PLACE_FIELDS} form={form} />
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
