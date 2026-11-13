import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate, PLACE_KINDS, placeUrl } from '../lib/format.js';
import { resizeImage } from '../lib/image.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';
import ContactButtons from './ContactButtons.jsx';
import { Field, FormError } from './Field.jsx';
import Icon from './Icon.jsx';
import Modal, { ConfirmModal } from './Modal.jsx';
import PetAvatar from './PetAvatar.jsx';

// Avatar que abre el selector de foto (cámara en el celular)
export function PetPhoto({ pet, size = 72, onChange }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await api.upload(`/pets/${pet.id}/photo`, await resizeImage(file));
      toast('Foto actualizada');
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
      input.current.value = '';
    }
  };

  return (
    <div className="photo-picker">
      <button type="button" className="photo-btn" onClick={() => input.current.click()} disabled={busy} aria-label={pet.photo_key ? 'Cambiar la foto' : 'Agregar una foto'}>
        <PetAvatar pet={pet} size={size} />
        <span className="photo-badge">{busy ? <span className="spinner spinner-sm" /> : <Icon name="camera" size={16} />}</span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0])} />
    </div>
  );
}

// Clínica habitual con sus datos de contacto y las clínicas que tienen acceso a la historia
export function ClinicsPanel({ pet, clinics, isOwner, onChange }) {
  const toast = useToast();
  const [linking, setLinking] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const link = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Acepta el código suelto o el enlace completo que comparte la clínica
      const clean = code.trim().split('/').filter(Boolean).pop() ?? '';
      await api.post(`/pets/${pet.id}/clinics`, { code: clean, consent });
      toast('Clínica vinculada');
      setLinking(false);
      setCode('');
      setConsent(false);
      onChange();
    } catch (err) {
      setError(err.fields?.consent ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    try {
      await api.del(`/pets/${pet.id}/clinics/${revoking.place_id}`);
      toast('La clínica ya no tiene acceso');
      setRevoking(null);
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const usual = pet.usual_place_id
    ? { name: pet.usual_place_name, phone: pet.usual_place_phone, whatsapp: pet.usual_place_whatsapp, lat: pet.usual_place_lat, lng: pet.usual_place_lng }
    : null;

  return (
    <section className="card" aria-labelledby="clinics-title">
      <div className="card-head">
        <h2 id="clinics-title">
          <Icon name="clinic" /> Clínica responsable
        </h2>
        {isOwner && (
          <button className="btn btn-ghost btn-sm" onClick={() => setLinking(true)}>
            <Icon name="link" size={18} /> Vincular
          </button>
        )}
      </div>

      {usual ? (
        <div className="stack-sm">
          <p>
            <Link to={placeUrl({ id: pet.usual_place_id, name: usual.name })}>
              <strong>{usual.name}</strong>
            </Link>
          </p>
          <ContactButtons {...usual} message={`Hola, soy dueño/a de ${pet.name}. `} />
        </div>
      ) : pet.usual_clinic ? (
        <p className="muted">
          {pet.usual_clinic}. <Link to={`/mascotas/${pet.id}/editar`}>Búscala en el directorio</Link> para tener sus datos de contacto a mano.
        </p>
      ) : (
        <p className="muted">Elige la clínica habitual al editar el perfil, o vincula una clínica aliada con su código.</p>
      )}

      <h3 className="subhead">Clínicas con acceso a la historia</h3>
      {clinics.length === 0 ? (
        <p className="muted small">
          Ninguna. Cuando vinculas una clínica aliada, su equipo puede consultar la historia y registrar vacunas y controles validados.
        </p>
      ) : (
        <ul className="link-list">
          {clinics.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.name}</strong>
                <span className="muted small">
                  {PLACE_KINDS[c.kind]?.label} · autorizada el {formatDate(c.consented_at.slice(0, 10))}
                </span>
              </span>
              {isOwner && (
                <button className="btn btn-ghost btn-sm" onClick={() => setRevoking(c)}>
                  Quitar acceso
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={linking} onClose={() => setLinking(false)} title="Vincular una clínica">
        <form onSubmit={link} className="stack" noValidate>
          <p className="muted">Pide en la clínica su código o escanea su QR. También puedes pegar el enlace que te compartieron.</p>
          <FormError error={error} />
          <Field label="Código o enlace de la clínica">{(p) => <input {...p} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />}</Field>
          <ConsentText pet={pet} checked={consent} onChange={setConsent} />
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setLinking(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy || !code.trim()}>
              {busy ? 'Vinculando…' : 'Autorizar y vincular'}
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={revoking !== null}
        title="¿Quitar el acceso?"
        message={`${revoking?.name} dejará de ver la historia de ${pet.name}. Lo que la clínica ya validó se conserva en el perfil.`}
        confirmLabel="Quitar acceso"
        onConfirm={revoke}
        onClose={() => setRevoking(null)}
      />
    </section>
  );
}

// Autorización explícita (Ley 1581) que se muestra al vincular una clínica
export function ConsentText({ pet, checked, onChange, clinicName = 'la clínica' }) {
  return (
    <label className="check consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Autorizo a {clinicName} a consultar la historia clínica de {pet?.name ?? 'mi mascota'} y a registrar vacunas, controles y consultas. La clínica verá mi
        nombre y mi correo para hacer seguimiento. Puedo quitar este acceso cuando quiera (Ley 1581 de 2012).
      </span>
    </label>
  );
}

// Familia: otras personas que pueden ver y registrar la historia
export function CaregiversPanel({ pet, isOwner, currentUserId, onLeave }) {
  const toast = useToast();
  const { data, reload } = useFetch(`/pets/${pet.id}/caregivers`);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/pets/${pet.id}/caregivers`, { email });
      toast('Le avisamos por correo');
      setAdding(false);
      setEmail('');
      reload();
    } catch (err) {
      setError(err.fields?.email ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    try {
      await api.del(`/pets/${pet.id}/caregivers/${c.user_id}`);
      if (c.user_id === currentUserId) return onLeave();
      toast(`${c.name} ya no cuida a ${pet.name}`);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <section className="card" aria-labelledby="care-title">
      <div className="card-head">
        <h2 id="care-title">
          <Icon name="users" /> Familia
        </h2>
        {isOwner && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Agregar
          </button>
        )}
      </div>
      <ul className="link-list">
        {(data?.caregivers ?? []).map((c) => (
          <li key={c.user_id}>
            <span>
              <strong>{c.name}</strong>
              <span className="muted small">{c.role === 'dueno' ? 'Dueño/a' : 'Cuidador/a'}</span>
            </span>
            {c.role !== 'dueno' && (isOwner || c.user_id === currentUserId) && (
              <button className="btn btn-ghost btn-sm" onClick={() => remove(c)}>
                {c.user_id === currentUserId ? 'Dejar de cuidar' : 'Quitar'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Modal open={adding} onClose={() => setAdding(false)} title={`Agregar a la familia de ${pet.name}`}>
        <form onSubmit={add} className="stack" noValidate>
          <p className="muted">Podrá ver la historia, registrar cuidados y recibir los recordatorios. No podrá borrar el perfil ni compartirlo.</p>
          <Field label="Correo de su cuenta en Kaimi" error={error}>
            {(p) => <input type="email" inputMode="email" autoComplete="off" {...p} value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy || !email.trim()}>
              {busy ? 'Agregando…' : 'Agregar'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
