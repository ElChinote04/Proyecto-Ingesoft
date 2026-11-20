import { MAX_ARCHIVOS } from '../utils/archivosAdjuntos';

// Campo de adjuntos compartido por la evidencia de una nota y las actividades del plan de trabajo.
export function CampoError({ id, children }) {
  if (!children) return null;
  return (
    <span id={id} className="field-error" role="alert">
      {children}
    </span>
  );
}

export default function CampoArchivos({ id, selector, error, onChange, unidad = 'evidencia' }) {
  return (
    <label className="field">
      <span>Archivos</span>
      <input
        ref={selector}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-ayuda`}
        onChange={onChange}
      />
      <span id={`${id}-ayuda`} className="caption">
        PDF, JPG o PNG, hasta 5 MB cada uno. Máximo {MAX_ARCHIVOS} por {unidad}.
      </span>
      <CampoError id={`${id}-error`}>{error}</CampoError>
    </label>
  );
}
