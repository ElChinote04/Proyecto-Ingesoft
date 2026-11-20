
import { useState } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../api/client';
import { useAdminData } from '../hooks/useAdminData';
import {
  Feedback,
  Loading,
  ResourceError,
} from '../components/Feedback';

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
    gridTemplateColumns:
      'repeat(auto-fit, minmax(210px, 1fr))',
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
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginTop: '20px',
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
  botonExcel: {
    background: '#167347',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 18px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  botonPDF: {
    background: '#c0392b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 18px',
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
    gridTemplateColumns:
      'repeat(auto-fit, minmax(160px, 1fr))',
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
    verticalAlign: 'top',
  },
  alumnoNombre: {
    display: 'block',
    fontWeight: 600,
    color: '#111827',
  },
  alumnoCodigo: {
    display: 'block',
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
};

function porcentaje(valor, total) {
  if (!total) return 0;

  return Math.round((valor / total) * 10000) / 100;
}

function resumenAlumno(alumno) {
  const presentes = alumno.resumen?.PRESENTE ?? 0;
  const tardanzas = alumno.resumen?.TARDANZA ?? 0;
  const ausencias = alumno.resumen?.AUSENTE ?? 0;

  const total = presentes + tardanzas + ausencias;

  return {
    presentes,
    tardanzas,
    ausencias,
    total,
    asistencia: porcentaje(
      presentes + tardanzas,
      total
    ),
    porcentajeTardanzas: porcentaje(
      tardanzas,
      total
    ),
    porcentajeAusencias: porcentaje(
      ausencias,
      total
    ),
  };
}

function resumenGeneral(reporte) {
  const total = reporte.total ?? 0;
  const presentes = reporte.resumen?.PRESENTE ?? 0;
  const tardanzas = reporte.resumen?.TARDANZA ?? 0;
  const ausencias = reporte.resumen?.AUSENTE ?? 0;

  return {
    total,
    presentes,
    tardanzas,
    ausencias,
    asistencia: porcentaje(
      presentes + tardanzas,
      total
    ),
    porcentajeTardanzas: porcentaje(
      tardanzas,
      total
    ),
    porcentajeAusencias: porcentaje(
      ausencias,
      total
    ),
  };
}

function formatearFecha(fecha) {
  if (!fecha || typeof fecha !== 'string') {
    return '';
  }

  const partes = fecha.slice(0, 10).split('-');

  if (partes.length !== 3) {
    return fecha;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
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

function descargarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');

  enlace.href = url;
  enlace.download = nombre;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nombreArchivo(reporte, extension) {
  return (
    `Reporte_Asistencia_Estudiantil_` +
    `${reporte.fechaInicio}_` +
    `${reporte.fechaFin}.${extension}`
  );
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
  '% Inasistencias',
];

function filasDetalle(reporte) {
  return (reporte?.detalle ?? []).map(
    (registro) => [
      formatearFecha(registro.fecha),
      registro.estudiante,
      registro.codigo ?? '',
      registro.curso ?? '',
      nombreEstado(registro.estado),
      registro.observacion ?? '',
    ]
  );
}

function filasResumen(reporte) {
  return (reporte?.alumnos ?? []).map(
    (alumno) => {
      const resumen = resumenAlumno(alumno);

      return [
        alumno.nombre,
        alumno.codigo ?? '',
        resumen.presentes,
        resumen.tardanzas,
        resumen.ausencias,
        `${resumen.asistencia.toFixed(2)}%`,
        `${resumen.porcentajeTardanzas.toFixed(2)}%`,
        `${resumen.porcentajeAusencias.toFixed(2)}%`,
      ];
    }
  );
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
      horizontal: 'center',
      wrapText: true,
    };
  });

  fila.height = 30;
}

