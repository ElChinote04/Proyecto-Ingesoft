import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../api/client';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import TablaDatos from '../components/TablaDatos';
import AvisosVencimiento from '../components/AvisosVencimiento';
import { useAuth } from '../hooks/useAuth';
import { useResource } from '../hooks/useResource';

function Historial({ estudiante }) {
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const historial = useResource(
    `/portal/estudiantes/${estudiante.id}/asistencias?pagina=${pagina}&limite=${limite}`,
  );
  if (historial.loading) return <Loading>Cargando asistencias…</Loading>;
  if (historial.error) return <ResourceError {...historial} />;
  return (
    <section className="portal-historial">
      <h2>Asistencia de {estudiante.nombre}</h2>
      <TablaDatos
        columnas={['Fecha', 'Curso', 'Estado', 'Observación']}
        filas={historial.data.registros.map((registro) => ({
          id: registro.id,
          celdas: [
            new Date(registro.fecha + 'T12:00:00').toLocaleDateString('es-PE'),
            registro.curso,
            <span
              key="estado"
              className={`badge ${registro.estado === 'PRESENTE' ? 'success' : registro.estado === 'TARDANZA' ? 'warning' : 'danger'}`}
            >
              {{ PRESENTE: 'Presente', TARDANZA: 'Tardanza', AUSENTE: 'Ausente' }[
                registro.estado
              ] ?? registro.estado}
            </span>,
            registro.observacion || '—',
          ],
        }))}
        vacio="Todavía no hay asistencias registradas para este estudiante."
      />
      <div className="pagination">
        <label>
          Filas por página{' '}
          <select
            value={limite}
            onChange={(e) => {
              setLimite(Number(e.target.value));
              setPagina(1);
            }}
          >
            {[10, 25, 50].map((cantidad) => (
              <option key={cantidad}>{cantidad}</option>
            ))}
          </select>
        </label>
        <span>
          Página {pagina} de {Math.max(1, Math.ceil(historial.data.total / limite))}
        </span>
        <button className="secondary" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>
          Anterior
        </button>
        <button
          className="secondary"
          disabled={pagina * limite >= historial.data.total}
          onClick={() => setPagina(pagina + 1)}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
function IconoExportacionPortal({ formato }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      {formato === 'excel' ? <path d="M8 13h8M8 17h8M12 11v8" /> : <path d="M8 12h8M8 16h6" />}
    </svg>
  );
}

const COLORES_ASISTENCIA = {
  PRESENTE: '#4ade80',
  TARDANZA: '#fde047',
  AUSENTE: '#f87171',
};

const ESTADOS_ASISTENCIA = [
  { clave: 'PRESENTE', nombre: 'Presentes', texto: '#166534' },
  { clave: 'TARDANZA', nombre: 'Tardanzas', texto: '#92400e' },
  { clave: 'AUSENTE', nombre: 'Ausencias', texto: '#b91c1c' },
];

const estiloTarjeta = {
  background: '#fff',
  border: '1px solid #e2e5eb',
  borderRadius: '12px',
  padding: '18px',
};

function formatearFechaAsistencia(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) return fecha ?? '';
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

function contarAsistencias(registros) {
  const conteo = { PRESENTE: 0, TARDANZA: 0, AUSENTE: 0 };
  for (const registro of registros) {
    if (Object.prototype.hasOwnProperty.call(conteo, registro.estado)) {
      conteo[registro.estado] += 1;
    }
  }
  const total = conteo.PRESENTE + conteo.TARDANZA + conteo.AUSENTE;
  return { ...conteo, total };
}

function porcentajeAsistencia(cantidad, total) {
  return total ? (cantidad / total) * 100 : 0;
}

function GraficoCircularAsistencia({ totales }) {
  const radio = 85;
  const perimetro = 2 * Math.PI * radio;
  let acumulado = 0;
  return (
    <div style={{ ...estiloTarjeta, display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'center' }}>
      <svg role="img" aria-label={`Gráfico circular de asistencia: ${totales.PRESENTE} presentes, ${totales.TARDANZA} tardanzas y ${totales.AUSENTE} ausencias`}
        viewBox="0 0 240 240" style={{ width: 'min(100%, 240px)', height: 'auto', flexShrink: 0 }}>
        <title>Distribución de asistencia</title>
        <circle cx="120" cy="120" r={radio} fill="none" stroke="#e5e7eb" strokeWidth="29" />
        {ESTADOS_ASISTENCIA.map((estado) => {
          const largo = (totales[estado.clave] / totales.total) * perimetro;
          const desplazamiento = -acumulado;
          acumulado += largo;
          return largo > 0 && (
            <circle key={estado.clave} cx="120" cy="120" r={radio} fill="none"
              stroke={COLORES_ASISTENCIA[estado.clave]} strokeWidth="29"
              strokeDasharray={`${largo} ${perimetro - largo}`}
              strokeDashoffset={desplazamiento} transform="rotate(-90 120 120)" />
          );
        })}
        <text x="120" y="115" textAnchor="middle" fontSize="28" fontWeight="700" fill="#111827">
          {porcentajeAsistencia(totales.PRESENTE, totales.total).toFixed(2)}%
        </text>
        <text x="120" y="139" textAnchor="middle" fontSize="13" fill="#64748b">Presentes</text>
      </svg>
      <div style={{ minWidth: '205px', flex: '1 1 230px', maxWidth: '370px' }}>
        <h3 style={{ fontSize: '17px', margin: '0 0 12px' }}>Distribución de asistencias</h3>
        {ESTADOS_ASISTENCIA.map((estado) => (
          <div key={estado.clave} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '13px' }}>
            <span aria-hidden="true" style={{ width: '13px', height: '13px', borderRadius: '3px', background: COLORES_ASISTENCIA[estado.clave] }} />
            <span style={{ flex: 1, fontSize: '14px' }}>{estado.nombre}</span>
            <strong style={{ fontSize: '14px', color: estado.texto }}>
              {totales[estado.clave]} ({porcentajeAsistencia(totales[estado.clave], totales.total).toFixed(2)}%)
            </strong>
          </div>
        ))}
        <p className="muted" style={{ fontSize: '12px', margin: '6px 0 0' }}>
          Basado en {totales.total} registros del periodo seleccionado.
        </p>
      </div>
    </div>
  );
}

