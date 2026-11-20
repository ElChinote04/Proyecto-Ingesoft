import { useState } from 'react';
import { Feedback, Loading, ResourceError } from './Feedback';
import TablaDatos from './TablaDatos';
import FiltrosAula from './FiltrosAula';
import { descargarArchivo } from '../api/client';
import { useResource } from '../hooks/useResource';
import { consultaDeFiltros, periodoLargo, soles } from '../utils/pagos';

const anioActual = new Date().getFullYear();

/**
 * US-012: lo emitido, recaudado, pendiente y moroso por periodo, filtrable por
 * año, grado, sección y rango de vencimientos, exportable a PDF y Excel.
 */
export default function ReportePagos({ catalogos }) {
  const [rango, setRango] = useState({
    desde: `${anioActual}-01-01`,
    hasta: `${anioActual}-12-31`,
  });
  const [filtros, setFiltros] = useState({ anioAcademicoId: '', gradoId: '', seccionId: '' });
  const [descargando, setDescargando] = useState('');
  const [errorDescarga, setErrorDescarga] = useState('');
  const rangoValido = rango.desde && rango.hasta && rango.desde <= rango.hasta;
  const consulta = consultaDeFiltros({ ...rango, ...filtros });
  const reporte = useResource(rangoValido ? `/reportes/pagos?${consulta}` : null);

  async function descargar(formato) {
    setDescargando(formato);
    setErrorDescarga('');
    try {
      await descargarArchivo(
        `/reportes/pagos?${consulta}&formato=${formato}`,
        `reporte-pagos.${formato}`,
      );
    } catch (fallo) {
      setErrorDescarga(fallo.message);
    } finally {
      setDescargando('');
    }
  }

  const datos = rangoValido ? reporte.data : null;
  return (
    <>
      <div className="pagos-filtros cobranza-filtros">
        <label className="field">
          Vencen desde
          <input
            type="date"
            value={rango.desde}
            max={rango.hasta}
            onChange={(e) => setRango({ ...rango, desde: e.target.value })}
          />
        </label>
        <label className="field">
          Hasta
          <input
            type="date"
            value={rango.hasta}
            min={rango.desde}
            onChange={(e) => setRango({ ...rango, hasta: e.target.value })}
          />
        </label>
        <FiltrosAula catalogos={catalogos} valor={filtros} onChange={setFiltros} />
      </div>
      {!rangoValido && (
        <Feedback intent="info">Elige un rango de fechas válido para ver el reporte.</Feedback>
      )}
      {rangoValido && reporte.loading && <Loading>Calculando el reporte…</Loading>}
      {rangoValido && reporte.error && <ResourceError {...reporte} />}
      {datos && (
        <>
          <section className="cobranza-totales" aria-label="Totales del periodo">
            {[
              ['Emitido', soles(datos.totales.emitido), `${datos.totales.boletas} boletas`],
              [
                'Recaudado',
                soles(datos.totales.recaudado),
                `${datos.totales.porcentajeCobranza}% de lo emitido`,
              ],
              ['Pendiente', soles(datos.totales.pendiente), 'Aún no vence'],
              ['Moroso', soles(datos.totales.moroso), 'Vencido sin pagar'],
            ].map(([etiqueta, valor, nota]) => (
              <article key={etiqueta} className="card cobranza-total">
                <p className="muted">{etiqueta}</p>
                <strong className={etiqueta === 'Moroso' ? 'monto-moroso' : undefined}>
                  {valor}
                </strong>
                <p className="caption">{nota}</p>
              </article>
            ))}
          </section>
          <section className="portal-historial">
            <div className="cobranza-encabezado">
              <h2>Detalle por periodo</h2>
              <div className="row-actions">
                <button
                  className="secondary"
                  disabled={Boolean(descargando)}
                  onClick={() => descargar('pdf')}
                >
                  {descargando === 'pdf' ? 'Descargando…' : 'Descargar PDF'}
                </button>
                <button
                  className="secondary"
                  disabled={Boolean(descargando)}
                  onClick={() => descargar('xlsx')}
                >
                  {descargando === 'xlsx' ? 'Descargando…' : 'Descargar Excel'}
                </button>
              </div>
            </div>
            {errorDescarga && (
              <Feedback title="No pudimos descargar el reporte">{errorDescarga}</Feedback>
            )}
            <TablaDatos
              className="tabla-apilable"
              columnas={[
                'Periodo',
                'Boletas',
                'Emitido',
                'Recaudado',
                'Pendiente',
                'Moroso',
                '% cobrado',
              ]}
              filas={datos.periodos.map((fila) => ({
                id: fila.periodo,
                celdas: [
                  periodoLargo(fila.periodo),
                  fila.boletas,
                  soles(fila.emitido),
                  soles(fila.recaudado),
                  soles(fila.pendiente),
                  soles(fila.moroso),
                  `${fila.porcentajeCobranza}%`,
                ],
              }))}
              vacio="No hay boletas que venzan en el rango y filtros elegidos."
            />
            <p className="caption pagos-nota">
              Se consideran las boletas cuyo vencimiento cae en el rango elegido. Las boletas
              anuladas no se incluyen.
            </p>
          </section>
        </>
      )}
    </>
  );
}
