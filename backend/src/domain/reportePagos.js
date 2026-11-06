import PDFDocument from 'pdfkit';
import writeXlsxFile from 'write-excel-file/node';

/**
 * US-012 — exportación del reporte de pagos por periodo a PDF y Excel.
 * Recibe el reporte ya calculado por domain/cobranza.js; aquí solo se da formato.
 */

const NOMBRE_SISTEMA = 'SAGE · Sistema Académico de Gestión Educativa';
const ZONA_HORARIA = 'America/Lima';
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const periodoLargo = (periodo) => {
  const [anio, mes] = periodo.split('-').map(Number);
  const nombre = MESES[mes - 1];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
};

const soles = (monto) =>
  `S/ ${Number(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaLarga = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', {
    dateStyle: 'long',
    timeZone: ZONA_HORARIA,
  });

const generadoEl = (fecha) =>
  fecha.toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: ZONA_HORARIA });

/** Texto del alcance del reporte: rango de fechas y filtros aplicados. */
export function describirAlcance(reporte) {
  const filtros = [
    reporte.filtros.anioAcademico && `Año ${reporte.filtros.anioAcademico}`,
    reporte.filtros.grado && `Grado ${reporte.filtros.grado}`,
    reporte.filtros.seccion && `Sección ${reporte.filtros.seccion}`,
  ].filter(Boolean);
  return {
    rango: `Boletas con vencimiento del ${fechaLarga(reporte.desde)} al ${fechaLarga(reporte.hasta)}`,
    filtros: filtros.length ? filtros.join(' · ') : 'Todos los grados y secciones',
  };
}

const COLUMNAS = [
  ['Periodo', 'periodo'],
  ['Boletas', 'boletas'],
  ['Emitido', 'emitido'],
  ['Recaudado', 'recaudado'],
  ['Pendiente', 'pendiente'],
  ['Moroso', 'moroso'],
  ['% cobrado', 'porcentajeCobranza'],
];

/** Genera el PDF en memoria y lo devuelve como Buffer. */
export function generarReportePdf(reporte, ahora = new Date()) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 40,
    info: { Title: 'Reporte de pagos', Author: 'SAGE' },
  });
  const partes = [];
  doc.on('data', (parte) => partes.push(parte));
  const terminado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const ancho = doc.page.width - 80;
  const morado = '#4c1d95';
  const gris = '#555555';
  const alcance = describirAlcance(reporte);

  doc.font('Helvetica-Bold').fontSize(18).fillColor(morado).text('SAGE', 40, 40);
  doc.font('Helvetica').fontSize(8).fillColor(gris).text(NOMBRE_SISTEMA);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#000000')
    .text('REPORTE DE PAGOS POR PERIODO', 40, 40, { width: ancho, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(gris)
    .text(`Generado el ${generadoEl(ahora)}`, { width: ancho, align: 'right' });

  doc.moveDown(2);
  doc.font('Helvetica').fontSize(10).fillColor('#000000').text(alcance.rango, 40);
  doc.text(alcance.filtros);
  doc.moveDown();

  // Tarjetas de totales.
  const { totales } = reporte;
  const tarjetas = [
    ['Emitido', soles(totales.emitido)],
    ['Recaudado', soles(totales.recaudado)],
    ['Pendiente', soles(totales.pendiente)],
    ['Moroso', soles(totales.moroso)],
    ['% cobrado', `${totales.porcentajeCobranza}%`],
  ];
  const anchoTarjeta = ancho / tarjetas.length;
  const yTarjetas = doc.y;
  tarjetas.forEach(([etiqueta, valor], i) => {
    const x = 40 + i * anchoTarjeta;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(gris)
      .text(etiqueta, x, yTarjetas, {
        width: anchoTarjeta - 10,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(i === 3 ? '#b91c1c' : '#000000')
      .text(valor, x, yTarjetas + 14, { width: anchoTarjeta - 10 });
  });
  doc.y = yTarjetas + 44;

  // Tabla por periodo.
  const anchoColumna = ancho / COLUMNAS.length;
  const fila = (valores, negrita = false) => {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const y = doc.y;
    valores.forEach((valor, i) => {
      doc
        .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor('#000000')
        .text(String(valor), 40 + i * anchoColumna, y, {
          width: anchoColumna - 8,
          align: i === 0 ? 'left' : 'right',
        });
    });
    doc.y = y + 16;
    doc
      .moveTo(40, doc.y - 4)
      .lineTo(40 + ancho, doc.y - 4)
      .strokeColor('#dddddd')
      .stroke();
  };
  const formatear = (registro, clave) =>
    clave === 'periodo'
      ? periodoLargo(registro.periodo)
      : clave === 'boletas'
        ? registro.boletas
        : clave === 'porcentajeCobranza'
          ? `${registro.porcentajeCobranza}%`
          : soles(registro[clave]);

  fila(
    COLUMNAS.map(([titulo]) => titulo),
    true,
  );
  if (!reporte.periodos.length) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(gris)
      .text('No hay boletas que venzan en el rango y filtros consultados.', 40);
  }
  for (const registro of reporte.periodos)
    fila(COLUMNAS.map(([, clave]) => formatear(registro, clave)));
  if (reporte.periodos.length)
    fila(
      COLUMNAS.map(([, clave]) =>
        clave === 'periodo' ? 'Total' : formatear({ ...totales, periodo: '' }, clave),
      ),
      true,
    );

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(gris)
    .text(
      'Pendiente: boletas que aún no vencen. Moroso: boletas vencidas sin pago. ' +
        'Las boletas anuladas no se incluyen.',
      40,
      doc.page.height - 60,
      { width: ancho, align: 'center' },
    );

  doc.end();
  return terminado;
}

/** Genera el Excel (.xlsx) en memoria y lo devuelve como Buffer. */
export function generarReporteXlsx(reporte, ahora = new Date()) {
  const alcance = describirAlcance(reporte);
  const negrita = (value) => ({ value, fontWeight: 'bold' });
  const dinero = (valor) => ({ value: Number(valor), type: Number, format: '#,##0.00' });
  const filaDe = (registro, etiqueta) => [
    etiqueta ?? { value: periodoLargo(registro.periodo) },
    { value: registro.boletas, type: Number },
    dinero(registro.emitido),
    dinero(registro.recaudado),
    dinero(registro.pendiente),
    dinero(registro.moroso),
    { value: registro.porcentajeCobranza / 100, type: Number, format: '0.00%' },
  ];
  const datos = [
    [negrita('Reporte de pagos por periodo — SAGE')],
    [{ value: alcance.rango }],
    [{ value: alcance.filtros }],
    [{ value: `Generado el ${generadoEl(ahora)} · montos en soles (S/)` }],
    [],
    COLUMNAS.map(([titulo]) => negrita(titulo)),
    ...reporte.periodos.map((registro) => filaDe(registro)),
    filaDe(reporte.totales, negrita('Total')),
  ];
  return writeXlsxFile(datos, {
    sheet: 'Reporte de pagos',
    columns: [{ width: 18 }, { width: 10 }, ...Array(4).fill({ width: 14 }), { width: 11 }],
  }).toBuffer();
}
