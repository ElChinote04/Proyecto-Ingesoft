import { useState } from 'react';
import { api } from '../api/client';
import { Feedback, Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';

// Las semanas del plan de trabajo salen de estas fechas: sin ellas no se puede planificar.
function FilaBimestre({ bimestre, onGuardado }) {
  const [fechaInicio, setFechaInicio] = useState(bimestre.fechaInicio ?? '');
  const [fechaFin, setFechaFin] = useState(bimestre.fechaFin ?? '');
  const [fallo, setFallo] = useState(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const cambio =
    fechaInicio !== (bimestre.fechaInicio ?? '') || fechaFin !== (bimestre.fechaFin ?? '');

  async function guardar() {
    setGuardando(true);
    setFallo(null);
    setGuardado(false);
    try {
      await api(`/bimestres/${bimestre.id}`, { method: 'PATCH', body: { fechaInicio, fechaFin } });
      setGuardado(true);
      await onGuardado();
    } catch (error) {
      setFallo(error);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <tr>
      <th scope="row">{bimestre.nombre}</th>
      <td>
        <input
          type="date"
          aria-label={`Inicio del ${bimestre.nombre}`}
          value={fechaInicio}
          onChange={(evento) => setFechaInicio(evento.target.value)}
        />
      </td>
      <td>
        <input
          type="date"
          aria-label={`Fin del ${bimestre.nombre}`}
          value={fechaFin}
          onChange={(evento) => setFechaFin(evento.target.value)}
        />
      </td>
      <td>{bimestre.semanas ?? '—'}</td>
      <td>
        <button
          type="button"
          className="secondary"
          disabled={guardando || !cambio || !fechaInicio || !fechaFin}
          onClick={guardar}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {guardado && !cambio && <span className="caption"> Guardado.</span>}
        {fallo && (
          <Feedback title={fallo.message}>
            {Array.isArray(fallo.details) &&
              fallo.details.map((detalle) => (
                <p key={`${detalle.planId ?? detalle.campo}-${detalle.semana ?? detalle.mensaje}`}>
                  {detalle.clase ? `${detalle.clase}: semana ${detalle.semana}` : detalle.mensaje}
                </p>
              ))}
          </Feedback>
        )}
      </td>
    </tr>
  );
}

export default function FechasBimestres() {
  const bimestres = useResource('/bimestres');
  return (
    <section className="card catalog-section">
      <h2>Fechas de los bimestres</h2>
      <p className="muted">
        Del año académico activo. Definen las semanas del plan de trabajo de los docentes.
      </p>
      {bimestres.loading && <Loading />}
      {bimestres.error && <ResourceError error={bimestres.error} retry={bimestres.retry} />}
      {bimestres.data && (
        <div className="table-card admin-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Bimestre</th>
                <th scope="col">Inicio</th>
                <th scope="col">Fin</th>
                <th scope="col">Semanas</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {bimestres.data.map((bimestre) => (
                <FilaBimestre
                  key={`${bimestre.id}:${bimestre.fechaInicio}:${bimestre.fechaFin}`}
                  bimestre={bimestre}
                  onGuardado={bimestres.retry}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
