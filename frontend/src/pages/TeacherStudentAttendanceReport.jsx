
import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../api/client';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading } from '../components/Feedback';

const estilos = {
  tarjeta: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px',
  },
  filtros: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '16px',
    marginTop: '20px',
  },
  campo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    fontWeight: 600,
    fontSize: '14px',
  },
  entrada: {
    width: '100%',
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    background: '#ffffff',
    color: '#111827',
    boxSizing: 'border-box',
  },
  acciones: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '20px',
  },
  boton: {
    background: '#551c9d',
    color: '#ffffff',
    padding: '11px 18px',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  resumen: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
    gap: '12px',
    margin: '20px 0',
  },
  indicador: {
    padding: '17px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
  },
  tabla: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  celda: {
    padding: '13px',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left',
  },
};

function porcentaje(valor, total) {
  return total > 0
    ? Number(((valor / total) * 100).toFixed(2))
    : 0;
}

function resumenEstudiante(alumno) {
  const presentes = alumno.resumen?.PRESENTE ?? 0;
  const tardanzas = alumno.resumen?.TARDANZA ?? 0;
  const ausencias = alumno.resumen?.AUSENTE ?? 0;
  const total = presentes + tardanzas + ausencias;

  return {
    presentes,
    tardanzas,
    ausencias,
    asistencia: porcentaje(presentes + tardanzas, total),
    tardanza: porcentaje(tardanzas, total),
    ausencia: porcentaje(ausencias, total),
  };
}

function guardarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');

  enlace.href = url;
  enlace.download = nombre;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatearFecha(fecha) {
  if (!fecha || typeof fecha !== 'string') return '';

  const partes = fecha.slice(0, 10).split('-');

  return partes.length === 3
    ? `${partes[2]}/${partes[1]}/${partes[0]}`
    : fecha;
}

function nombreEstado(estado) {
  if (estado === 'PRESENTE') return 'Presente';
  if (estado === 'TARDANZA') return 'Tardanza';
  if (estado === 'AUSENTE') return 'Ausente';
  return estado ?? '';
}

function estadoColor(estado) {
  if (estado === 'PRESENTE') {
    return {
      color: '#166534',
      background: '#dcfce7',
    };
  }

  if (estado === 'TARDANZA') {
    return {
      color: '#92400e',
      background: '#fef3c7',
    };
  }

  return {
    color: '#991b1b',
    background: '#fee2e2',
  };
}

const encabezadosDetalle = [
  'Fecha',
  'Estudiante',
  'Código',
  'Curso',
  'Estado',
  'Observación',
];

const encabezadosResumen = [
  'Estudiante',
  'Código',
  'Presente',
  'Tardanza',
  'Ausente',
  '% Asistencia',
  '% Tardanzas',
  '% Ausencias',
];

function filasDetalle(reporte) {
  return (reporte?.detalle ?? []).map((registro) => [
    formatearFecha(registro.fecha),
    registro.estudiante,
    registro.codigo ?? '',
    registro.curso ?? '',
    nombreEstado(registro.estado),
    registro.observacion ?? '',
  ]);
}

function filasResumen(reporte) {
  return (reporte?.alumnos ?? []).map((alumno) => {
    const r = resumenEstudiante(alumno);

    return [
      alumno.nombre,
      alumno.codigo,
      r.presentes,
      r.tardanzas,
      r.ausencias,
      `${r.asistencia.toFixed(2)}%`,
      `${r.tardanza.toFixed(2)}%`,
      `${r.ausencia.toFixed(2)}%`,
    ];
  });
}

function aplicarEncabezadoExcel(fila) {
  fila.eachCell((celda) => {
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
      wrapText: true,
    };
  });
}

