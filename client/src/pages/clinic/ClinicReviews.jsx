import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import Stars, { RatingSummary } from '../../components/Stars.jsx';
import { EmptyState, Spinner } from '../../components/States.jsx';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useClinic } from './ClinicLayout.jsx';

function Reply({ placeId, review, onSaved, canReply }) {
  const toast = useToast();
  const [text, setText] = useState(review.reply ?? '');
  const [open, setOpen] = useState(false);
  const save = async () => {
    try {
      await api.post(`/clinics/${placeId}/reviews/${review.id}/reply`, { reply: text });
      toast('Respuesta publicada');
      setOpen(false);
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  if (!open) {
    return (
      <>
        {review.reply && (
          <p className="review-reply">
            <strong>Tu respuesta:</strong> {review.reply}
          </p>
        )}
        {canReply && (
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
            <Icon name="message" size={16} /> {review.reply ? 'Editar respuesta' : 'Responder'}
          </button>
        )}
      </>
    );
  }
  return (
    <div className="stack-sm">
      <textarea rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Respuesta pública" />
      <div className="row-actions">
        <button className="btn btn-primary btn-sm" onClick={save}>
          Publicar
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function ClinicReviews() {
  const { place, member } = useClinic();
  const { data, reload } = useFetch(`/clinics/${place.id}/reviews`);
  const visible = (data?.reviews ?? []).filter((r) => !r.hidden_at);
  const avg = visible.length ? visible.reduce((s, r) => s + r.rating, 0) / visible.length : 0;

  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <Icon name="star" /> Reseñas verificadas
        </h2>
        <RatingSummary avg={avg.toFixed(1)} count={visible.length} compact />
      </div>
      <p className="muted small section-note">
        Solo opinan dueños de consultas que tu clínica registró en Kaimi. Responde con respeto: tu respuesta es pública. Las reseñas no se pueden borrar ni
        comprar, y no cambian tu posición en el directorio.
      </p>
      {!data ? (
        <Spinner />
      ) : data.reviews.length === 0 ? (
        <EmptyState icon="star" title="Aún no hay reseñas">
          Cuando registres una consulta como completada, el dueño podrá calificarla.
        </EmptyState>
      ) : (
        <ul className="reviews">
          {data.reviews.map((r) => (
            <li key={r.id} className="review">
              <div className="review-head">
                <Stars value={r.rating} />
                <strong>
                  {r.author} · {r.pet_name}
                </strong>
                <span className="muted small">{formatDate(r.created_at.slice(0, 10))}</span>
                {r.hidden_at && <Badge tone="danger">Oculta por moderación</Badge>}
              </div>
              {r.comment && <p>{r.comment}</p>}
              <Reply placeId={place.id} review={r} onSaved={reload} canReply={!member.site_admin && member.role !== 'staff'} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
