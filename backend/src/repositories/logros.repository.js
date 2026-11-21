import { prisma } from '../config/database.js';

// Resultados que forman la letra de un alumno en una competencia y bimestre: los de las
// evaluaciones activas de su clase, con el peso de cada una.
export const listResultadosDeLogro = (
  { matriculaId, bimestreId, cursoId, seccionId, competenciaId },
  db = prisma,
) =>
  db.resultadoEvaluacion.findMany({
    where: {
      activo: true,
      matriculaId,
      evaluacion: { activo: true, bimestreId, cursoId, seccionId, competenciaId },
    },
    select: { condicion: true, nota: true, evaluacion: { select: { peso: true } } },
  });

// Tras reasignar el curso, la nota sigue en la asignación anterior: duplicarla dejaría dos
// letras del mismo curso en el bimestre.
export const findCalificacionDelCurso = ({ matriculaId, bimestreId, cursoId }, db = prisma) =>
  db.calificacion.findFirst({
    where: { matriculaId, bimestreId, activo: true, asignacion: { cursoId } },
    select: { asignacionId: true },
    orderBy: { id: 'asc' },
  });

/**
 * Crea o reactiva la calificación y deja su fila bloqueada hasta el fin de la transacción:
 * dos guardados del mismo alumno y curso se esperan, y el segundo lee los resultados del
 * primero. ON CONFLICT resuelve también la carrera de dos altas simultáneas.
 */
export async function bloquearCalificacion({ matriculaId, bimestreId, asignacionId, actorId }, db) {
  const [fila] = await db.$queryRaw`
    INSERT INTO "Calificacion"
      ("matriculaId", "bimestreId", "asignacionId", "creadoPorId", "modificadoPorId", "modificadoEn")
    VALUES (${matriculaId}, ${bimestreId}, ${asignacionId}, ${actorId}, ${actorId}, CURRENT_TIMESTAMP)
    ON CONFLICT ("matriculaId", "bimestreId", "asignacionId")
    DO UPDATE SET "activo" = true, "modificadoPorId" = EXCLUDED."modificadoPorId",
      "modificadoEn" = CURRENT_TIMESTAMP
    RETURNING "id"`;
  return fila.id;
}

const clave = (calificacionId, competenciaId) => ({
  calificacionId_competenciaId: { calificacionId, competenciaId },
});

export const findLogro = ({ calificacionId, competenciaId }, db) =>
  db.calificacionCompetencia.findUnique({
    where: clave(calificacionId, competenciaId),
    select: { id: true, activo: true, nivelLogro: true, promedio: true },
  });

export const createLogro = (data, db) =>
  db.calificacionCompetencia.create({ data, select: { id: true } });

export const updateLogro = (id, data, db) =>
  db.calificacionCompetencia.update({ where: { id }, data, select: { id: true } });

// Letra y promedio guardados de un alumno en el bimestre, por competencia.
export const listLogros = ({ matriculaId, bimestreId, cursoIds }, db = prisma) =>
  db.calificacionCompetencia.findMany({
    where: {
      activo: true,
      calificacion: {
        activo: true,
        matriculaId,
        bimestreId,
        asignacion: { cursoId: { in: cursoIds } },
      },
    },
    select: { competenciaId: true, nivelLogro: true, promedio: true },
    orderBy: { modificadoEn: 'asc' },
  });
