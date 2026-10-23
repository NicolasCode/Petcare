import { useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

const DURATIONS = [
  { days: 1, label: '24 horas' },
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
];

const linkUrl = (token) => `${window.location.origin}/compartido/${token}`;

// Historia portable: el dueño autoriza explícitamente y por tiempo limitado el acceso de un veterinario
export default function ShareModal({ pet, open, onClose }) {
  const toast = useToast();
  const { data, reload } = useFetch(open ? `/pets/${pet.id}/share` : null);
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);

  const create = async () => {
    setBusy(true);
    try {
      const { link } = await api.post(`/pets/${pet.id}/share`, { days });
      setFresh(link);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      toast('Enlace copiado');
    } catch {
      toast('No se pudo copiar. Mantén presionado el enlace para copiarlo.', 'error');
    }
  };

  const revoke = async (id) => {
    await api.del(`/pets/${pet.id}/share/${id}`).catch((err) => toast(err.message, 'error'));
    if (fresh?.id === id) setFresh(null);
    toast('Acceso revocado');
    reload();
  };

  const whatsapp = (token) =>
    `https://wa.me/?text=${encodeURIComponent(`Historia clínica de ${pet.name} en KuraPet (solo lectura): ${linkUrl(token)}`)}`;

  return (
    <Modal
      open={open}
      onClose={() => {
        setFresh(null);
        onClose();
      }}
      title="Compartir con un veterinario"
    >
      <p className="muted">
        Genera un enlace de solo lectura con la historia de {pet.name}: alergias, vacunas, medicamentos, citas y peso. No incluye tu correo
        ni tus datos de contacto. Puedes revocarlo cuando quieras.
      </p>

      {fresh ? (
        <div className="share-fresh">
          <label className="small muted" htmlFor="share-url">
            Enlace listo · vence {formatDateTime(fresh.expires_at)}
          </label>
          <input id="share-url" readOnly value={linkUrl(fresh.token)} onFocus={(e) => e.target.select()} />
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => copy(fresh.token)}>
              <Icon name="copy" size={18} /> Copiar
            </button>
            <a className="btn btn-secondary" href={whatsapp(fresh.token)} target="_blank" rel="noreferrer">
              <Icon name="message" size={18} /> WhatsApp
            </a>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="segmented" role="radiogroup" aria-label="Duración del acceso">
            {DURATIONS.map((d) => (
              <button key={d.days} type="button" role="radio" aria-checked={days === d.days} className={days === d.days ? 'active' : ''} onClick={() => setDays(d.days)}>
                {d.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-block" onClick={create} disabled={busy}>
            <Icon name="share" size={18} /> {busy ? 'Generando…' : 'Generar enlace'}
          </button>
        </div>
      )}

      {data?.links?.length > 0 && (
        <div className="share-links">
          <h3>Enlaces activos</h3>
          <ul>
            {data.links.map((l) => (
              <li key={l.id}>
                <span>
                  <strong>Vence {formatDateTime(l.expires_at)}</strong>
                  <span className="muted small">
                    {l.view_count ? `Visto ${l.view_count} ${l.view_count === 1 ? 'vez' : 'veces'}` : 'Aún no se ha abierto'}
                  </span>
                </span>
                <span className="row-actions">
                  <button className="icon-btn" onClick={() => copy(l.token)} aria-label="Copiar enlace">
                    <Icon name="copy" size={18} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => revoke(l.id)}>
                    Revocar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