export default function TeacherStudentAttendanceReport() {
  const [sesiones, setSesiones] = useState([]);
  const [alumnos, setAlumnos] = useState([]);

  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const [error, setError] = useState('');
  const [reporte, setReporte] = useState(null);
  const [filtrosReporte, setFiltrosReporte] = useState(null);

  const [seccionId, setSeccionId] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    api('/sesiones', {
      signal: controller.signal,
    })
      .then((resultado) => {
        if (!controller.signal.aborted) {
          setSesiones(
            Array.isArray(resultado) ? resultado : []
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCargandoDatos(false);
        }
      });

    return () => controller.abort();
  }, []);

  const secciones = Array.from(
    new Map(
      sesiones.map((sesion) => [
        sesion.seccion.id,
        sesion.seccion,
      ])
    ).values()
  ).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );

  const sesionesSeccion = sesiones.filter(
    (sesion) =>
      String(sesion.seccion.id) === seccionId
  );

  const cursos = Array.from(
    new Map(
      sesionesSeccion.map((sesion) => [
        sesion.curso.id,
        sesion.curso,
      ])
    ).values()
  ).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );

  useEffect(() => {
    if (!seccionId) {
      setAlumnos([]);
      setCargandoAlumnos(false);
      return;
    }

    const sesion = sesiones.find(
      (item) =>
        String(item.seccion.id) === seccionId
    );

    if (!sesion) {
      setAlumnos([]);
      setCargandoAlumnos(false);
      return;
    }

    const controller = new AbortController();

    setCargandoAlumnos(true);

    api(`/sesiones/${sesion.id}/alumnos`, {
      signal: controller.signal,
    })
      .then((resultado) => {
        if (!controller.signal.aborted) {
          setAlumnos(resultado.alumnos ?? []);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setAlumnos([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCargandoAlumnos(false);
        }
      });

    return () => controller.abort();
  }, [seccionId, sesiones]);

  function limpiarReporte() {
    setReporte(null);
    setFiltrosReporte(null);
    setError('');
  }

  async function consultar(e) {
    e.preventDefault();

    limpiarReporte();

    if (!seccionId || !fechaInicio || !fechaFin) {
      setError(
        'Selecciona una sección y un rango de fechas.'
      );
      return;
    }

    if (fechaInicio > fechaFin) {
      setError(
        'La fecha inicial no puede superar a la final.'
      );
      return;
    }

    setConsultando(true);

    try {
      const params = new URLSearchParams({
        seccionId,
        fechaInicio,
        fechaFin,
      });

      if (cursoId) {
        params.set('cursoId', cursoId);
      }

      if (alumnoId) {
        params.set('alumnoId', alumnoId);
      }

      const resultado = await api(
        `/reportes/asistencia/estudiantes?${params.toString()}`
      );

      setReporte(resultado);

      setFiltrosReporte({
        seccion:
          secciones.find(
            (s) => String(s.id) === seccionId
          )?.nombre ?? '',
        curso:
          cursos.find(
            (c) => String(c.id) === cursoId
          )?.nombre ?? 'Todos mis cursos',
        alumno:
          alumnos.find(
            (a) => String(a.alumnoId) === alumnoId
          )?.nombre ?? 'Todos los alumnos',
        fechaInicio,
        fechaFin,
      });
    } catch (e) {
      setError(
        e.message || 'No se pudo generar el reporte.'
      );
    } finally {
      setConsultando(false);
    }
  }

  const total = reporte?.total ?? 0;
  const presentes = reporte?.resumen?.PRESENTE ?? 0;
  const tardanzas = reporte?.resumen?.TARDANZA ?? 0;
  const ausencias = reporte?.resumen?.AUSENTE ?? 0;

  const indicadores = [
    ['Registros', total, '#111827'],
    ['Presentes', presentes, '#166534'],
    ['Tardanzas', tardanzas, '#92400e'],
    ['Ausencias', ausencias, '#991b1b'],
    [
      '% Asistencia',
      `${porcentaje(presentes + tardanzas, total)}%`,
      '#2563eb',
    ],
    [
      '% Tardanzas',
      `${porcentaje(tardanzas, total)}%`,
      '#b45309',
    ],
    [
      '% Ausencias',
      `${porcentaje(ausencias, total)}%`,
      '#dc2626',
    ],
  ];

  const detalle = reporte?.detalle ?? [];
  const filasPorFecha = filasDetalle(reporte);
  const filasPorAlumno = filasResumen(reporte);

  async function exportarExcel() {
    if (!reporte || !filtrosReporte || exportando) {
      return;
    }

    setExportando(true);
    setError('');

    try {
      const libro = new ExcelJS.Workbook();

      libro.creator = 'SAGE';
      libro.subject = 'Reporte de asistencia estudiantil';

      const hoja = libro.addWorksheet('Resumen');

      hoja.columns = [
        { width: 33 },
        { width: 20 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
      ];

      hoja.mergeCells('A1:H2');

      const titulo = hoja.getCell('A1');

      titulo.value =
        'SAGE - REPORTE DE ASISTENCIA ESTUDIANTIL';

      titulo.font = {
        size: 17,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };

      titulo.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF551C9D' },
      };

      titulo.alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };

      const filtros = [
        ['Sección', filtrosReporte.seccion],
        ['Curso', filtrosReporte.curso],
        ['Alumno', filtrosReporte.alumno],
        ['Desde', formatearFecha(filtrosReporte.fechaInicio)],
        ['Hasta', formatearFecha(filtrosReporte.fechaFin)],
      ];

      filtros.forEach(([nombre, valor]) => {
        const fila = hoja.addRow([nombre, valor]);
        fila.getCell(1).font = { bold: true };
      });

      hoja.addRow([]);

      const tituloResumen = hoja.addRow([
        'RESUMEN GENERAL',
      ]);

      tituloResumen.getCell(1).font = {
        bold: true,
        color: { argb: 'FF551C9D' },
        size: 12,
      };

      indicadores.forEach(([nombre, valor]) => {
        hoja.addRow([nombre, valor]);
      });

      hoja.addRow([]);

      const tituloAlumnos = hoja.addRow([
        'RESUMEN POR ESTUDIANTE',
      ]);

      tituloAlumnos.getCell(1).font = {
        bold: true,
        color: { argb: 'FF551C9D' },
        size: 12,
      };

      const encabezadoResumen = hoja.addRow(
        encabezadosResumen
      );

      aplicarEncabezadoExcel(encabezadoResumen);

      filasPorAlumno.forEach((fila) => {
        hoja.addRow(fila);
      });

      if (!filasPorAlumno.length) {
        hoja.addRow(['Sin registros']);
      }

      hoja.pageSetup.orientation = 'landscape';
      hoja.pageSetup.fitToPage = true;
      hoja.pageSetup.fitToWidth = 1;

      const hojaDetalle = libro.addWorksheet(
        'Detalle por fecha'
      );

      hojaDetalle.columns = [
        { header: 'Fecha', key: 'fecha', width: 17 },
        {
          header: 'Estudiante',
          key: 'estudiante',
          width: 32,
        },
        { header: 'Código', key: 'codigo', width: 22 },
        { header: 'Curso', key: 'curso', width: 37 },
        { header: 'Estado', key: 'estado', width: 17 },
        {
          header: 'Observación',
          key: 'observacion',
          width: 45,
        },
      ];

      aplicarEncabezadoExcel(hojaDetalle.getRow(1));

      filasPorFecha.forEach((fila) => {
        hojaDetalle.addRow(fila);
      });

      if (!filasPorFecha.length) {
        hojaDetalle.addRow(['Sin registros']);
      }

      hojaDetalle.views = [
        {
          state: 'frozen',
          ySplit: 1,
        },
      ];

      hojaDetalle.autoFilter = {
        from: 'A1',
        to: `F${Math.max(2, filasPorFecha.length + 1)}`,
      };

      hojaDetalle.pageSetup.orientation = 'landscape';
      hojaDetalle.pageSetup.fitToPage = true;
      hojaDetalle.pageSetup.fitToWidth = 1;

      const buffer = await libro.xlsx.writeBuffer();

      guardarBlob(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `Reporte_Docente_Estudiantes_${filtrosReporte.fechaInicio}_${filtrosReporte.fechaFin}.xlsx`
      );
    } catch (e) {
      setError(
        e.message || 'No se pudo exportar a Excel.'
      );
    } finally {
      setExportando(false);
    }
  }

  function exportarPDF() {
    if (!reporte || !filtrosReporte || exportando) {
      return;
    }

    setError('');

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      pdf.setFillColor(85, 28, 157);
      pdf.rect(0, 0, 297, 25, 'F');

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);

      pdf.text(
        'SAGE - Reporte de asistencia estudiantil',
        14,
        16
      );

      pdf.setTextColor(40, 40, 40);
      pdf.setFontSize(10);

      pdf.text(
        `Sección: ${filtrosReporte.seccion}`,
        14,
        36
      );

      pdf.text(
        `Curso: ${filtrosReporte.curso}`,
        14,
        43
      );

      pdf.text(
        `Alumno: ${filtrosReporte.alumno}`,
        14,
        50
      );

      pdf.text(
        `Periodo: ${formatearFecha(
          filtrosReporte.fechaInicio
        )} al ${formatearFecha(
          filtrosReporte.fechaFin
        )}`,
        14,
        57
      );

      autoTable(pdf, {
        startY: 64,
        head: [
          indicadores.map(([nombre]) => nombre),
        ],
        body: [
          indicadores.map(([, valor]) =>
            String(valor)
          ),
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
        },
        styles: {
          fontSize: 8,
          halign: 'center',
          cellPadding: 3,
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      const inicioDetalle =
        (pdf.lastAutoTable?.finalY ?? 85) + 10;

      if (inicioDetalle > 190) {
        pdf.addPage();
      }

      const posicionDetalle =
        inicioDetalle > 190 ? 20 : inicioDetalle;

      pdf.setTextColor(40, 40, 40);
      pdf.setFontSize(12);

      pdf.text(
        'Detalle de asistencia por fecha',
        14,
        posicionDetalle
      );

      autoTable(pdf, {
        startY: posicionDetalle + 4,
        head: [encabezadosDetalle],
        body: filasPorFecha.length
          ? filasPorFecha
          : [
              [
                'Sin registros',
                '',
                '',
                '',
                '',
                '',
              ],
            ],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      const inicioResumen =
        (pdf.lastAutoTable?.finalY ?? 90) + 12;

      if (inicioResumen > 190) {
        pdf.addPage();
      }

      const posicionResumen =
        inicioResumen > 190 ? 20 : inicioResumen;

      pdf.setFontSize(12);
      pdf.setTextColor(40, 40, 40);

      pdf.text(
        'Resumen por estudiante',
        14,
        posicionResumen
      );

      autoTable(pdf, {
        startY: posicionResumen + 4,
        head: [encabezadosResumen],
        body: filasPorAlumno.length
          ? filasPorAlumno
          : [
              [
                'Sin registros',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
              ],
            ],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      pdf.save(
        `Reporte_Docente_Estudiantes_${filtrosReporte.fechaInicio}_${filtrosReporte.fechaFin}.pdf`
      );
    } catch (e) {
      setError(
        e.message || 'No se pudo exportar a PDF.'
      );
    }
  }

  return (
    <AppLayout
      section="Reporte de asistencia estudiantil"
      step="Consultar reporte"
    >
      <section style={estilos.tarjeta}>
        <h2>Reporte de asistencia estudiantil</h2>

        <p className="muted">
          Consulta las asistencias de tus cursos y
          secciones asignados.
        </p>

        {cargandoDatos ? (
          <Loading>
            Cargando sesiones...
          </Loading>
        ) : !sesiones.length ? (
          <Feedback
            intent="info"
            title="Sin sesiones"
          >
            No tienes sesiones disponibles para consultar
            reportes.
          </Feedback>
        ) : (
          <form onSubmit={consultar}>
            <div style={estilos.filtros}>
              <label style={estilos.campo}>
                Sección

                <select
                  required
                  value={seccionId}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setSeccionId(e.target.value);
                    setCursoId('');
                    setAlumnoId('');
                    setAlumnos([]);
                    limpiarReporte();
                  }}
                >
                  <option value="">
                    Seleccionar sección...
                  </option>

                  {secciones.map((seccion) => (
                    <option
                      key={seccion.id}
                      value={seccion.id}
                    >
                      {seccion.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={estilos.campo}>
                Curso

                <select
                  value={cursoId}
                  disabled={!seccionId}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setCursoId(e.target.value);
                    limpiarReporte();
                  }}
                >
                  <option value="">
                    Todos mis cursos
                  </option>

                  {cursos.map((curso) => (
                    <option
                      key={curso.id}
                      value={curso.id}
                    >
                      {curso.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={estilos.campo}>
                Alumno

                <select
                  value={alumnoId}
                  disabled={
                    !seccionId || cargandoAlumnos
                  }
                  style={estilos.entrada}
                  onChange={(e) => {
                    setAlumnoId(e.target.value);
                    limpiarReporte();
                  }}
                >
                  <option value="">
                    {cargandoAlumnos
                      ? 'Cargando alumnos...'
                      : 'Todos los alumnos'}
                  </option>

                  {alumnos.map((alumno) => (
                    <option
                      key={alumno.alumnoId}
                      value={alumno.alumnoId}
                    >
                      {alumno.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={estilos.campo}>
                Fecha inicial

                <input
                  type="date"
                  required
                  value={fechaInicio}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setFechaInicio(e.target.value);
                    limpiarReporte();
                  }}
                />
              </label>

              <label style={estilos.campo}>
                Fecha final

                <input
                  type="date"
                  required
                  min={fechaInicio || undefined}
                  value={fechaFin}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setFechaFin(e.target.value);
                    limpiarReporte();
                  }}
                />
              </label>
            </div>

            <div style={estilos.acciones}>
              <button
                type="submit"
                disabled={consultando}
                style={estilos.boton}
              >
                {consultando
                  ? 'Consultando...'
                  : 'Generar reporte'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <Feedback
            title="No se pudo completar la operación"
          >
            {error}
          </Feedback>
        )}
      </section>

      {reporte && (
        <section style={estilos.tarjeta}>
          <h2>Resultados del reporte</h2>

          <div style={estilos.acciones}>
            <button
              type="button"
              disabled={exportando}
              onClick={exportarExcel}
              style={{
                ...estilos.boton,
                background: '#167347',
              }}
            >
              {exportando
                ? 'Exportando...'
                : 'Exportar Excel'}
            </button>

            <button
              type="button"
              disabled={exportando}
              onClick={exportarPDF}
              style={{
                ...estilos.boton,
                background: '#c0392b',
              }}
            >
              Exportar PDF
            </button>
          </div>

          <h3>Resumen general</h3>

          <div style={estilos.resumen}>
            {indicadores.map(
              ([nombre, valor, color]) => (
                <div
                  key={nombre}
                  style={estilos.indicador}
                >
                  <p className="muted">
                    {nombre}
                  </p>

                  <strong
                    style={{
                      fontSize: '25px',
                      color,
                    }}
                  >
                    {valor}
                  </strong>
                </div>
              )
            )}
          </div>

          <h3>
            Detalle de asistencia por fecha
          </h3>

          {!detalle.length ? (
            <p className="muted">
              No se encontraron asistencias en el
              periodo seleccionado.
            </p>
          ) : (
            <div
              style={{
                overflowX: 'auto',
                marginBottom: '24px',
              }}
            >
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    {encabezadosDetalle.map(
                      (titulo) => (
                        <th
                          key={titulo}
                          style={{
                            ...estilos.celda,
                            background: '#f3f4f6',
                          }}
                        >
                          {titulo}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {detalle.map(
                    (registro, indice) => (
                      <tr
                        key={
                          registro.id ??
                          `${registro.sesionId}-${registro.alumnoId}-${indice}`
                        }
                      >
                        <td style={estilos.celda}>
                          {formatearFecha(
                            registro.fecha
                          )}
                        </td>

                        <td style={estilos.celda}>
                          {registro.estudiante}
                        </td>

                        <td style={estilos.celda}>
                          {registro.codigo}
                        </td>

                        <td style={estilos.celda}>
                          {registro.curso}
                        </td>

                        <td style={estilos.celda}>
                          <span
                            style={{
                              ...estadoColor(
                                registro.estado
                              ),
                              borderRadius: '999px',
                              padding: '5px 10px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {nombreEstado(
                              registro.estado
                            )}
                          </span>
                        </td>

                        <td style={estilos.celda}>
                          {registro.observacion ||
                            '—'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          <h3>
            Resumen por estudiante
          </h3>

          {!filasPorAlumno.length ? (
            <Feedback
              intent="info"
              title="Sin registros"
            >
              No se encontraron asistencias para
              los filtros seleccionados.
            </Feedback>
          ) : (
            <div
              style={{
                overflowX: 'auto',
              }}
            >
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    {encabezadosResumen.map(
                      (columna) => (
                        <th
                          key={columna}
                          style={{
                            ...estilos.celda,
                            background: '#f3f4f6',
                          }}
                        >
                          {columna}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filasPorAlumno.map(
                    (fila, indice) => (
                      <tr
                        key={
                          reporte.alumnos[indice]
                            .alumnoId
                        }
                      >
                        {fila.map(
                          (valor, columna) => (
                            <td
                              key={columna}
                              style={estilos.celda}
                            >
                              {valor}
                            </td>
                          )
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </AppLayout>
  );
}
