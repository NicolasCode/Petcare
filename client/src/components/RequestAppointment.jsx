import { useState } from 'react';
import { api } from '../lib/api.js';
import { SPECIES, todayIso } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useFetch } from '../lib/useFetch.js';
import { Field, FormError } from './Field.jsx';
import Modal from './Modal.jsx';
import ConsentText from './ConsentText.jsx';

const TIMES = { cualquiera: 'Cualquier hora', manana: 'En la mañana', tarde: 'En la tarde' };

// Pedir cita a una clínica aliada. Con `pet` la mascota viene fija; sin ella se elige entre las propias
export default function RequestAppointment({ place, pet, linked = false, open, onClose, onSent }) {
  const toast = useToast();
  const { data } = useFetch(open && !pet ? '/pets' : null);
  const pets = pet ? [pet] : (data?.pets ?? []);
  const [petId, setPetId] = useState(pet?.id ?? '');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('cualquiera');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const chosen = pets.find((p) => String(p.id) === String(petId || pets[0]?.id));

  const submit = async (e) => {
    e.preventDefault();
    if (!chosen) return setError('Elige una mascota');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/pets/${chosen.id}/appointment-requests`, { place_id: place.id, reason, preferred_date: date, preferred_time: time, notes, consent });
      toast(`Solicitud enviada a ${place.name}. Te avisaremos cuando la confirmen.`);
      onClose();
      onSent?.();
    } catch (err) {
      setErrors(err.fields ?? {});
      if (!err.fields || !Object.keys(err.fields).length) setError(err.message);
      else if (err.fields.consent) setError(err.fields.consent);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Pedir cita en ${place.name}`}>
      <form onSubmit={submit} className="stack" noValidate>
        <p className="muted">La clínica te confirmará la fecha y la hora. Te avisaremos por correo y en la app.</p>
        <FormError error={error} />
        {!pet && (
          <Field label="Mascota">
            {(p) => (
              <select {...p} value={petId || pets[0]?.id || ''} onChange={(e) => setPetId(e.target.value)}>
                {pets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {SPECIES[x.species]?.emoji} {x.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Motivo" error={errors.reason}>
          {(p) => <input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} placeholder="Ej. Vacunación, control, revisión de piel…" />}
        </Field>
        <div className="form-grid">
          <Field label="Fecha preferida" optional error={errors.preferred_date}>
            {(p) => <input type="date" min={todayIso()} {...p} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Horario">
            {(p) => (
              <select {...p} value={time} onChange={(e) => setTime(e.target.value)}>
                {Object.entries(TIMES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Notas para la clínica" optional>
          {(p) => <textarea rows={2} maxLength={500} {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        {!linked && <ConsentText pet={chosen} clinicName={place.name} checked={consent} onChange={setConsent} />}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !reason.trim() || (!linked && !consent)}>
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
