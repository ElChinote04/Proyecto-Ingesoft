import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { formatDate, statuses } from '../utils/format';
import AppLayout from '../layouts/AppLayout';
export default function Attendance({ id, onSaved }) {
  const result = useResource(`/sesiones/${id}/alumnos`);
  if (result.loading || result.error)
    return (
      <AppLayout step="Registrar">
        {result.loading ? <Loading>Cargando alumnos…</Loading> : <ResourceError {...result} />}
      </AppLayout>
    );
  return <AttendanceForm key={id} data={result.data} onSaved={onSaved} />;
}
function AttendanceForm({ data, onSaved }) {
  const { sesion, alumnos } = data;
  const [records, setRecords] = useState(() =>
    alumnos.map((a) => ({
      alumnoId: a.alumnoId,
      estado: a.estado ?? '',
      observacion: a.observacion,
    })),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [validation, setValidation] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function leave(action) {
    if (busy) return;
    if (dirty) setPendingAction(() => action);
    else action();
  }
  function update(id, field, value) {
    setRecords((rows) => rows.map((r) => (r.alumnoId === id ? { ...r, [field]: value } : r)));
    setDirty(true);
  }
  async function save(event) {
    event.preventDefault();
    if (records.some((r) => !r.estado)) {
      setValidation(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api(`/sesiones/${sesion.id}/asistencias`, {
        method: 'PUT',
        body: { asistencias: records },
      });
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout step="Registrar" onLeave={leave}>
      <div className="page-heading">
        <h1>
          {sesion.curso.nombre} · {sesion.seccion.nombre}
        </h1>
        <p className="muted">
          {formatDate(sesion.fecha)} · {sesion.horaInicio}–{sesion.horaFin} · Aula {sesion.aula}
        </p>
      </div>
      {!alumnos.length ? (
        <>
          <Feedback intent="info" title="Sesión sin alumnos">
            No hay alumnos con matrícula activa en esta sección.
          </Feedback>
          <button
            className="secondary"
            onClick={() => {
              window.location.hash = '/sesiones';
            }}
          >
            Volver a sesiones
          </button>
        </>
      ) : (
        <form onSubmit={save}>
          {error && (
            <div className="stack">
              <Feedback title="No se pudo guardar">{error.message}</Feedback>
            </div>
          )}
          {validation && records.some((r) => !r.estado) && (
            <Feedback>Selecciona un estado para cada alumno antes de guardar.</Feedback>
          )}
          <div className="table-card">
            <table>
              <caption className="sr-only">
                Asistencia de alumnos de {sesion.seccion.nombre}
              </caption>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Estado de asistencia</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {alumnos.map((alumno, index) => (
                  <tr key={alumno.alumnoId}>
                    <th scope="row">
                      <span>{alumno.nombre}</span>
                      <small>{alumno.codigo}</small>
                    </th>
                    <td>
                      <fieldset className="choices" disabled={busy}>
                        <legend className="sr-only">Asistencia de {alumno.nombre}</legend>
                        {statuses.map(([value, label]) => (
                          <label key={value} className="choice">
                            <input
                              type="radio"
                              name={`estado-${alumno.alumnoId}`}
                              value={value}
                              checked={records[index].estado === value}
                              onChange={() => update(alumno.alumnoId, 'estado', value)}
                            />
                            <span className="radio-icon" aria-hidden="true">
                              <img
                                src={
                                  records[index].estado === value
                                    ? '/figma/radio-selected.svg'
                                    : '/figma/radio.svg'
                                }
                                alt=""
                              />
                            </span>
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    </td>
                    <td>
                      <input
                        className="observation"
                        aria-label={`Observación de ${alumno.nombre}`}
                        maxLength={300}
                        value={records[index].observacion}
                        onChange={(e) => update(alumno.alumnoId, 'observacion', e.target.value)}
                        disabled={busy}
                        placeholder="Opcional"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="badges" aria-live="polite">
            {statuses.map(([value, label, intent]) => (
              <span key={value} className={`badge ${intent}`}>
                {records.filter((r) => r.estado === value).length} · {label}
              </span>
            ))}
            <span className="badge info">{records.filter((r) => !r.estado).length} sin marcar</span>
          </div>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                leave(() => {
                  window.location.hash = '/sesiones';
                })
              }
            >
              Cancelar
            </button>
            <button disabled={busy || !records.length} type="submit">
              {busy ? 'Guardando asistencia…' : 'Guardar asistencia'}
            </button>
          </div>
        </form>
      )}
      {pendingAction && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
            aria-describedby="unsaved-description"
          >
            <h2 id="unsaved-title">Cambios sin guardar</h2>
            <p id="unsaved-description">Si sales ahora, perderás los cambios de esta sesión.</p>
            <div className="actions">
              <button autoFocus className="secondary" onClick={() => setPendingAction(null)}>
                Seguir editando
              </button>
              <button
                onClick={() => {
                  const action = pendingAction;
                  setPendingAction(null);
                  setDirty(false);
                  action();
                }}
              >
                Descartar cambios
              </button>
            </div>
          </section>
        </div>
      )}
    </AppLayout>
  );
}
