import PDFDocument from 'pdfkit';

/**
 * US-009 — comprobante de pago de una boleta.
 *
 * Es un comprobante interno del colegio: acredita que la boleta se pagó por la
 * pasarela. No reemplaza al comprobante electrónico de SUNAT; si en el futuro
 * se integra un proveedor de facturación electrónica, este módulo es el único
 * que cambia.
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

/** B001-00000042: serie y correlativo de ocho dígitos. */
export const numeroComprobante = ({ serie, id }) => `${serie}-${String(id).padStart(8, '0')}`;

const soles = (monto) =>
  `S/ ${Number(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaHora = (fecha) =>
  fecha.toLocaleString('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: ZONA_HORARIA,
  });

const periodoLargo = (periodo) => {
  const [anio, mes] = periodo.split('-').map(Number);
  return `${MESES[mes - 1]} de ${anio}`;
};

const nombreCompleto = (persona) => `${persona.nombres} ${persona.apellidos}`;

/** Reúne los datos que se imprimen; separado del dibujo para poder probarlo. */
export function datosComprobante(comprobante) {
  const { pago, compromisoPago: boleta } = comprobante;
  const { matricula } = boleta.planPago;
  const estudiante = matricula.estudiante.persona;
  return {
    numero: numeroComprobante(comprobante),
    emitidoEn: fechaHora(comprobante.emitidoEn),
    pagador: nombreCompleto(pago.iniciadoPor.persona),
    documentoPagador: pago.iniciadoPor.persona.numeroDocumento,
    estudiante: nombreCompleto(estudiante),
    documentoEstudiante: estudiante.numeroDocumento,
    aula: `${matricula.seccion.grado.nombre} ${matricula.seccion.nombre} · año ${matricula.anioAcademico.codigo}`,
    // El concepto guardado ya lleva el periodo («Pensión 2026-04»), que va en su propia fila.
    concepto:
      `${boleta.concepto.replace(` ${boleta.periodo}`, '')} · cuota ${boleta.numeroCuota}` +
      (boleta.numeroFraccion ? ` · parte ${boleta.numeroFraccion}` : ''),
    periodo: periodoLargo(boleta.periodo),
    monto: soles(pago.monto),
    medio:
      pago.proveedor === 'stripe' ? 'Tarjeta (pasarela en línea)' : `Pasarela ${pago.proveedor}`,
    operacion: pago.referencia,
  };
}

/** Genera el PDF en memoria y lo devuelve como Buffer. */
export function generarComprobantePdf(comprobante) {
  const d = datosComprobante(comprobante);
  const doc = new PDFDocument({
    size: 'A5',
    margin: 40,
    info: { Title: `Comprobante ${d.numero}`, Author: 'SAGE', Subject: d.concepto },
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

  doc.font('Helvetica-Bold').fontSize(18).fillColor(morado).text('SAGE', 40, 40);
  doc.font('Helvetica').fontSize(8).fillColor(gris).text(NOMBRE_SISTEMA);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#000000')
    .text('COMPROBANTE DE PAGO', 40, 40, { width: ancho, align: 'right' });
  doc.font('Helvetica').fontSize(10).text(`N.° ${d.numero}`, { width: ancho, align: 'right' });
  doc.moveDown(2);

  const linea = () => {
    doc
      .moveTo(40, doc.y)
      .lineTo(40 + ancho, doc.y)
      .strokeColor('#dddddd')
      .stroke();
    doc.moveDown(0.6);
  };
  const campo = (etiqueta, valor) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(gris).text(etiqueta, 40, y, { width: 120 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000000')
      .text(valor, 160, y, { width: ancho - 120 });
    doc.moveDown(0.5);
  };

  linea();
  campo('Fecha de pago', d.emitidoEn);
  campo('Pagado por', `${d.pagador} (doc. ${d.documentoPagador})`);
  campo('Estudiante', `${d.estudiante} (doc. ${d.documentoEstudiante})`);
  campo('Grado y sección', d.aula);
  linea();
  campo('Concepto', d.concepto);
  campo('Periodo', d.periodo);
  campo('Medio de pago', d.medio);
  campo('N.° de operación', d.operacion);
  linea();

  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text('TOTAL PAGADO', 40, y);
  doc.text(d.monto, 40, y, { width: ancho, align: 'right' });
  doc.moveDown(1);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#15803d')
    .text('PAGADO', 40, doc.y, { width: ancho, align: 'right' });

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(gris)
    .text(
      'Comprobante interno emitido por SAGE al confirmarse el pago en la pasarela. ' +
        'No reemplaza al comprobante electrónico de SUNAT.',
      40,
      doc.page.height - 70,
      { width: ancho, align: 'center' },
    );

  doc.end();
  return terminado;
}
