import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import { useAuth } from '../lib/auth.jsx';
import { formatDate } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';

export default function Account() {
  const { user, logout, deleteAccount } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="page page-narrow">
      <PageHeader title="Mi cuenta" />
      <section className="card account-card">
        <span className="avatar-initial avatar-lg">{user.name[0]?.toUpperCase()}</span>
        <div>
          <h2>{user.name}</h2>
          <p className="muted">{user.email}</p>
          <p className="small muted">Miembro desde {formatDate(user.created_at.slice(0, 10))}</p>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <Icon name="shield" /> Privacidad y datos
          </h2>
        </div>
        <p className="muted">
          Tus datos y los de tus mascotas se tratan conforme a la Ley 1581 de 2012. Solo un veterinario con un enlace que tú generes puede ver
          la historia clínica, por el tiempo que elijas, y puedes revocarlo cuando quieras desde el perfil de cada mascota.
        </p>
      </section>

      <div className="stack">
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
