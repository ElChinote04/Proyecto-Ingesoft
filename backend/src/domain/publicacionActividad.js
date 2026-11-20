import { aTexto, hoyEnLima } from './semanasBimestre.js';

/**
 * La visibilidad de una actividad para los alumnos se deriva de publicadaDesde al consultar,
 * como el estado MOROSA de una boleta: si fuera un estado guardado, una actividad programada
 * necesitaría un proceso que la publique, y hasta entonces el sistema mentiría.
 */
export function estadoPublicacion(publicadaDesde, hoy = hoyEnLima()) {
  if (!publicadaDesde) return 'SUBIDA';
  return aTexto(publicadaDesde) > hoy ? 'PROGRAMADA' : 'PUBLICADA';
}

export const estaPublicada = (publicadaDesde, hoy) =>
  estadoPublicacion(publicadaDesde, hoy) === 'PUBLICADA';
