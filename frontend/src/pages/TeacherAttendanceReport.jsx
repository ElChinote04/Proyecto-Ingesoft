
import { useState } from 'react';
import { api } from '../api/client';

const estilos = {
  contenedor: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    marginTop: '24px',
  },
  titulo: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: '#111827',
  },
  subtitulo: {
    color: '#6b7280',
    fontSize: '14px',
    marginTop: '6px',
    marginBottom: '24px',
  },
  filtros: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  campo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  etiqueta: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
  },
  entrada: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    background: '#ffffff',
    color: '#111827',
  },
  acciones: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '20px',
    gap: '10px',
    flexWrap: 'wrap',
  },
  boton: {
    background: '#551c9d',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  botonSecundario: {
    background: '#ffffff',
    color: '#551c9d',
    border: '1px solid #551c9d',
    borderRadius: '8px',
    padding: '11px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  separador: {
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    margin: '28px 0',
  },
  seccion: {
    fontSize: '17px',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '16px',
  },
  tarjetas: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
    gap: '12px',
  },
  tarjeta: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '18px',
    background: '#f9fafb',
  },
  tarjetaTitulo: {
    color: '#6b7280',
    fontSize: '13px',
    margin: 0,
  },
  tarjetaValor: {
    fontSize: '28px',
    fontWeight: 700,
    marginTop: '10px',
    marginBottom: 0,
  },
  tablaContenedor: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
  },
  tabla: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    textAlign: 'left',
  },
  encabezado: {
    padding: '14px',
    background: '#f3f4f6',
    color: '#374151',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  celda: {
    padding: '14px',
    borderTop: '1px solid #e5e7eb',
    color: '#374151',
  },
};

const coloresEstado = {
  PRESENTE: {
    background: '#dcfce7',
    color: '#166534',
  },
  TARDANZA: {
    background: '#fef3c7',
    color: '#92400e',
  },
  AUSENTE: {
    background: '#fee2e2',
    color: '#991b1b',
  },
};

const nombresEstado = {
  PRESENTE: 'Presente',
  TARDANZA: 'Tardanza',
  AUSENTE: 'Ausente',
};

function formatearFecha(fecha) {
  if (!fecha) return '—';

  const valor = String(fecha).slice(0, 10);
  const [anio, mes, dia] = valor.split('-');

  if (!anio || !mes || !dia) return valor;

  return `${dia}/${mes}/${anio}`;
}

