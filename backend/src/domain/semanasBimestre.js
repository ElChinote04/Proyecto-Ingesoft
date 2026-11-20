// Semanas de un bimestre. La semana 1 empieza el día de inicio y cada una dura 7 días; la
// última se recorta en la fecha de fin. Las fechas son DATE de PostgreSQL (medianoche UTC).
const DIA = 24 * 60 * 60 * 1000;

const comoFecha = (valor) => (valor instanceof Date ? valor : new Date(`${valor}T00:00:00.000Z`));
export const aTexto = (fecha) => comoFecha(fecha).toISOString().slice(0, 10);

/** Hoy en Lima como YYYY-MM-DD: el colegio vive en esa zona, el servidor quizá no. */
export const hoyEnLima = (ahora = new Date()) =>
  ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export const tieneFechas = (bimestre) => Boolean(bimestre.fechaInicio && bimestre.fechaFin);

export function totalSemanas(bimestre) {
  if (!tieneFechas(bimestre)) return null;
  const dias = (comoFecha(bimestre.fechaFin) - comoFecha(bimestre.fechaInicio)) / DIA + 1;
  return Math.ceil(dias / 7);
}

export function rangoSemana(bimestre, numero) {
  const desde = new Date(comoFecha(bimestre.fechaInicio).getTime() + 7 * (numero - 1) * DIA);
  const hasta = new Date(
    Math.min(desde.getTime() + 6 * DIA, comoFecha(bimestre.fechaFin).getTime()),
  );
  return { desde: aTexto(desde), hasta: aTexto(hasta) };
}

export function listarSemanas(bimestre) {
  const total = totalSemanas(bimestre) ?? 0;
  return Array.from({ length: total }, (_, indice) => ({
    numero: indice + 1,
    ...rangoSemana(bimestre, indice + 1),
  }));
}

/** Un bimestre está cerrado cuando hoy (Lima) ya pasó su fecha de fin. */
export const estaCerrado = (bimestre, hoy = hoyEnLima()) =>
  tieneFechas(bimestre) && hoy > aTexto(bimestre.fechaFin);
