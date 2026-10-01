export function Feedback({ children, intent = 'danger', title }) {
  return (
    <div className={`feedback ${intent}`} role={intent === 'danger' ? 'alert' : 'status'}>
      <span className="status-dot" aria-hidden="true" />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}
export function Loading({ children = 'Cargando…' }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" />
      {children}
    </p>
  );
}
export function ResourceError({ error, retry }) {
  return (
    <div className="stack">
      <Feedback title="No pudimos cargar la información">{error.message}</Feedback>
      <button className="secondary" onClick={retry}>
        Volver a intentar
      </button>
    </div>
  );
}