export default function TeacherAttendanceReport({ docentes }) {
  const [reporte, setReporte] = useState(null);
  const [docenteId, setDocenteId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [exportandoPDF, setExportandoPDF] = useState(false);
  const [error, setError] = useState('');

  const resumen = reporte?.resumen ?? {};
  const asistencias = reporte?.asistencias ?? [];

  function obtenerDocente(id) {
    const docente = docentes.find(
      (d) => Number(d.id) === Number(id)
    );

    return docente?.nombre ?? `Docente ${id}`;
  }

  function obtenerFiltroDocente() {
    const id = reporte?.filtros?.docenteId;

    if (!id) return 'Todos los docentes';

    return obtenerDocente(id);
  }

  function obtenerFilas() {
    return asistencias.map((asistencia) => [
      obtenerDocente(asistencia.docenteId),
      formatearFecha(asistencia.fecha),
      nombresEstado[asistencia.condicion] ??
        asistencia.condicion,
      asistencia.observacion || '—',
    ]);
  }

  async function generarReporte() {
    if (!fechaInicio || !fechaFin) {
      setReporte(null);
      setError('Selecciona ambas fechas.');
      return;
    }

    if (fechaInicio > fechaFin) {
      setReporte(null);
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }

    setError('');
    setReporte(null);
    setCargando(true);

    try {
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin,
      });

      if (docenteId) {
        params.set('docenteId', docenteId);
      }

      const resultado = await api(
        `/reportes/asistencia/docentes?${params.toString()}`
      );

      setReporte({
        ...resultado,
        filtros: {
          fechaInicio,
          fechaFin,
          docenteId,
        },
      });
    } catch (err) {
      setError(err.message || 'No se pudo generar el reporte.');
    } finally {
      setCargando(false);
    }
  }

  async function descargarExcel() {
    if (!reporte || exportandoExcel) return;

    setError('');
    setExportandoExcel(true);

    try {
      const { default: ExcelJS } = await import('exceljs');

      const libro = new ExcelJS.Workbook();
      const hoja = libro.addWorksheet('Asistencia docente');
      const filtros = reporte.filtros;

      hoja.columns = [
        { key: 'docente', width: 30 },
        { key: 'fecha', width: 18 },
        { key: 'estado', width: 18 },
        { key: 'observacion', width: 45 },
      ];

      hoja.mergeCells('A1:D1');
      hoja.getCell('A1').value =
        'REPORTE DE ASISTENCIA DOCENTE';

      hoja.mergeCells('A2:D2');
      hoja.getCell('A2').value =
        `Período: ${formatearFecha(filtros.fechaInicio)} - ${formatearFecha(filtros.fechaFin)}`;

      hoja.mergeCells('A3:D3');
      hoja.getCell('A3').value =
        `Docente: ${obtenerFiltroDocente()}`;

      hoja.getCell('A5').value = 'RESUMEN';

      const totales = [
        ['Total de registros', reporte.total ?? 0],
        ['Presentes', resumen.PRESENTE ?? 0],
        ['Tardanzas', resumen.TARDANZA ?? 0],
        ['Ausencias', resumen.AUSENTE ?? 0],
      ];

      totales.forEach(([nombre, valor], index) => {
        hoja.getCell(`A${index + 6}`).value = nombre;
        hoja.getCell(`B${index + 6}`).value = valor;
      });

      hoja.getRow(11).values = [
        'Docente',
        'Fecha',
        'Estado',
        'Observación',
      ];

      for (const fila of obtenerFilas()) {
        hoja.addRow(fila);
      }

      hoja.getRow(1).height = 32;
      hoja.getCell('A1').font = {
        bold: true,
        size: 16,
        color: { argb: 'FF551C9D' },
      };

      hoja.getCell('A5').font = {
        bold: true,
        size: 13,
        color: { argb: 'FF551C9D' },
      };

      hoja.getRow(11).height = 26;

      hoja.getRow(11).eachCell((celda) => {
        celda.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };

        celda.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF551C9D' },
        };

        celda.alignment = {
          vertical: 'middle',
        };
      });

      hoja.eachRow((fila, numero) => {
        if (numero > 11) {
          fila.alignment = {
            vertical: 'middle',
            wrapText: true,
          };

          fila.height = 30;

          fila.eachCell((celda) => {
            celda.border = {
              bottom: {
                style: 'thin',
                color: { argb: 'FFE5E7EB' },
              },
            };
          });
        }
      });

      hoja.autoFilter = 'A11:D11';
      hoja.views = [
        { state: 'frozen', ySplit: 11 },
      ];

      const buffer = await libro.xlsx.writeBuffer();

      const archivo = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');

      enlace.href = url;
      enlace.download =
        `asistencia_docente_${filtros.fechaInicio}_${filtros.fechaFin}.xlsx`;

      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError('No se pudo descargar el archivo Excel.');
    } finally {
      setExportandoExcel(false);
    }
  }

  async function descargarPDF() {
    if (!reporte || exportandoPDF) return;

    setError('');
    setExportandoPDF(true);

    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const filtros = reporte.filtros;
      const ancho = pdf.internal.pageSize.getWidth();

      pdf.setFillColor(85, 28, 157);
      pdf.rect(0, 0, ancho, 35, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.text('SAGE', 14, 15);

      pdf.setFontSize(12);
      pdf.text('Reporte de asistencia docente', 14, 25);

      pdf.setTextColor(55, 65, 81);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);

      pdf.text(
        `Período: ${formatearFecha(filtros.fechaInicio)} - ${formatearFecha(filtros.fechaFin)}`,
        14,
        46
      );

      const nombreDocente = obtenerFiltroDocente();

      const textoDocente = pdf.splitTextToSize(
        `Docente: ${nombreDocente}`,
        ancho - 28
      );

      pdf.text(textoDocente, 14, 53);

      const yResumen = 53 + textoDocente.length * 5 + 9;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(85, 28, 157);
      pdf.text('Resumen de asistencia', 14, yResumen);

      autoTable(pdf, {
        startY: yResumen + 5,
        margin: { left: 14, right: 14, bottom: 18 },
        head: [[
          'Total',
          'Presentes',
          'Tardanzas',
          'Ausencias',
        ]],
        body: [[
          reporte.total ?? 0,
          resumen.PRESENTE ?? 0,
          resumen.TARDANZA ?? 0,
          resumen.AUSENTE ?? 0,
        ]],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
          textColor: [255, 255, 255],
        },
        styles: {
          halign: 'center',
          fontSize: 10,
          cellPadding: 4,
        },
      });

      let inicioDetalle = pdf.lastAutoTable.finalY + 14;

      if (inicioDetalle > 260) {
        pdf.addPage();
        inicioDetalle = 20;
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(85, 28, 157);
      pdf.text('Detalle de registros', 14, inicioDetalle);

      const registros = obtenerFilas();

      autoTable(pdf, {
        startY: inicioDetalle + 5,
        margin: {
          left: 14,
          right: 14,
          top: 18,
          bottom: 20,
        },
        head: [[
          'Docente',
          'Fecha',
          'Estado',
          'Observación',
        ]],
        body: registros.length
          ? registros
          : [['Sin registros', '—', '—', '—']],
        theme: 'striped',
        headStyles: {
          fillColor: [85, 28, 157],
          textColor: [255, 255, 255],
        },
        styles: {
          fontSize: 9,
          cellPadding: 3,
          overflow: 'linebreak',
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 27 },
          2: { cellWidth: 30 },
          3: { cellWidth: 'auto' },
        },
      });

      const paginas = pdf.getNumberOfPages();

      for (let i = 1; i <= paginas; i++) {
        pdf.setPage(i);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);

        pdf.text(
          `SAGE - Página ${i} de ${paginas}`,
          14,
          pdf.internal.pageSize.getHeight() - 10
        );
      }

      pdf.save(
        `asistencia_docente_${filtros.fechaInicio}_${filtros.fechaFin}.pdf`
      );
    } catch (err) {
      setError('No se pudo descargar el archivo PDF.');
    } finally {
      setExportandoPDF(false);
    }
  }

  const indicadores = [
    {
      titulo: 'Total de registros',
      valor: reporte?.total ?? 0,
      color: '#111827',
    },
    {
      titulo: 'Presentes',
      valor: resumen.PRESENTE ?? 0,
      color: '#166534',
    },
    {
      titulo: 'Tardanzas',
      valor: resumen.TARDANZA ?? 0,
      color: '#92400e',
    },
    {
      titulo: 'Ausencias',
      valor: resumen.AUSENTE ?? 0,
      color: '#991b1b',
    },
  ];

  return (
    <section style={estilos.contenedor}>
      <h2 style={estilos.titulo}>
        Reporte de asistencia docente
      </h2>

      <p style={estilos.subtitulo}>
        Consulta y analiza los registros de asistencia.
      </p>

      <div style={estilos.filtros}>
        <div style={estilos.campo}>
          <label
            htmlFor="docenteReporte"
            style={estilos.etiqueta}
          >
            Docente
          </label>

          <select
            id="docenteReporte"
            value={docenteId}
            onChange={(e) => setDocenteId(e.target.value)}
            style={estilos.entrada}
          >
            <option value="">Todos los docentes</option>

            {docentes.map((docente) => (
              <option key={docente.id} value={docente.id}>
                {docente.nombre}
              </option>
            ))}
          </select>
        </div>

        <div style={estilos.campo}>
          <label
            htmlFor="fechaInicio"
            style={estilos.etiqueta}
          >
            Desde
          </label>

          <input
            id="fechaInicio"
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            style={estilos.entrada}
          />
        </div>

        <div style={estilos.campo}>
          <label
            htmlFor="fechaFin"
            style={estilos.etiqueta}
          >
            Hasta
          </label>

          <input
            id="fechaFin"
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            style={estilos.entrada}
          />
        </div>
      </div>

      <div style={estilos.acciones}>
        <button
          type="button"
          onClick={generarReporte}
          disabled={cargando}
          style={{
            ...estilos.boton,
            opacity: cargando ? 0.6 : 1,
            cursor: cargando ? 'not-allowed' : 'pointer',
          }}
        >
          {cargando ? 'Generando...' : 'Generar reporte'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      )}

      {reporte && (
        <>
          <hr style={estilos.separador} />

          <h3 style={estilos.seccion}>
            Resumen de asistencia
          </h3>

          <div style={estilos.tarjetas}>
            {indicadores.map((indicador) => (
              <div
                key={indicador.titulo}
                style={estilos.tarjeta}
              >
                <p style={estilos.tarjetaTitulo}>
                  {indicador.titulo}
                </p>

                <p
                  style={{
                    ...estilos.tarjetaValor,
                    color: indicador.color,
                  }}
                >
                  {indicador.valor}
                </p>
              </div>
            ))}
          </div>

          <hr style={estilos.separador} />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '16px',
            }}
          >
            <h3
              style={{
                ...estilos.seccion,
                marginBottom: 0,
              }}
            >
              Detalle de registros
            </h3>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={descargarExcel}
                disabled={exportandoExcel}
                style={{
                  ...estilos.botonSecundario,
                  opacity: exportandoExcel ? 0.6 : 1,
                }}
              >
                {exportandoExcel
                  ? 'Descargando...'
                  : 'Descargar Excel'}
              </button>

              <button
                type="button"
                onClick={descargarPDF}
                disabled={exportandoPDF}
                style={{
                  ...estilos.boton,
                  opacity: exportandoPDF ? 0.6 : 1,
                }}
              >
                {exportandoPDF
                  ? 'Descargando...'
                  : 'Descargar PDF'}
              </button>
            </div>
          </div>

          {asistencias.length === 0 ? (
            <p style={{ color: '#6b7280' }}>
              No hay registros de asistencia en este período.
            </p>
          ) : (
            <div style={estilos.tablaContenedor}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.encabezado}>
                      Docente
                    </th>
                    <th style={estilos.encabezado}>
                      Fecha
                    </th>
                    <th style={estilos.encabezado}>
                      Estado
                    </th>
                    <th style={estilos.encabezado}>
                      Observación
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {asistencias.map((asistencia) => {
                    const estado = asistencia.condicion;

                    return (
                      <tr key={asistencia.id}>
                        <td style={estilos.celda}>
                          {obtenerDocente(asistencia.docenteId)}
                        </td>

                        <td style={estilos.celda}>
                          {formatearFecha(asistencia.fecha)}
                        </td>

                        <td style={estilos.celda}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '5px 10px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background:
                                coloresEstado[estado]?.background ??
                                '#f3f4f6',
                              color:
                                coloresEstado[estado]?.color ??
                                '#374151',
                            }}
                          >
                            {nombresEstado[estado] ?? estado}
                          </span>
                        </td>

                        <td style={estilos.celda}>
                          {asistencia.observacion || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
