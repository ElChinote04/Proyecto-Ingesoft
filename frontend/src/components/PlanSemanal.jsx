import { etiquetaTipo, fechaCorta } from '../utils/planTrabajo';

// La familia recibe solo lo publicado y sin este dato: sus tarjetas no llevan etiqueta.
const PUBLICACION = {
  SUBIDA: () => ['Oculta', 'neutral'],
  PROGRAMADA: (actividad) => [`Programada · ${fechaCorta(actividad.publicadaDesde)}`, 'info'],
  PUBLICADA: () => ['Publicada', 'success'],
};

const REVISION = {
  OBSERVADA: ['Observada', 'warning'],
  VALIDADA: ['Validada', 'success'],
};

function TarjetaActividad({ actividad, onAbrir }) {
  const revision = REVISION[actividad.estadoRevision];
  const publicacion = PUBLICACION[actividad.estadoPublicacion]?.(actividad);
  return (
    <button
      type="button"
      className="actividad-tarjeta"
      onClick={() => onAbrir(actividad)}
      aria-label={`Abrir ${actividad.titulo}`}
    >
      <span className="actividad-etiquetas">
        <span className="badge neutral">{etiquetaTipo(actividad.tipo)}</span>
        {publicacion && <span className={`badge ${publicacion[1]}`}>{publicacion[0]}</span>}
        {revision && <span className={`badge ${revision[1]}`}>{revision[0]}</span>}
      </span>
      <strong className="actividad-titulo">{actividad.titulo}</strong>
      {actividad.descripcion && (
        <span className="actividad-descripcion">{actividad.descripcion}</span>
      )}
    </button>
  );
}

/**
 * Una fila por semana del bimestre, también las vacías: a la izquierda la semana y sus
 * fechas, a la derecha sus actividades y, si se puede editar, el botón para agregar otra.
 */
export default function PlanSemanal({ semanas, onAbrir, onAgregar }) {
  return (
    <ol className="plan-semanas" aria-label="Semanas del plan de trabajo">
      {semanas.map((semana) => (
        <li key={semana.numero} className="plan-semana">
          <div className="plan-semana-etiqueta">
            <strong>Semana {semana.numero}</strong>
            <span className="caption">
              {fechaCorta(semana.desde)} – {fechaCorta(semana.hasta)}
            </span>
          </div>
          <div className="plan-semana-actividades">
            {semana.evidencias.length ? (
              semana.evidencias.map((actividad) => (
                <TarjetaActividad key={actividad.id} actividad={actividad} onAbrir={onAbrir} />
              ))
            ) : (
              <p className="muted plan-semana-vacia">Sin actividades</p>
            )}
            {onAgregar && (
              <button
                type="button"
                className="secondary plan-agregar"
                aria-label={`Agregar actividad en la semana ${semana.numero}`}
                onClick={() => onAgregar(semana.numero)}
              >
                + Actividad
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