export default function StudentAttendanceReport() {
  const { data, error, retry } = useAdminData(
    'catalogos,estudiantes'
  );

  const [gradoId, setGradoId] = useState('');
  const [seccionId, setSeccionId] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [reporte, setReporte] = useState(null);
  const [filtrosReporte, setFiltrosReporte] =
    useState(null);

  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState('');
  const [errorConsulta, setErrorConsulta] =
    useState('');

  const catalogos = data?.[0] ?? {};
  const estudiantes = data?.[1] ?? [];

  const grados = catalogos.grados ?? [];
  const secciones = catalogos.secciones ?? [];
  const cursos = catalogos.cursos ?? [];

  const seccionesFiltradas = secciones.filter(
    (seccion) =>
      String(seccion.gradoId) === gradoId
  );

  const alumnosFiltrados = estudiantes.filter(
    (alumno) =>
      (alumno.matriculas ?? []).some(
        (matricula) =>
          String(matricula.seccionId) === seccionId &&
          matricula.activo !== false
      )
  );

  function limpiarResultado() {
    setReporte(null);
    setFiltrosReporte(null);
    setErrorConsulta('');
  }

  async function consultar(e) {
    e.preventDefault();

    if (
      !gradoId ||
      !seccionId ||
      !fechaInicio ||
      !fechaFin
    ) {
      limpiarResultado();

      setErrorConsulta(
        'Completa los campos obligatorios.'
      );

      return;
    }

    if (fechaInicio > fechaFin) {
      limpiarResultado();

      setErrorConsulta(
        'La fecha inicial no puede ser posterior a la final.'
      );

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

      if (alumnoId) {
        params.set('alumnoId', alumnoId);
      }

      if (cursoId) {
        params.set('cursoId', cursoId);
      }

      const resultado = await api(
        `/reportes/asistencia/estudiantes?${params.toString()}`
      );

      const grado = grados.find(
        (x) => String(x.id) === gradoId
      );

      const seccion = secciones.find(
        (x) => String(x.id) === seccionId
      );

      const alumno = estudiantes.find(
        (x) => String(x.id) === alumnoId
      );

      const curso = cursos.find(
        (x) => String(x.id) === cursoId
      );

      setFiltrosReporte({
        grado: grado?.nombre ?? '',
        seccion: seccion?.nombre ?? '',
        alumno: alumno
          ? `${alumno.nombres} ${alumno.apellidos}`
          : 'Todos los alumnos',
        curso: curso?.nombre ?? 'Todos los cursos',
        fechaInicio,
        fechaFin,
      });

      setReporte(resultado);
    } catch (e) {
      setErrorConsulta(
        e.message || 'No se pudo generar el reporte.'
      );
    } finally {
      setCargando(false);
    }
  }

  const general = reporte
    ? resumenGeneral(reporte)
    : null;

  const indicadores = general
    ? [
        {
          titulo: 'Total de registros',
          valor: general.total,
          color: '#111827',
        },
        {
          titulo: 'Presentes',
          valor: general.presentes,
          color: '#166534',
        },
        {
          titulo: 'Tardanzas',
          valor: general.tardanzas,
          color: '#92400e',
        },
        {
          titulo: 'Ausencias',
          valor: general.ausencias,
          color: '#991b1b',
        },
        {
          titulo: '% Asistencia',
          valor:
            `${general.asistencia.toFixed(2)}%`,
          color: '#2563eb',
        },
        {
          titulo: '% Tardanzas',
          valor:
            `${general.porcentajeTardanzas.toFixed(2)}%`,
          color: '#b45309',
        },
        {
          titulo: '% Inasistencias',
          valor:
            `${general.porcentajeAusencias.toFixed(2)}%`,
          color: '#dc2626',
        },
      ]
    : [];

  const detalle = reporte?.detalle ?? [];
  const filasPorFecha = filasDetalle(reporte);
  const filasPorAlumno = filasResumen(reporte);

  async function exportarExcel() {
    if (!reporte || !filtrosReporte || exportando) {
      return;
    }

    setExportando('excel');
    setErrorConsulta('');

    try {
      const workbook = new ExcelJS.Workbook();

      workbook.creator = 'SAGE';
      workbook.subject =
        'Reporte de asistencia estudiantil';

      const hoja = workbook.addWorksheet('Resumen');

      hoja.columns = [
        { width: 34 },
        { width: 20 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 19 },
        { width: 19 },
        { width: 21 },
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
        ['Grado', filtrosReporte.grado],
        ['Sección', filtrosReporte.seccion],
        ['Alumno', filtrosReporte.alumno],
        ['Curso', filtrosReporte.curso],
        [
          'Fecha inicial',
          formatearFecha(
            filtrosReporte.fechaInicio
          ),
        ],
        [
          'Fecha final',
          formatearFecha(
            filtrosReporte.fechaFin
          ),
        ],
      ];

      hoja.addRow([]);

      filtros.forEach(([nombre, valor]) => {
        const fila = hoja.addRow([
          nombre,
          valor,
        ]);

        fila.getCell(1).font = {
          bold: true,
        };
      });

      hoja.addRow([]);

      const tituloGeneral = hoja.addRow([
        'RESUMEN GENERAL',
      ]);

      tituloGeneral.getCell(1).font = {
        bold: true,
        color: { argb: 'FF551C9D' },
      };

      indicadores.forEach((indicador) => {
        hoja.addRow([
          indicador.titulo,
          indicador.valor,
        ]);
      });

      hoja.addRow([]);

      const tituloEstudiantes = hoja.addRow([
        'RESUMEN POR ESTUDIANTE',
      ]);

      tituloEstudiantes.getCell(1).font = {
        bold: true,
        color: { argb: 'FF551C9D' },
      };

      const encabezado = hoja.addRow(
        encabezadosResumen
      );

      aplicarEncabezadoExcel(encabezado);

      filasPorAlumno.forEach((fila) => {
        hoja.addRow(fila);
      });

      if (!filasPorAlumno.length) {
        hoja.addRow(['Sin registros']);
      }

      hoja.pageSetup.orientation = 'landscape';
      hoja.pageSetup.fitToPage = true;
      hoja.pageSetup.fitToWidth = 1;

      const hojaDetalle = workbook.addWorksheet(
        'Detalle por fecha'
      );

      hojaDetalle.columns = [
        {
          header: 'Fecha',
          key: 'fecha',
          width: 18,
        },
        {
          header: 'Estudiante',
          key: 'estudiante',
          width: 33,
        },
        {
          header: 'Código',
          key: 'codigo',
          width: 22,
        },
        {
          header: 'Curso',
          key: 'curso',
          width: 37,
        },
        {
          header: 'Estado',
          key: 'estado',
          width: 17,
        },
        {
          header: 'Observación',
          key: 'observacion',
          width: 45,
        },
      ];

      aplicarEncabezadoExcel(
        hojaDetalle.getRow(1)
      );

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
        to:
          `F${Math.max(
            2,
            filasPorFecha.length + 1
          )}`,
      };

      hojaDetalle.pageSetup.orientation =
        'landscape';

      hojaDetalle.pageSetup.fitToPage = true;
      hojaDetalle.pageSetup.fitToWidth = 1;

      const buffer =
        await workbook.xlsx.writeBuffer();

      descargarArchivo(
        new Blob([buffer], {
          type:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        nombreArchivo(reporte, 'xlsx')
      );
    } catch (e) {
      setErrorConsulta(
        e.message ||
          'No se pudo exportar el archivo Excel.'
      );
    } finally {
      setExportando('');
    }
  }

  function exportarPDF() {
    if (!reporte || !filtrosReporte || exportando) {
      return;
    }

    setExportando('pdf');
    setErrorConsulta('');

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      doc.setFillColor(85, 28, 157);
      doc.rect(0, 0, 297, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.setTextColor(255, 255, 255);

      doc.text(
        'SAGE - Reporte de asistencia estudiantil',
        14,
        18
      );

      doc.setTextColor(55, 65, 81);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      doc.text(
        `Grado: ${filtrosReporte.grado} | Sección: ${filtrosReporte.seccion}`,
        14,
        38
      );

      doc.text(
        `Alumno: ${filtrosReporte.alumno}`,
        14,
        45
      );

      doc.text(
        `Curso: ${filtrosReporte.curso}`,
        14,
        52
      );

      doc.text(
        `Periodo: ${formatearFecha(
          filtrosReporte.fechaInicio
        )} al ${formatearFecha(
          filtrosReporte.fechaFin
        )}`,
        14,
        59
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);

      doc.text('Resumen general', 14, 70);

      autoTable(doc, {
        startY: 74,
        head: [
          indicadores.map(
            (indicador) => indicador.titulo
          ),
        ],
        body: [
          indicadores.map(
            (indicador) =>
              String(indicador.valor)
          ),
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          halign: 'center',
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      const inicioDetalle =
        (doc.lastAutoTable?.finalY ?? 95) + 12;

      if (inicioDetalle > 190) {
        doc.addPage();
      }

      const posicionDetalle =
        inicioDetalle > 190
          ? 20
          : inicioDetalle;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(55, 65, 81);

      doc.text(
        'Detalle de asistencia por fecha',
        14,
        posicionDetalle
      );

      autoTable(doc, {
        startY: posicionDetalle + 4,
        head: [encabezadosDetalle],
        body: filasPorFecha.length
          ? filasPorFecha
          : [[
              'Sin registros',
              '',
              '',
              '',
              '',
              '',
            ]],
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
        (doc.lastAutoTable?.finalY ?? 95) + 12;

      if (inicioResumen > 190) {
        doc.addPage();
      }

      const posicionResumen =
        inicioResumen > 190
          ? 20
          : inicioResumen;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(55, 65, 81);

      doc.text(
        'Resumen por estudiante',
        14,
        posicionResumen
      );

      autoTable(doc, {
        startY: posicionResumen + 4,
        head: [encabezadosResumen],
        body: filasPorAlumno.length
          ? filasPorAlumno
          : [[
              'Sin registros',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
            ]],
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

      doc.save(
        nombreArchivo(reporte, 'pdf')
      );
    } catch (e) {
      setErrorConsulta(
        e.message ||
          'No se pudo exportar el archivo PDF.'
      );
    } finally {
      setExportando('');
    }
  }

  if (error) {
    return (
      <ResourceError
        error={error}
        retry={retry}
      />
    );
  }

  if (!data) {
    return (
      <Loading>
        Cargando datos académicos...
      </Loading>
    );
  }

  return (
    <>
      <section style={estilos.contenedor}>
        <h2 style={estilos.titulo}>
          Reporte de asistencia estudiantil
        </h2>

        <p style={estilos.subtitulo}>
          Consulta las asistencias, tardanzas y
          ausencias por grado, sección, alumno,
          curso y rango de fechas.
        </p>

        <form onSubmit={consultar}>
          <div style={estilos.filtros}>
            <label style={estilos.campo}>
              <span style={estilos.etiqueta}>
                Grado
              </span>

              <select
                required
                value={gradoId}
                style={estilos.entrada}
                onChange={(e) => {
                  setGradoId(e.target.value);
                  setSeccionId('');
                  setAlumnoId('');
                  setCursoId('');
                  limpiarResultado();
                }}
              >
                <option value="">
                  Seleccionar grado...
                </option>

                {grados.map((grado) => (
                  <option
                    key={grado.id}
                    value={grado.id}
                  >
                    {grado.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label style={estilos.campo}>
              <span style={estilos.etiqueta}>
                Sección
              </span>

              <select
                required
                disabled={!gradoId}
                value={seccionId}
                style={estilos.entrada}
                onChange={(e) => {
                  setSeccionId(e.target.value);
                  setAlumnoId('');
                  setCursoId('');
                  limpiarResultado();
                }}
              >
                <option value="">
                  Seleccionar sección...
                </option>

                {seccionesFiltradas.map(
                  (seccion) => (
                    <option
                      key={seccion.id}
                      value={seccion.id}
                    >
                      {seccion.nombre}
                    </option>
                  )
                )}
              </select>
            </label>

            <label style={estilos.campo}>
              <span style={estilos.etiqueta}>
                Alumno
              </span>

              <select
                disabled={!seccionId}
                value={alumnoId}
                style={estilos.entrada}
                onChange={(e) => {
                  setAlumnoId(e.target.value);
                  limpiarResultado();
                }}
              >
                <option value="">
                  Todos los alumnos
                </option>

                {alumnosFiltrados.map(
                  (alumno) => (
                    <option
                      key={alumno.id}
                      value={alumno.id}
                    >
                      {alumno.apellidos},{' '}
                      {alumno.nombres}
                    </option>
                  )
                )}
              </select>
            </label>

            <label style={estilos.campo}>
              <span style={estilos.etiqueta}>
                Curso
              </span>

              <select
                disabled={!seccionId}
                value={cursoId}
                style={estilos.entrada}
                onChange={(e) => {
                  setCursoId(e.target.value);
                  limpiarResultado();
                }}
              >
                <option value="">
                  Todos los cursos
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
              <span style={estilos.etiqueta}>
                Fecha inicial
              </span>

              <input
                type="date"
                required
                value={fechaInicio}
                style={estilos.entrada}
                onChange={(e) => {
                  setFechaInicio(e.target.value);
                  limpiarResultado();
                }}
              />
            </label>

            <label style={estilos.campo}>
              <span style={estilos.etiqueta}>
                Fecha final
              </span>

              <input
                type="date"
                required
                min={fechaInicio || undefined}
                value={fechaFin}
                style={estilos.entrada}
                onChange={(e) => {
                  setFechaFin(e.target.value);
                  limpiarResultado();
                }}
              />
            </label>
          </div>

          <div style={estilos.acciones}>
            <button
              type="submit"
              disabled={
                cargando || Boolean(exportando)
              }
              style={{
                ...estilos.boton,
                opacity: cargando ? 0.6 : 1,
              }}
            >
              {cargando
                ? 'Consultando...'
                : 'Generar reporte'}
            </button>
          </div>
        </form>

        {errorConsulta && (
          <p
            role="alert"
            style={{
              color: '#b91c1c',
              marginTop: '16px',
            }}
          >
            {errorConsulta}
          </p>
        )}

        {cargando && (
          <Loading>
            Generando reporte...
          </Loading>
        )}
      </section>

      {reporte && general && (
        <section style={estilos.contenedor}>
          <h2 style={estilos.titulo}>
            Resultados del reporte
          </h2>

          <div style={estilos.acciones}>
            <button
              type="button"
              onClick={exportarExcel}
              disabled={
                Boolean(exportando) || cargando
              }
              style={{
                ...estilos.botonExcel,
                opacity: exportando ? 0.6 : 1,
              }}
            >
              {exportando === 'excel'
                ? 'Exportando Excel...'
                : 'Exportar Excel'}
            </button>

            <button
              type="button"
              onClick={exportarPDF}
              disabled={
                Boolean(exportando) || cargando
              }
              style={{
                ...estilos.botonPDF,
                opacity: exportando ? 0.6 : 1,
              }}
            >
              {exportando === 'pdf'
                ? 'Exportando PDF...'
                : 'Exportar PDF'}
            </button>
          </div>

          <hr style={estilos.separador} />

          <h3 style={estilos.seccion}>
            Resumen general
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

          <h3 style={estilos.seccion}>
            Detalle de asistencia por fecha
          </h3>

          {!detalle.length ? (
            <p className="muted">
              No se encontraron asistencias para
              el periodo seleccionado.
            </p>
          ) : (
            <div style={estilos.tablaContenedor}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    {encabezadosDetalle.map(
                      (titulo) => (
                        <th
                          key={titulo}
                          style={estilos.encabezado}
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

          <hr style={estilos.separador} />

          <h3 style={estilos.seccion}>
            Resumen por estudiante
          </h3>

          {!filasPorAlumno.length ? (
            <Feedback
              intent="info"
              title="Sin registros"
            >
              No se encontraron asistencias
              registradas para los filtros
              seleccionados.
            </Feedback>
          ) : (
            <div style={estilos.tablaContenedor}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    {encabezadosResumen.map(
                      (titulo) => (
                        <th
                          key={titulo}
                          style={estilos.encabezado}
                        >
                          {titulo}
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
    </>
  );
}
