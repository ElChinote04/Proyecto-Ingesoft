// Las tres formas de registrar a un alumno en una evaluación. Sin resultado queda pendiente.
export const CONDICIONES = [
  ['CALIFICADA', 'Nota'],
  ['NO_RINDIO', 'No rindió · cuenta 0'],
  ['JUSTIFICADA', 'Justificada · no cuenta'],
];

export const formatearNota = (nota) => Number(nota).toFixed(2).replace('.', ',');

/** La nota escrita (con coma o punto) como número, o null si no es de 0 a 20 con 2 decimales. */
export function leerNota(texto) {
  const valor = String(texto).trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(valor) || Number(valor) > 20) return null;
  return Number(valor);
}
