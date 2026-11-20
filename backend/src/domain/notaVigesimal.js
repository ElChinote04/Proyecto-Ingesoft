// Nota de 0 a 20 → letra del bimestre. Todo se calcula en centésimos enteros: las notas se
// guardan con dos decimales y la coma flotante haría que 17,495 cayera de un lado u otro.

export const NOTA_MAXIMA = 20;
export const ESCALA_POR_DEFECTO = { minimoAD: 18, minimoA: 14, minimoB: 11 };

// Cuentan en el promedio: la nota registrada, o un 0 si el alumno no rindió sin justificar.
const CONDICIONES_QUE_CUENTAN = ['CALIFICADA', 'NO_RINDIO'];

/** Convierte una nota ("15.5", 15.5 o un Decimal de Prisma) a centésimos enteros. */
export function aCentesimos(nota) {
  const [enteros, decimales = ''] = String(nota).split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0').slice(0, 2));
}

export const deCentesimos = (centesimos) => centesimos / 100;

/** Redondeo al entero, medio hacia arriba: 17,50 → 18 y 17,49 → 17. */
export const redondearNota = (centesimos) => Math.floor((centesimos + 50) / 100);

export function convertirALetra(notaEntera, { minimoAD, minimoA, minimoB }) {
  if (notaEntera >= minimoAD) return 'AD';
  if (notaEntera >= minimoA) return 'A';
  if (notaEntera >= minimoB) return 'B';
  return 'C';
}

/**
 * Promedio ponderado en centésimos, redondeado al centésimo (medio hacia arriba), o null si no
 * hay nada que promediar.
 * @param {{ condicion: string, nota?: unknown, peso: number }[]} resultados
 */
export function promedioPonderado(resultados) {
  const contados = resultados.filter(({ condicion }) =>
    CONDICIONES_QUE_CUENTAN.includes(condicion),
  );
  const pesos = contados.reduce((total, { peso }) => total + peso, 0);
  if (!pesos) return null;
  const suma = contados.reduce(
    (total, { condicion, nota, peso }) =>
      total + (condicion === 'CALIFICADA' ? aCentesimos(nota) : 0) * peso,
    0,
  );
  return Math.floor((2 * suma + pesos) / (2 * pesos));
}

/**
 * Logro de un alumno en una competencia y bimestre. La letra sale del promedio ya fijado a dos
 * decimales, para que el promedio que ve el docente y la letra nunca se contradigan.
 */
export function calcularLogro(resultados, escala) {
  const promedio = promedioPonderado(resultados);
  return {
    promedio: promedio === null ? null : deCentesimos(promedio),
    nivelLogro: promedio === null ? null : convertirALetra(redondearNota(promedio), escala),
    contados: resultados.filter(({ condicion }) => CONDICIONES_QUE_CUENTAN.includes(condicion))
      .length,
  };
}

/** La letra de un promedio ya guardado, para recalcular cuando cambia la escala. */
export const letraDePromedio = (promedio, escala) =>
  convertirALetra(redondearNota(aCentesimos(promedio)), escala);

/** Devuelve los errores por campo de una escala, o una lista vacía si es válida. */
export function validarEscala({ minimoAD, minimoA, minimoB }) {
  const errores = [];
  if (minimoAD > NOTA_MAXIMA)
    errores.push({ campo: 'minimoAD', mensaje: `AD no puede empezar después de ${NOTA_MAXIMA}.` });
  if (minimoA >= minimoAD)
    errores.push({ campo: 'minimoA', mensaje: 'A debe empezar por debajo de AD.' });
  if (minimoB >= minimoA)
    errores.push({ campo: 'minimoB', mensaje: 'B debe empezar por debajo de A.' });
  if (minimoB <= 0) errores.push({ campo: 'minimoB', mensaje: 'B debe empezar después de 0.' });
  return errores;
}
