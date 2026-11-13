import Icon from './Icon.jsx';

export default function Stars({ value, size = 16 }) {
  const rounded = Math.round(Number(value));
  return (
    <span className="stars" aria-label={`${Number(value).toLocaleString('es-CO')} de 5 estrellas`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} className={n <= rounded ? 'star-on' : 'star-off'} />
      ))}
    </span>
  );
}

export function StarsInput({ value, onChange }) {
  return (
    <div className="stars-input" role="radiogroup" aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} estrella${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}>
          <Icon name="star" size={32} className={n <= value ? 'star-on' : 'star-off'} />
        </button>
      ))}
    </div>
  );
}

// "4,5 ★ (12 reseñas verificadas)"
export function RatingSummary({ avg, count, compact }) {
  if (!count) return compact ? null : <span className="muted small">Sin reseñas verificadas aún</span>;
  return (
    <span className="rating">
      <Stars value={avg} size={compact ? 14 : 16} />
      <strong>{Number(avg).toLocaleString('es-CO')}</strong>
      <span className="muted small">
        ({count} {count === 1 ? 'reseña verificada' : 'reseñas verificadas'})
      </span>
    </span>
  );
}
