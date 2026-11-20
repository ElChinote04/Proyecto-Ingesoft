import * as repository from '../repositories/logros.repository.js';
import { calcularLogro } from '../domain/notaVigesimal.js';

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

const presentar = (logro) =>
  logro?.activo ? { promedio: numero(logro.promedio), nivelLogro: logro.nivelLogro } : null;

/**
 * Recalcula y guarda la letra de un alumno en una competencia y bimestre. Va dentro de la
 * transacción que cambió algo de lo que depende, con la escala ya tomada (escalaParaCalcular).
 * @returns {{ anterior: object | null, nuevo: object | null }} promedio y letra antes y después.
 */
export async function recalcularLogro(clase, escala, actor, db) {
  const { matriculaId, bimestreId, cursoId, competenciaId, asignacionId } = clase;
  const existente = await repository.findCalificacionDelCurso(
    { matriculaId, bimestreId, cursoId },
    db,
  );
  // Sin letra previa ni resultados no hay nada que guardar: no se crea una calificación vacía.
  // Si otra transacción registra un resultado a la vez, ella misma recalcula al guardar.
  if (!existente && !(await repository.listResultadosDeLogro(clase, db)).length)
    return { anterior: null, nuevo: null };
  const calificacionId = await repository.bloquearCalificacion(
    {
      matriculaId,
      bimestreId,
      asignacionId: existente?.asignacionId ?? asignacionId,
      actorId: actor.id,
    },
    db,
  );
  // Se leen después del bloqueo: así incluyen lo que guardó otra transacción que esperábamos.
  const resultados = await repository.listResultadosDeLogro(clase, db);
  const { promedio, nivelLogro } = calcularLogro(
    resultados.map(({ condicion, nota, evaluacion }) => ({
      condicion,
      nota,
      peso: evaluacion.peso,
    })),
    escala,
  );
  const anterior = await repository.findLogro({ calificacionId, competenciaId }, db);
  const datos = {
    nivelLogro,
    promedio: promedio === null ? null : promedio.toFixed(2),
    activo: true,
    modificadoPorId: actor.id,
  };
  if (anterior) await repository.updateLogro(anterior.id, datos, db);
  else if (nivelLogro)
    await repository.createLogro(
      { ...datos, calificacionId, competenciaId, creadoPorId: actor.id },
      db,
    );
  return {
    anterior: presentar(anterior),
    nuevo: anterior || nivelLogro ? { promedio, nivelLogro } : null,
  };
}

const cambio = ({ anterior, nuevo }) =>
  (anterior?.nivelLogro ?? null) !== (nuevo?.nivelLogro ?? null) ||
  (anterior?.promedio ?? null) !== (nuevo?.promedio ?? null);

/**
 * Recalcula la competencia para todos los alumnos activos de la sección, en orden de matrícula
 * para que dos recálculos simultáneos tomen las filas en el mismo orden. Devuelve cuántas
 * letras o promedios cambiaron.
 */
export async function recalcularCompetencia(clase, matriculaIds, escala, actor, db) {
  let cambiadas = 0;
  for (const matriculaId of [...matriculaIds].sort((a, b) => a - b)) {
    if (cambio(await recalcularLogro({ ...clase, matriculaId }, escala, actor, db))) cambiadas += 1;
  }
  return cambiadas;
}
