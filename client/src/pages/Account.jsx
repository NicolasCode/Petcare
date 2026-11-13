import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, FormError } from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/Layout.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatDate } from '../lib/format.js';
import { disablePush, enablePush, pushState } from '../lib/push.js';
import { useToast } from '../lib/toast.jsx';

export default function Account() {
  const { user, setUser, logout, deleteAccount } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    try {
      await api.post('/auth/verify/resend');
      toast(`Te enviamos un enlace a ${user.email}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleEmail = async (notify_email) => {
    try {
      const d = await api.put('/auth/me', { notify_email });
      setUser(d.user);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page page-narrow">
      <PageHeader title="Mi cuenta" />
      <section className="card account-card">
        <span className="avatar-initial avatar-lg">{user.name[0]?.toUpperCase()}</span>
        <div>
          <h2>{user.name}</h2>
          <p className="muted">
            {user.email}{' '}
            {user.email_verified ? (
              <span className="badge badge-ok">
                <Icon name="check" size={12} /> Confirmado
              </span>
            ) : (
              <span className="badge badge-warning">Sin confirmar</span>
            )}
          </p>
          <p className="small muted">Miembro desde {formatDate(user.created_at.slice(0, 10))}</p>
          {!user.email_verified && (
            <button className="link-btn" onClick={resend}>
              Reenviar el correo de confirmación
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <Icon name="bell" /> Recordatorios
          </h2>
        </div>
        <p className="muted small section-note">Te avisamos 7 días antes de cada refuerzo, cita o fin del alimento, el día anterior, el mismo día y si sigue pendiente.</p>
        <label className="check">
          <input type="checkbox" checked={user.notify_email} onChange={(e) => toggleEmail(e.target.checked)} />
          <span>
            Resumen por correo
            {!user.email_verified && <span className="muted small"> · confirma tu correo para recibirlo</span>}
          </span>
        </label>
        <PushToggle />
      </section>

      {user.clinics?.length > 0 && (
        <Link className="card urgent-card clinic-card" to="/clinica">
          <span className="urgent-icon">
            <Icon name="clinic" />
          </span>
          <span>
            <strong>Panel de clínica</strong>
            <span>{user.clinics.map((c) => c.name).join(', ')}</span>
          </span>
          <Icon name="chevron" />
        </Link>
      )}

      <section className="card">
        <div className="card-head">
          <h2>
            <Icon name="shield" /> Privacidad y datos
          </h2>
        </div>
        <p className="muted">
          Tus datos y los de tus mascotas se tratan conforme a la Ley 1581 de 2012. Solo ven la historia clínica: las personas que agregues a la familia de cada
          mascota, las clínicas que autorices (puedes quitarles el acceso cuando quieras) y quien abra un enlace temporal que generes. El QR del carné muestra
          solo datos de emergencia.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <Icon name="stethoscope" /> ¿Eres veterinario o tienes una clínica?
          </h2>
        </div>
        <p className="muted">
          El panel para clínicas es gratis: pacientes con QR, vacunas validadas, seguimientos y reseñas verificadas. Escríbenos a{' '}
          <a href="mailto:hola@kaimi.co?subject=Quiero%20el%20panel%20de%20cl%C3%ADnica">hola@kaimi.co</a> para activarlo.
        </p>
      </section>

      <div className="stack">
        <button className="btn btn-secondary btn-block" onClick={() => setChanging(true)}>
          <Icon name="lock" size={18} /> Cambiar contraseña
        </button>
        <Link className="btn btn-secondary btn-block" to="/onboard">
          <Icon name="list" size={18} /> Recorrido de la demo
        </Link>
        <button className="btn btn-secondary btn-block" onClick={logout}>
          <Icon name="logout" size={18} /> Cerrar sesión
        </button>
        <button className="btn btn-ghost btn-danger-text btn-block" onClick={() => setConfirm(true)}>
          <Icon name="trash" size={18} /> Eliminar mi cuenta
        </button>
      </div>

      <Modal open={changing} onClose={() => setChanging(false)} title="Cambiar contraseña">
        {changing && (
          <ChangePassword
            onDone={() => {
              toast('Contraseña actualizada. Cerramos tus otras sesiones.');
              setChanging(false);
            }}
            onCancel={() => setChanging(false)}
          />
        )}
      </Modal>
      <ConfirmModal
        open={confirm}
        title="¿Eliminar tu cuenta?"
        message="Se borrarán tu cuenta, tus mascotas y toda su historia clínica de forma permanente."
        confirmLabel="Eliminar definitivamente"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteAccount();
          } catch (err) {
            toast(err.message, 'error');
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function PushToggle() {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    pushState()
      .then(setState)
      .catch(() => setState({ available: false, reason: 'No pudimos revisar las notificaciones de este dispositivo.' }));
  useEffect(() => {
    load();
  }, []);

  if (!state) return null;
  if (!state.available) return <p className="muted small">Notificaciones en este dispositivo: {state.reason}</p>;

  const toggle = async (on) => {
    setBusy(true);
    try {
      if (on) await enablePush(state.config.vapid_public_key);
      else await disablePush();
      toast(on ? 'Notificaciones activadas en este dispositivo' : 'Notificaciones desactivadas');
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const test = () => api.post('/notifications/test').catch((err) => toast(err.message, 'error'));

  return (
    <div className="stack-sm">
      <label className="check">
        <input type="checkbox" checked={state.enabled} disabled={busy || state.denied} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Notificaciones en este dispositivo
          {state.denied && <span className="muted small"> · bloqueadas en el navegador; actívalas en la configuración del sitio</span>}
        </span>
      </label>
      {state.enabled && (
        <button className="btn btn-ghost btn-sm" onClick={test}>
          Enviar una prueba
        </button>
      )}
    </div>
  );
}

function ChangePassword({ onDone, onCancel }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put('/auth/me/password', { current, password });
      onDone();
    } catch (err) {
      setErrors(err.fields ?? {});
      if (!err.fields || !Object.keys(err.fields).length) setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <FormError error={error} />
      <Field label="Contraseña actual" error={errors.current}>
        {(p) => <input type="password" autoComplete="current-password" {...p} value={current} onChange={(e) => setCurrent(e.target.value)} />}
      </Field>
      <Field label="Contraseña nueva" error={errors.password} hint="Mínimo 8 caracteres.">
        {(p) => <input type="password" autoComplete="new-password" minLength={8} {...p} value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Cambiar'}
        </button>
      </div>
    </form>
  );
}
