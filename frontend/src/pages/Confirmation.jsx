import { Feedback } from '../components/Feedback';
import AppLayout from '../layouts/AppLayout';
import { formatTimestamp, statuses } from '../utils/format';
export default function Confirmation({ result }) {
  return (
    <AppLayout step="Confirmación">
      <div className="page-heading">
        <h1>Asistencia guardada</h1>
        <p className="muted">El registro quedó asociado a la sesión y hora de control.</p>
      </div>
      <Feedback intent="success" title="Asistencia registrada">
        Se guardaron {result.total} registros para {result.sesion.curso.nombre} ·{' '}
        {result.sesion.seccion.nombre}.
      </Feedback>
      <div className="summary">
        {statuses.map(([value, label, intent]) => (
          <div className={`metric ${intent}`} key={value}>
            <span>{label}</span>
            <strong>{result.resumen[value]}</strong>
          </div>
        ))}
      </div>
      <div className="audit-info">
        Registrado por {result.registradoPor} el {formatTimestamp(result.fechaHora)} (hora de Lima).
      </div>
      <div className="actions start">
        <button
          onClick={() => {
            window.location.hash = '/sesiones';
          }}
        >
          Registrar otra sesión
        </button>
        <button
          className="secondary"
          onClick={() => {
            window.location.hash = `/sesiones/${result.sesion.id}`;
          }}
        >
          Revisar asistencia
        </button>
      </div>
    </AppLayout>
  );
}
