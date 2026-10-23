
import { useState } from 'react';
import { api } from '../api/client';
import { useAdminData } from '../hooks/useAdminData';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { statuses } from '../utils/format';

export default function StudentAttendanceReport() {
  const { data, error, retry } = useAdminData('catalogos');

  const [seccionId, setSeccionId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorConsulta, setErrorConsulta] = useState('');

  function limpiarResultado() {
    setReporte(null);
    setErrorConsulta('');
  }

  async function consultar(e) {
    e.preventDefault();

    if (fechaInicio > fechaFin) {
      setErrorConsulta('La fecha inicial no puede ser posterior a la final.');
      return;
    }

    setCargando(true);
    limpiarResultado();

    try {
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin,
        seccionId,
      });

      const resultado = await api(
        `/reportes/asistencia/estudiantes?${params.toString()}`
      );

      setReporte(resultado);
    } catch (e) {
      setErrorConsulta(e.message);
    } finally {
      setCargando(false);
    }
  }

  if (error) {
    return <ResourceError error={error} retry={retry} />;
  }

  if (!data) {
    return <Loading>Cargando secciones...</Loading>;
  }

  const secciones = data[0].secciones ?? [];

  return (
    <>
      <section className="card">
        <h2>Reporte de asistencia estudiantil</h2>

        <p className="muted">
          Consulta las asistencias, tardanzas y ausencias
          de los estudiantes por sección y rango de fechas.
        </p>

        {!secciones.length ? (
          <Feedback intent="info" title="Sin secciones">
            No hay secciones disponibles.
          </Feedback>
        ) : (
          <form onSubmit={consultar}>
            <div className="form-grid">
              <label className="field">
                Sección
                <select
                  required
                  value={seccionId}
                  onChange={(e) => {
                    setSeccionId(e.target.value);
                    limpiarResultado();
                  }}
                >
                  <option value="">Seleccionar sección...</option>

                  {secciones.map((seccion) => (
                    <option key={seccion.id} value={seccion.id}>
                      {seccion.nombre} · #{seccion.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Fecha inicial
                <input
                  type="date"
                  required
                  value={fechaInicio}
                  onChange={(e) => {
                    setFechaInicio(e.target.value);
                    limpiarResultado();
                  }}
                />
              </label>

              <label className="field">
                Fecha final
                <input
                  type="date"
                  required
                  min={fechaInicio || undefined}
                  value={fechaFin}
                  onChange={(e) => {
                    setFechaFin(e.target.value);
                    limpiarResultado();
                  }}
                />
              </label>
            </div>

            <div className="actions">
              <button type="submit" disabled={cargando}>
                {cargando ? 'Consultando...' : 'Generar reporte'}
              </button>
            </div>
          </form>
        )}

        {errorConsulta && (
          <Feedback title="No se pudo generar el reporte">
            {errorConsulta}
          </Feedback>
        )}

        {cargando && <Loading>Generando reporte...</Loading>}
      </section>

      {reporte && (
        <section className="card">
          <h2>Resultados del reporte</h2>

          <div className="badges">
            {statuses.map(([value, label, intent]) => (
              <span key={value} className={`badge ${intent}`}>
                {reporte.resumen[value]} · {label}
              </span>
            ))}

            <span className="badge info">
              {reporte.total} registros
            </span>
          </div>

          <p>
            <strong>Porcentaje general de asistencia:</strong>{' '}
            {reporte.porcentajeGeneral}%
          </p>

          <h3>Resumen por estudiante</h3>

          {reporte.alumnos.length === 0 ? (
            <Feedback intent="info" title="Sin registros">
              No se encontraron asistencias registradas
              para los filtros seleccionados.
            </Feedback>
          ) : (
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Presente</th>
                    <th>Tardanza</th>
                    <th>Ausente</th>
                    <th>% Asistencia</th>
                  </tr>
                </thead>

                <tbody>
                  {reporte.alumnos.map((alumno) => (
                    <tr key={alumno.alumnoId}>
                      <th scope="row">
                        <span>{alumno.nombre}</span>
                        <small>{alumno.codigo}</small>
                      </th>
                      <td>{alumno.resumen.PRESENTE}</td>
                      <td>{alumno.resumen.TARDANZA}</td>
                      <td>{alumno.resumen.AUSENTE}</td>
                      <td>{alumno.porcentajeAsistencia}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
