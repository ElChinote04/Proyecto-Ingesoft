// Reglas del pago fraccionado de una boleta (US-010, RF138–RF140). Sin
// dependencias de infraestructura: se prueban de forma aislada.
import { AppError } from '../errors/AppError.js';
import { aCentimos, CENTIMOS_POR_SOL, ultimoDiaDelMes } from './cronograma.js';

export const MIN_FRACCIONES = 2;
export const MAX_FRACCIONES = 6;

const fail = (code, message) => {
  throw new AppError(400, code, message);
};

const aSoles = (centimos) => (centimos / CENTIMOS_POR_SOL).toFixed(2);

/** Suma meses a una fecha UTC conservando el día, recortado al fin de mes. */
function sumarMeses(fecha, meses) {
  const total = fecha.getUTCMonth() + meses;
  const anio = fecha.getUTCFullYear() + Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(fecha.getUTCDate(), ultimoDiaDelMes(anio, mes));
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/**
 * Construye las fracciones de una boleta. El administrador define el número de
 * cuotas y el monto de cada una (RF138); la última absorbe la diferencia para
 * que la suma sea exactamente el total pactado y nunca lo exceda (RF140).
 * Vencen una por mes desde la fecha indicada.
 */
export function construirFracciones({
  montoTotal,
  numeroCuotas,
  montoCuota,
  fechaPrimerVencimiento,
}) {
  if (
    !Number.isInteger(numeroCuotas) ||
    numeroCuotas < MIN_FRACCIONES ||
    numeroCuotas > MAX_FRACCIONES
  )
    fail(
      'CUOTAS_INVALIDAS',
      `El número de cuotas debe estar entre ${MIN_FRACCIONES} y ${MAX_FRACCIONES}.`,
    );
  const total = aCentimos(montoTotal);
  const cuota = aCentimos(montoCuota);
  if (cuota <= 0) fail('MONTO_CUOTA_INVALIDO', 'El monto por cuota debe ser mayor que cero.');
  const ultima = total - cuota * (numeroCuotas - 1);
  if (ultima <= 0)
    fail(
      'FRACCIONES_EXCEDEN_TOTAL',
      `Con ${numeroCuotas} cuotas de S/ ${aSoles(cuota)} se supera el total de la boleta (S/ ${aSoles(total)}).`,
    );
  if (ultima > cuota)
    fail(
      'FRACCIONES_NO_CUBREN_TOTAL',
      `Con ${numeroCuotas} cuotas de S/ ${aSoles(cuota)} no se completa el total de S/ ${aSoles(total)}. Aumenta el monto o el número de cuotas.`,
    );

  return Array.from({ length: numeroCuotas }, (_, i) => ({
    numeroFraccion: i + 1,
    monto: aSoles(i === numeroCuotas - 1 ? ultima : cuota),
    fechaVencimiento: sumarMeses(fechaPrimerVencimiento, i),
  }));
}
