// Formatos compartidos por las pantallas de pagos.

export const soles = (monto) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(monto));

/** Fecha sin hora (AAAA-MM-DD), como la de vencimiento de una boleta. */
export const fechaCorta = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// Un instante UTC (pagadaEn) se muestra en la hora de Lima para que un pago
// hecho de noche no aparezca con la fecha del día siguiente.
export const fechaDeInstante = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  });

export function periodoLargo(periodo) {
  const [anio, mes] = periodo.split('-');
  const nombre = new Date(Number(anio), Number(mes) - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
  });
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

export const nombreDe = (persona) => `${persona.nombres} ${persona.apellidos}`;

// El concepto guardado ya lleva el periodo («Pensión 2026-10»), que las tablas
// muestran en su propia columna.
export const conceptoDe = (boleta) =>
  `${boleta.concepto.replace(` ${boleta.periodo}`, '')} · cuota ${boleta.numeroCuota}`;

/** Convierte los filtros elegidos en parámetros de consulta, omitiendo los vacíos. */
export const consultaDeFiltros = (filtros) =>
  Object.entries(filtros)
    .filter(([, valor]) => valor)
    .map(([clave, valor]) => `${clave}=${encodeURIComponent(valor)}`)
    .join('&');
