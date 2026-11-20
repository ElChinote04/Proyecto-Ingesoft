import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

export const findBimestre = (id, db = prisma) =>
  db.bimestreAcademico.findUnique({
    where: { id },
    select: { id: true, nombre: true, activo: true, anioAcademicoId: true },
  });

const seccion = {
  id: true,
  nombre: true,
  gradoId: true,
  anioAcademicoId: true,
  grado: { select: { nombre: true } },
  matriculas: { where: { activo: true }, select: { id: true } },
  asignaciones: {
    where: { activo: true, curso: { activo: true } },
    select: {
      curso: {
        select: {
          id: true,
          nombre: true,
          competencias: { where: { activo: true }, select: { id: true } },
        },
      },
      docente: { select: { persona: { select: { nombres: true, apellidos: true } } } },
    },
    orderBy: { id: 'asc' },
  },
};

export const listSecciones = (anioAcademicoId, db = prisma) =>
  db.seccion.findMany({
    where: { anioAcademicoId },
    select: seccion,
    orderBy: [{ grado: { nombre: 'asc' } }, { nombre: 'asc' }],
  });

export const findSeccion = (id, db = prisma) =>
  db.seccion.findUnique({ where: { id }, select: seccion });

export const listNombresSecciones = (ids, db = prisma) =>
  db.seccion.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true, grado: { select: { nombre: true } } },
  });

// Evaluaciones activas de las secciones en el bimestre, con la condición de cada alumno.
export const listEvaluacionesConResultados = ({ bimestreId, seccionIds }, db = prisma) =>
  db.evaluacion.findMany({
    where: { activo: true, bimestreId, seccionId: { in: seccionIds } },
    select: {
      id: true,
      seccionId: true,
      competenciaId: true,
      resultados: { where: { activo: true }, select: { matriculaId: true, condicion: true } },
    },
  });

export const listLetras = ({ bimestreId, seccionIds }, db = prisma) =>
  db.calificacionCompetencia.findMany({
    where: {
      activo: true,
      nivelLogro: { not: null },
      calificacion: { activo: true, bimestreId, matricula: { seccionId: { in: seccionIds } } },
    },
    select: { competenciaId: true, calificacion: { select: { matriculaId: true } } },
  });

export function listReglasVigentes(gradoIds, db = prisma) {
  const ahora = new Date();
  return db.reglaConsolidacion.findMany({
    where: {
      activo: true,
      gradoId: { in: gradoIds },
      vigenteDesde: { lte: ahora },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
    },
    select: { id: true, gradoId: true, cursoId: true, metodo: true },
    orderBy: { version: 'desc' },
  });
}

// La regla vigente al publicar queda fija en las notas: la libreta anual usa la del último
// bimestre aunque después cambie.
export const asignarRegla = ({ bimestreId, seccionId, cursoId, reglaId }, db) =>
  db.calificacion.updateMany({
    where: { activo: true, bimestreId, matricula: { seccionId }, asignacion: { cursoId } },
    data: { reglaId },
  });

export const listPublicaciones = (bimestreIds, db = prisma) =>
  db.publicacionSeccion.findMany({
    where: { bimestreId: { in: bimestreIds } },
    select: { bimestreId: true, seccionId: true, publicadoEn: true },
  });

export const findPublicacion = ({ bimestreId, seccionId }, db = prisma) =>
  db.publicacionSeccion.findUnique({
    where: { bimestreId_seccionId: { bimestreId, seccionId } },
    select: { id: true, publicadoEn: true },
  });

export const createPublicacion = (data, db) =>
  db.publicacionSeccion.create({ data, select: { id: true, publicadoEn: true } });

// Publicar toma la fila de la sección en exclusiva y cada escritura de notas la toma
// compartida. Así ninguna escritura entra después de publicar ni invalida la comprobación en curso.
export const bloquearSeccionExclusivo = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "Seccion" WHERE "id" = ${id} FOR UPDATE`;

export const bloquearSeccionCompartido = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "Seccion" WHERE "id" = ${id} FOR SHARE`;
