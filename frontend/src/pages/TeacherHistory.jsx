
import { useState } from 'react';
import { api } from '../api/client';
import { Feedback, Loading } from '../components/Feedback';
import { formatDate, statuses } from '../utils/format';

export default function TeacherHistory({ docentes }) {
  const [docenteId, setDocenteId] = useState('');
  const [historial, setHistorial] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function consultarHistorial() {
    if (!docenteId) return;

    setLoading(true);
    setError(null);
    setHistorial(null);

    try {
      const resultado = await api(
        `/asistencias/docentes/${docenteId}`
      );

      setHistorial(resultado);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  function nombreEstado(estado) {
    return (
      statuses.find(([valor]) => valor === estado)?.[1]
      ?? estado
    );
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2>Historial de asistencia docente</h2>

      <p className="muted">
        Consulta los registros anteriores de un docente.
      </p>

      <div className="form-grid" style={{ marginTop: 20 }}>
        <label className="field">
          <span>Docente</span>
          <select
            value={docenteId}
            disabled={loading}
            onChange={(e) => {
              setDocenteId(e.target.value);
              setHistorial(null);
              setError(null);
            }}
          >
            <option value="">Seleccionar docente...</option>
            {docentes.map((docente) => (
              <option key={docente.id} value={docente.id}>
                {docente.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="actions">
        <button
          type="button"
          disabled={!docenteId || loading}
          onClick={consultarHistorial}
        >
          {loading ? 'Consultando...' : 'Consultar historial'}
        </button>
      </div>

      {loading && <Loading>Cargando historial...</Loading>}

      {error && (
        <Feedback title="No se pudo consultar el historial">
          {error.message}
        </Feedback>
      )}

      {historial && (
        <div style={{ marginTop: 24 }}>
          <h3>{historial.nombre}</h3>
          <p className="muted">
            Total de registros: {historial.total}
          </p>

          {historial.asistencias.length === 0 ? (
            <Feedback intent="info" title="Sin registros">
              Este docente aún no tiene asistencias registradas.
            </Feedback>
          ) : (
            <div className="table-card admin-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.asistencias.map((asistencia) => (
                    <tr key={asistencia.id}>
                      <td>{formatDate(asistencia.fecha)}</td>
                      <td>{nombreEstado(asistencia.condicion)}</td>
                      <td>{asistencia.observacion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
