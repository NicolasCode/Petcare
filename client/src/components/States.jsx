import Icon from './Icon.jsx';

export function Spinner({ label = 'Cargando…' }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ icon = 'paw', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <span className="empty-icon empty-icon-error">
        <Icon name="alert" size={28} />
      </span>
      <h3>No pudimos cargar la información</h3>
      <p>{error?.message}</p>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
