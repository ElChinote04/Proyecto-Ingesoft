// Reglas de negocio del cronograma de pensiones (US-006). Sin dependencias de
// infraestructura: se prueban de forma aislada en tests/cronograma.test.js.
import { AppError } from '../errors/AppError.js';

export const CENTIMOS_POR_SOL = 100;
const MAX_CUOTAS = 12;
const MONTO_MAXIMO = 100000;

/**
 * Convierte un monto en soles a céntimos enteros, que es la unidad que exige la
 * pasarela. Se pasa por string para no arrastrar el error de coma flotante de
 * multiplicar por 100 (0.29 * 100 da 28.999999999999996 en JavaScript).
 */
export function aCentimos(monto) {
  const texto = typeof monto === 'string' ? monto : String(monto);
  if (!/^-?\d+(\.\d+)?$/.test(texto))
    throw new AppError(500, 'MONTO_INVALIDO', 'El monto registrado no es un número válido.');
  const negativo = texto.startsWith('-');
  const [entero, decimales = ''] = texto.replace('-', '').split('.');
  const centimos =
    Number(entero) * CENTIMOS_POR_SOL +
    Number((decimales + '00').slice(0, 2)) +
    redondeo(decimales);
  return negativo ? -centimos : centimos;
}

const redondeo = (decimales) => (Number(decimales[2] ?? 0) >= 5 ? 1 : 0);

/** Devuelve el período en formato AAAA-MM a partir de un año y un mes 1..12. */
export const formatearPeriodo = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`;

/** Último día del mes indicado, para no generar un 31 de febrero. */
export const ultimoDiaDelMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

/**
 * Construye el cronograma de boletas de un plan de pago.
 * Devuelve una cuota por mes a partir de mesInicio, con el día de vencimiento
 * recortado al último día del mes cuando corresponda.
 */
export function construirCronograma({
  anio,
  mesInicio,
  numeroCuotas,
  diaVencimiento,
  montoPension,
  concepto = 'Pensión',
}) {
  if (!Number.isInteger(numeroCuotas) || numeroCuotas < 1 || numeroCuotas > MAX_CUOTAS)
    throw new AppError(
      400,
      'CUOTAS_INVALIDAS',
      `El número de cuotas debe estar entre 1 y ${MAX_CUOTAS}.`,
    );
  if (!Number.isInteger(mesInicio) || mesInicio < 1 || mesInicio > 12)
    throw new AppError(400, 'MES_INVALIDO', 'El mes de inicio debe estar entre 1 y 12.');
  if (!Number.isInteger(diaVencimiento) || diaVencimiento < 1 || diaVencimiento > 28)
    throw new AppError(
      400,
      'DIA_INVALIDO',
      'El día de vencimiento debe estar entre 1 y 28 para que exista en todos los meses.',
    );
  const centimos = aCentimos(montoPension);
  if (centimos <= 0 || centimos > MONTO_MAXIMO * CENTIMOS_POR_SOL)
    throw new AppError(400, 'MONTO_FUERA_DE_RANGO', 'El monto de la pensión está fuera de rango.');

  const cuotas = [];
  for (let i = 0; i < numeroCuotas; i += 1) {
    const mesAbsoluto = mesInicio - 1 + i;
    const anioCuota = anio + Math.floor(mesAbsoluto / 12);
    const mes = (mesAbsoluto % 12) + 1;
    const dia = Math.min(diaVencimiento, ultimoDiaDelMes(anioCuota, mes));
    cuotas.push({
      numeroCuota: i + 1,
      concepto: `${concepto} ${formatearPeriodo(anioCuota, mes)}`,
      periodo: formatearPeriodo(anioCuota, mes),
      monto: montoPension,
      fechaVencimiento: new Date(Date.UTC(anioCuota, mes - 1, dia)),
    });
  }
  return cuotas;
}

/**
 * Estado que debe mostrarse al apoderado (US-007A). La morosidad no se guarda:
 * se deriva de la fecha de vencimiento, de modo que una boleta vencida aparece
 * como morosa sin depender de que un proceso programado la haya marcado.
 */
export function estadoVisible(boleta, ahora = new Date()) {
  if (boleta.estado !== 'PENDIENTE') return boleta.estado;
  const vence = new Date(boleta.fechaVencimiento);
  return vence.getTime() < new Date(ahora).setUTCHours(0, 0, 0, 0) ? 'MOROSA' : 'PENDIENTE';
}

/**
 * Decide qué hacer ante la notificación de la pasarela (QAS008). Se mantiene
 * como función pura para poder probar la idempotencia sin base de datos.
 */
export function resolverConfirmacion(pagoActual, resultadoProveedor) {
  if (!pagoActual) return { accion: 'IGNORAR', motivo: 'REFERENCIA_DESCONOCIDA' };
  if (pagoActual.estado === 'CONFIRMADO') return { accion: 'IGNORAR', motivo: 'YA_CONFIRMADO' };
  if (['RECHAZADO', 'CANCELADO'].includes(pagoActual.estado) && resultadoProveedor !== 'PAGADO')
    return { accion: 'IGNORAR', motivo: 'YA_CERRADO' };
  if (resultadoProveedor === 'PAGADO') return { accion: 'CONFIRMAR' };
  if (resultadoProveedor === 'EXPIRADO') return { accion: 'CANCELAR' };
  if (resultadoProveedor === 'RECHAZADO') return { accion: 'RECHAZAR' };
  return { accion: 'IGNORAR', motivo: 'PENDIENTE_EN_PROVEEDOR' };
}
