import { useState } from 'react';
import { Loading, ResourceError } from './Feedback';
import TablaDatos from './TablaDatos';
import FiltrosAula from './FiltrosAula';
import { useResource } from '../hooks/useResource';
import { consultaDeFiltros, fechaCorta, soles } from '../utils/pagos';

const FILTROS_VACIOS = { anioAcademicoId: '', gradoId: '', seccionId: '' };

const atraso = (dias) => (dias === 1 ? '1 día' : `${dias} días`);

/**
 * US-008: estudiantes con pensiones morosas, agrupados, con su deuda total y
 * los apoderados a quienes contactar. La morosidad se calcula al consultar.
 */
export default function MorosidadPagos({ catalogos }) {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const consulta = consultaDeFiltros(filtros);
  const morosidad = useResource(`/reportes/pagos/morosidad${consulta ? `?${consulta}` : ''}`);
  const datos = morosidad.data;
  return (
    <>
      <div className="pagos-filtros cobranza-filtros">
        <FiltrosAula catalogos={catalogos} valor={filtros} onChange={setFiltros} />
      </div>
      {morosidad.loading && <Loading>Calculando morosidad…</Loading>}
      {morosidad.error && <ResourceError {...morosidad} />}
      {datos && (
        <>
          <section className="portal-summary cobranza-resumen" aria-label="Resumen de morosidad">
            <article className="card portal-summary-card">
              <p className="muted">Deuda morosa</p>
              <strong className="monto-moroso">{soles(datos.resumen.deuda)}</strong>
              <p className="caption">
                Boletas vencidas sin pago al {fechaCorta(datos.fechaCorte)}.
              </p>
            </article>
            <article className="card portal-summary-card horario-tone-0">
              <p className="muted">Estudiantes morosos</p>
              <strong>{datos.resumen.estudiantes}</strong>
              <p className="caption">Con al menos una boleta vencida.</p>
            </article>
            <article className="card portal-summary-card horario-tone-1">
              <p className="muted">Boletas morosas</p>
              <strong>{datos.resumen.boletas}</strong>
              <p className="caption">En total, según los filtros aplicados.</p>
            </article>
          </section>
          <section className="portal-historial">
            <h2>Estudiantes con pensiones morosas</h2>
            <TablaDatos
              className="tabla-apilable"
              columnas={['Estudiante', 'Aula', 'Apoderados', 'Boletas vencidas', 'Deuda', 'Atraso']}
              filas={datos.estudiantes.map((fila) => ({
                id: fila.estudiante.id,
                celdas: [
                  <span key="estudiante" className="celda-doble">
                    <span>{fila.estudiante.nombre}</span>
                    <small className="muted">Código {fila.estudiante.codigo}</small>
                  </span>,
                  `${fila.aula} · ${fila.anioAcademico}`,
                  fila.apoderados.length ? (
                    <span key="apoderados" className="celda-doble">
                      {fila.apoderados.map((apoderado) => (
                        <span key={apoderado.nombre}>
                          {apoderado.nombre}{' '}
                          <small className="muted">({apoderado.parentesco})</small>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span key="sin-apoderado" className="muted">
                      Sin apoderado vinculado
                    </span>
                  ),
                  fila.boletasMorosas,
                  <strong key="deuda">{soles(fila.deuda)}</strong>,
                  <span key="atraso" className="celda-doble">
                    <span className="badge danger">{atraso(fila.diasAtraso)}</span>
                    <small className="muted">desde {fechaCorta(fila.vencimientoMasAntiguo)}</small>
                  </span>,
                ],
              }))}
              vacio="No hay estudiantes con pensiones morosas para los filtros elegidos."
            />
          </section>
        </>
      )}
    </>
  );
}
