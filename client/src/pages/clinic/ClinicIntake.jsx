import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import QrCode from '../../components/QrCode.jsx';
import { ConfirmModal } from '../../components/Modal.jsx';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { useClinic } from './ClinicLayout.jsx';

const intakeUrl = (code) => `${window.location.origin}/vincular/${code}`;

// QR y enlace para que los dueños registren a sus mascotas como pacientes
export default function ClinicIntake() {
  const { place, member, reload } = useClinic();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const url = intakeUrl(place.intake_code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado');
    } catch {
      toast('No se pudo copiar. Selecciona el enlace y cópialo.', 'error');
    }
  };

  const regenerate = async () => {
    try {
      await api.post(`/clinics/${place.id}/intake-code`);
      toast('Código nuevo generado: imprime el QR otra vez');
      setConfirm(false);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="intake-grid">
      <section className="card intake-poster">
        <p className="hero-kicker">{place.name}</p>
        <h2>Registra a tu mascota en Kaimi</h2>
        <QrCode value={url} size={240} label={`QR de registro de ${place.name}`} />
        <p className="muted">Escanea con la cámara del celular. Tendrás su carné digital con las vacunas validadas por nosotros y recordatorios de cada refuerzo.</p>
        <p className="intake-code">
          Código: <strong>{place.intake_code}</strong>
        </p>
      </section>
      <section className="card stack no-print">
        <div className="card-head">
          <h2>
            <Icon name="qr" /> Cómo usarlo
          </h2>
        </div>
        <ol className="steps-list">
          <li>Imprime el cartel y ponlo en recepción o en el consultorio.</li>
          <li>El dueño lo escanea, ingresa o crea su cuenta y elige sus mascotas.</li>
          <li>Autoriza el acceso y la mascota aparece en Pacientes. Puede quitar el acceso cuando quiera.</li>
        </ol>
        <label className="small muted" htmlFor="intake-url">
          También puedes enviar el enlace por WhatsApp o correo:
        </label>
        <input id="intake-url" readOnly value={url} onFocus={(e) => e.target.select()} />
        <div className="row-actions wrap">
          <button className="btn btn-primary" onClick={copy}>
            <Icon name="copy" size={18} /> Copiar enlace
          </button>
          <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(`Registra a tu mascota en ${place.name} con Kaimi: ${url}`)}`} target="_blank" rel="noreferrer">
            <Icon name="message" size={18} /> WhatsApp
          </a>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Icon name="printer" size={18} /> Imprimir cartel
          </button>
        </div>
        {member.role === 'admin' && (
          <button className="btn btn-ghost btn-danger-text" onClick={() => setConfirm(true)}>
            Generar un código nuevo
          </button>
        )}
      </section>
      <ConfirmModal
        open={confirm}
        title="¿Generar un código nuevo?"
        message="El QR y el enlace actuales dejarán de funcionar. Los pacientes ya registrados no se afectan."
        confirmLabel="Generar código"
        onConfirm={regenerate}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