// La API del portal permite 10, 25 o 50 registros por página.
// Obtenemos todas las páginas autorizadas antes de calcular los totales o exportar.
async function obtenerTodasLasAsistencias(estudianteId, signal) {
  const ruta = `/portal/estudiantes/${estudianteId}/asistencias`;
  const primera = await api(`${ruta}?pagina=1&limite=50`, { signal });
  const totalPaginas = Math.ceil((primera.total ?? 0) / 50);
  const registros = [...(primera.registros ?? [])];

  for (let inicio = 2; inicio <= totalPaginas; inicio += 4) {
    const finales = Math.min(totalPaginas, inicio + 3);
    const paginas = Array.from({ length: finales - inicio + 1 }, (_, indice) => inicio + indice);
    const resultados = await Promise.all(
      paginas.map((pagina) => api(`${ruta}?pagina=${pagina}&limite=50`, { signal })),
    );
    for (const resultado of resultados) registros.push(...(resultado.registros ?? []));
  }

  return registros.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.id ?? 0) - (a.id ?? 0));
}

function dibujarDonaParaExportar(totales) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo preparar el gráfico.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 34px Arial';
  ctx.fillText('Distribución de asistencias', 48, 64);
  const centroX = 275;
  const centroY = 295;
  const radio = 150;
  ctx.lineWidth = 56;
  ctx.strokeStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.arc(centroX, centroY, radio, 0, Math.PI * 2);
  ctx.stroke();
  let inicio = -Math.PI / 2;
  for (const estado of ESTADOS_ASISTENCIA) {
    const angulo = (totales[estado.clave] / totales.total) * 2 * Math.PI;
    if (angulo <= 0) continue;
    ctx.beginPath();
    ctx.strokeStyle = COLORES_ASISTENCIA[estado.clave];
    ctx.arc(centroX, centroY, radio, inicio, inicio + angulo);
    ctx.stroke();
    inicio += angulo;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 44px Arial';
  ctx.fillText(`${porcentajeAsistencia(totales.PRESENTE, totales.total).toFixed(2)}%`, centroX, centroY + 2);
  ctx.fillStyle = '#64748b';
  ctx.font = '24px Arial';
  ctx.fillText('Presentes', centroX, centroY + 39);
  ctx.textAlign = 'left';
  ESTADOS_ASISTENCIA.forEach((estado, indice) => {
    const y = 190 + indice * 95;
    ctx.fillStyle = COLORES_ASISTENCIA[estado.clave];
    ctx.fillRect(570, y, 28, 28);
    ctx.fillStyle = '#111827';
    ctx.font = '27px Arial';
    ctx.fillText(estado.nombre, 615, y + 24);
    ctx.font = 'bold 25px Arial';
    ctx.fillText(`${totales[estado.clave]} (${porcentajeAsistencia(totales[estado.clave], totales.total).toFixed(2)}%)`, 615, y + 58);
  });
  return canvas.toDataURL('image/png');
}

function descargarBlobLocal(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function HistorialApoderado({ estudiante }) {
  const [registros, setRegistros] = useState(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [exportando, setExportando] = useState('');
  const [errorExportacion, setErrorExportacion] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    obtenerTodasLasAsistencias(estudiante.id, controller.signal)
      .then((resultado) => {
        if (!controller.signal.aborted) setRegistros(resultado);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message || 'No se pudo consultar las asistencias.');
      });
    return () => controller.abort();
  }, [estudiante.id, intento]);

  const fechasInvalidas = Boolean(fechaInicio && fechaFin && fechaInicio > fechaFin);
  const filtrados = useMemo(() => (registros ?? []).filter((registro) =>
    (!fechaInicio || registro.fecha >= fechaInicio) &&
    (!fechaFin || registro.fecha <= fechaFin)), [registros, fechaInicio, fechaFin]);
  const totales = useMemo(() => contarAsistencias(filtrados), [filtrados]);
  const paginaMaxima = Math.max(1, Math.ceil(filtrados.length / limite));
  const paginaActual = Math.min(pagina, paginaMaxima);
  const visibles = filtrados.slice((paginaActual - 1) * limite, paginaActual * limite);
  const periodo = `${fechaInicio || 'inicio'}_${fechaFin || 'fin'}`;
  const nombreBase = `Asistencias_${estudiante.codigo}_${periodo}`.replace(/[^a-zA-Z0-9_.-]/g, '_');

  async function exportarExcel() {
    if (!totales.total || fechasInvalidas || exportando) return;
    setExportando('excel');
    setErrorExportacion('');
    try {
      const libro = new ExcelJS.Workbook();
      libro.creator = 'SAGE';
      libro.subject = `Asistencias de ${estudiante.nombre}`;
      const hoja = libro.addWorksheet('Resumen y gráfico');
      hoja.columns = [{ width: 24 }, { width: 30 }, { width: 20 }, { width: 20 }];
      hoja.mergeCells('A1:D2');
      const titulo = hoja.getCell('A1');
      titulo.value = `SAGE - ASISTENCIAS DE ${estudiante.nombre}`;
      titulo.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
      titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF551C9D' } };
      titulo.alignment = { vertical: 'middle', horizontal: 'center' };
      hoja.addRow([]);
      hoja.addRow(['Estudiante', estudiante.nombre]);
      hoja.addRow(['Desde', fechaInicio ? formatearFechaAsistencia(fechaInicio) : 'Todos los registros']);
      hoja.addRow(['Hasta', fechaFin ? formatearFechaAsistencia(fechaFin) : 'Todos los registros']);
      hoja.addRow(['Total de registros', totales.total]);
      ESTADOS_ASISTENCIA.forEach((estado) => {
        hoja.addRow([estado.nombre, totales[estado.clave], 'Porcentaje', totales[estado.clave] / totales.total]);
        hoja.getCell(`D${hoja.lastRow.number}`).numFmt = '0.00%';
      });
      hoja.addRow([]);
      const imagen = libro.addImage({ base64: dibujarDonaParaExportar(totales), extension: 'png' });
      hoja.addImage(imagen, { tl: { col: 0, row: 12 }, ext: { width: 635, height: 343 } });
      const detalle = libro.addWorksheet('Detalle por fecha');
      detalle.columns = [
        { header: 'Fecha', key: 'fecha', width: 20 },
        { header: 'Curso', key: 'curso', width: 45 },
        { header: 'Estado', key: 'estado', width: 20 },
        { header: 'Observación', key: 'observacion', width: 55 },
      ];
      detalle.getRow(1).height = 28;
      detalle.getRow(1).eachCell((celda) => {
        celda.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF551C9D' } };
        celda.alignment = { vertical: 'middle' };
      });
      filtrados.forEach((registro) => {
        detalle.addRow({
          fecha: formatearFechaAsistencia(registro.fecha),
          curso: registro.curso,
          estado: { PRESENTE: 'Presente', TARDANZA: 'Tardanza', AUSENTE: 'Ausente' }[registro.estado] ?? registro.estado,
          observacion: registro.observacion || '',
        });
      });
      detalle.views = [{ state: 'frozen', ySplit: 1 }];
      detalle.autoFilter = { from: 'A1', to: `D${filtrados.length + 1}` };
      const contenido = await libro.xlsx.writeBuffer();
      descargarBlobLocal(new Blob([contenido], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${nombreBase}.xlsx`);
    } catch (err) {
      setErrorExportacion(err.message || 'No se pudo exportar el Excel.');
    } finally {
      setExportando('');
    }
  }

  function exportarPDF() {
    if (!totales.total || fechasInvalidas || exportando) return;
    setExportando('pdf');
    setErrorExportacion('');
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.setFillColor(85, 28, 157);
      pdf.rect(0, 0, 297, 27, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(17);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SAGE - Reporte de asistencia del estudiante', 14, 18);
      pdf.setTextColor(55, 65, 81);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Estudiante: ${estudiante.nombre}`, 14, 38);
      pdf.text(`Periodo: ${fechaInicio ? formatearFechaAsistencia(fechaInicio) : 'Inicio'} - ${fechaFin ? formatearFechaAsistencia(fechaFin) : 'Fin'}`, 14, 46);
      pdf.text(`Registros: ${totales.total}  |  Presentes: ${totales.PRESENTE} (${porcentajeAsistencia(totales.PRESENTE, totales.total).toFixed(2)}%)  |  Tardanzas: ${totales.TARDANZA}  |  Ausencias: ${totales.AUSENTE}`, 14, 55);
      pdf.addImage(dibujarDonaParaExportar(totales), 'PNG', 14, 61, 135, 73);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Detalle de asistencia por fecha', 14, 145);
      autoTable(pdf, {
        startY: 149,
        head: [['Fecha', 'Curso', 'Estado', 'Observación']],
        body: filtrados.map((registro) => [
          formatearFechaAsistencia(registro.fecha),
          registro.curso,
          { PRESENTE: 'Presente', TARDANZA: 'Tardanza', AUSENTE: 'Ausente' }[registro.estado] ?? registro.estado,
          registro.observacion || '—',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [85, 28, 157] },
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { left: 14, right: 14, bottom: 16 },
      });
      pdf.save(`${nombreBase}.pdf`);
    } catch (err) {
      setErrorExportacion(err.message || 'No se pudo exportar el PDF.');
    } finally {
      setExportando('');
    }
  }

  if (!registros && !error) return <Loading>Cargando historial completo de asistencias…</Loading>;
  if (error) return (
    <section className="portal-historial">
      <Feedback intent="danger">{error}</Feedback>
      <button className="secondary" type="button" onClick={() => {
        setRegistros(null);
        setError('');
        setIntento((n) => n + 1);
      }}>Reintentar</button>
    </section>
  );

  return (
    <section className="portal-historial">
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
        <h2 style={{ margin: 0 }}>Asistencia de {estudiante.nombre}</h2>
        <div className="actions" style={{ margin: 0 }}>
          <button type="button" className="secondary" onClick={exportarExcel}
            disabled={Boolean(exportando) || !totales.total || fechasInvalidas}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <IconoExportacionPortal formato="excel" />
            {exportando === 'excel' ? 'Exportando Excel…' : 'Exportar Excel'}
          </button>
          <button type="button" className="secondary" onClick={exportarPDF}
            disabled={Boolean(exportando) || !totales.total || fechasInvalidas}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <IconoExportacionPortal formato="pdf" />
            {exportando === 'pdf' ? 'Exportando PDF…' : 'Exportar PDF'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'end', margin: '20px 0' }}>
        <label className="field" style={{ flex: '1 1 175px', maxWidth: '260px' }}>
          Desde
          <input type="date" value={fechaInicio} max={fechaFin || undefined}
            onChange={(e) => { setFechaInicio(e.target.value); setPagina(1); }} />
        </label>
        <label className="field" style={{ flex: '1 1 175px', maxWidth: '260px' }}>
          Hasta
          <input type="date" value={fechaFin} min={fechaInicio || undefined}
            onChange={(e) => { setFechaFin(e.target.value); setPagina(1); }} />
        </label>
        <button type="button" className="secondary" onClick={() => {
          setFechaInicio(''); setFechaFin(''); setPagina(1);
        }}>Limpiar fechas</button>
      </div>
      {fechasInvalidas && <Feedback intent="warning">La fecha inicial no puede ser posterior a la final.</Feedback>}
      {errorExportacion && <Feedback intent="danger">{errorExportacion}</Feedback>}
      {!fechasInvalidas && !filtrados.length ? (
        <Feedback intent="info" title="Sin asistencias registradas">
          No se encontraron asistencias para las fechas seleccionadas. Puedes cambiar el periodo para volver a consultar.
        </Feedback>
      ) : !fechasInvalidas && (
        <>
          <h3 style={{ marginTop: '20px' }}>Resumen general</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', margin: '12px 0 22px' }}>
            {[
              { nombre: 'Registros', valor: totales.total, color: '#111827' },
              ...ESTADOS_ASISTENCIA.map((estado) => ({ nombre: estado.nombre, valor: totales[estado.clave], color: estado.texto })),
              ...ESTADOS_ASISTENCIA.map((estado) => ({ nombre: `% ${estado.nombre}`, valor: `${porcentajeAsistencia(totales[estado.clave], totales.total).toFixed(2)}%`, color: estado.texto })),
            ].map((indicador) => (
              <div key={indicador.nombre} style={{ ...estiloTarjeta, background: '#f9fafb' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{indicador.nombre}</p>
                <strong style={{ display: 'block', fontSize: '25px', marginTop: '9px', color: indicador.color }}>{indicador.valor}</strong>
              </div>
            ))}
          </div>
          <h3>Gráfico de asistencia</h3>
          <GraficoCircularAsistencia totales={totales} />
          <h3 style={{ marginTop: '26px' }}>Detalle de asistencia por fecha</h3>
          <TablaDatos
            columnas={['Fecha', 'Curso', 'Estado', 'Observación']}
            filas={visibles.map((registro) => ({
              id: registro.id,
              celdas: [
                formatearFechaAsistencia(registro.fecha),
                registro.curso,
                <span key="estado" className={`badge ${registro.estado === 'PRESENTE' ? 'success' : registro.estado === 'TARDANZA' ? 'warning' : 'danger'}`}>
                  {{ PRESENTE: 'Presente', TARDANZA: 'Tardanza', AUSENTE: 'Ausente' }[registro.estado] ?? registro.estado}
                </span>,
                registro.observacion || '—',
              ],
            }))}
            vacio="No hay asistencias para este periodo."
          />
          <div className="pagination">
            <label>
              Filas por página{' '}
              <select value={limite} onChange={(e) => { setLimite(Number(e.target.value)); setPagina(1); }}>
                {[10, 25, 50].map((cantidad) => <option key={cantidad} value={cantidad}>{cantidad}</option>)}
              </select>
            </label>
            <span>Página {paginaActual} de {paginaMaxima}</span>
            <button className="secondary" type="button" disabled={paginaActual === 1}
              onClick={() => setPagina(paginaActual - 1)}>Anterior</button>
            <button className="secondary" type="button" disabled={paginaActual >= paginaMaxima}
              onClick={() => setPagina(paginaActual + 1)}>Siguiente</button>
          </div>
        </>
      )}
    </section>
  );
}


// Inicio del apoderado: vista breve, sin gráficos, filtros ni descargas.
// Las cifras se obtienen de todas las páginas de la API autorizada.
function ResumenAsistenciaInicio({ estudiante }) {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResumen(null);
    setError('');
    obtenerTodasLasAsistencias(estudiante.id, controller.signal)
      .then((registros) => {
        if (!controller.signal.aborted) setResumen(contarAsistencias(registros));
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message || 'No fue posible consultar las asistencias.');
        }
      });
    return () => controller.abort();
  }, [estudiante.id, intento]);

  return (
    <section className="portal-historial" aria-label="Resumen de asistencias">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Resumen de asistencias de {estudiante.nombre}</h2>
        <button type="button" className="secondary" onClick={() => {
          window.location.hash = `/portal/asistencias?estudiante=${estudiante.id}`;
        }}>
          Ver detalle de asistencias
        </button>
      </div>
      {!resumen && !error && <Loading>Cargando resumen de asistencias…</Loading>}
      {error && (
        <div style={{ marginTop: '12px' }}>
          <Feedback intent="danger">{error}</Feedback>
          <button type="button" className="secondary" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {resumen && (resumen.total === 0 ? (
        <Feedback intent="info" title="Sin asistencias registradas">
          Todavía no hay registros para este estudiante.
        </Feedback>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {ESTADOS_ASISTENCIA.map((estado) => (
            <article key={estado.clave} style={{ ...estiloTarjeta, background: '#f9fafb' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{estado.nombre}</p>
              <strong style={{ display: 'block', fontSize: '24px', marginTop: '7px', color: estado.texto }}>
                {resumen[estado.clave]}
              </strong>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {porcentajeAsistencia(resumen[estado.clave], resumen.total).toFixed(2)}% del total
              </span>
            </article>
          ))}
        </div>
      ))}
    </section>
  );
}

export default function Portal({ vista = 'inicio' }) {
  const { user } = useAuth();
  const estudiantes = useResource('/portal/estudiantes');
  const [seleccion, setSeleccion] = useState(() => {
    const query = window.location.hash.split('?')[1] ?? '';
    const id = Number(new URLSearchParams(query).get('estudiante'));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  const estudiante =
    estudiantes.data?.find((item) => item.id === seleccion) ?? estudiantes.data?.[0];
  const matricula = estudiante?.matriculas[0];
  const esApoderado = user.roles.includes('APODERADO');
  const vistaAsistencias = esApoderado && vista === 'asistencias';
  return (
    <AppLayout
      section={vistaAsistencias ? 'Asistencias del apoderado' : 'Portal académico'}
      step={vistaAsistencias ? 'Asistencias' : esApoderado ? 'Panel del apoderado' : 'Panel del estudiante'}
      anioAcademico={matricula?.anioAcademico}
    >
      <div className="page-heading portal-heading">
        <div>
          <h1>{vistaAsistencias ? 'Asistencias de mis hijos' : `Hola, ${user.nombre.split(' ')[0]}`}</h1>
          <p className="muted">
            {vistaAsistencias
              ? 'Consulta el historial, los porcentajes y los reportes de asistencia de tus estudiantes vinculados.'
              : esApoderado
                ? 'Consulta la información académica de tus estudiantes vinculados.'
                : 'Consulta tu información académica y asistencia.'}
          </p>
        </div>
        <span className="badge success">Sesión segura</span>
      </div>
      {esApoderado && !vistaAsistencias && <AvisosVencimiento />}
      {estudiantes.loading && <Loading>Cargando información…</Loading>}
      {estudiantes.error && <ResourceError {...estudiantes} />}
      {estudiantes.data && !estudiantes.data.length && (
        <Feedback intent="info">
          {user.roles.includes('APODERADO')
            ? 'Todavía no tienes estudiantes vinculados. Solicita a la administración que registre el vínculo familiar.'
            : 'Tu cuenta aún no tiene un perfil de estudiante asociado. Comunícate con la administración.'}
        </Feedback>
      )}
      {estudiante && (
        <>
          {estudiantes.data.length > 1 && (
            <label className="field portal-selector">
              Consultar estudiante
              <select value={estudiante.id} onChange={(e) => setSeleccion(Number(e.target.value))}>
                {estudiantes.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!vistaAsistencias && <section className="portal-summary" aria-label="Información académica">
            <article className="card portal-summary-card">
              <p className="muted">Estudiante</p>
              <strong>{estudiante.nombre}</strong>
              <p className="caption">Código {estudiante.codigo}</p>
            </article>
            <article className="card portal-summary-card horario-tone-0">
              <p className="muted">Matrícula vigente</p>
              <strong>{matricula?.seccion ?? 'Sin matrícula vigente'}</strong>
              <p className="caption">Sección del año académico activo</p>
            </article>
            <article className="card portal-summary-card horario-tone-1">
              <p className="muted">Año académico</p>
              <strong>{matricula?.anioAcademico ?? 'Sin matrícula vigente'}</strong>
              <p className="caption">
                {matricula ? 'Matrícula activa' : 'Consulta con la administración'}
              </p>
            </article>
          </section>}
          {!vistaAsistencias && (user.roles.includes('ALUMNO') || esApoderado) && (
            <section className="portal-historial">
              <h2>Acciones frecuentes</h2>
              <div className="actions">
                {user.roles.includes('ALUMNO') && (
                  <button
                    onClick={() => {
                      window.location.hash = '/horario';
                    }}
                  >
                    Ver mi horario
                  </button>
                )}
                {esApoderado && (
                  <button
                    onClick={() => {
                      window.location.hash = '/pagos';
                    }}
                  >
                    Ver pagos y boletas
                  </button>
                )}
                <button
                  onClick={() => {
                    window.location.hash = '/evaluaciones';
                  }}
                >
                  Ver y descargar libreta
                </button>
              </div>
            </section>
          )}
          {vistaAsistencias ? (
            <HistorialApoderado key={estudiante.id} estudiante={estudiante} />
          ) : esApoderado ? (
            <ResumenAsistenciaInicio key={estudiante.id} estudiante={estudiante} />
          ) : (
            <Historial key={estudiante.id} estudiante={estudiante} />
          )}
        </>
      )}
    </AppLayout>
  );
}
