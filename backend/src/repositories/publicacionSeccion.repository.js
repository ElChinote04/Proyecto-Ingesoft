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

export const listNotasConEvidencias = ({ bimestreId, seccionIds }, db = prisma) =>
  db.calificacionCompetencia.findMany({
    where: {
      activo: true,
      calificacion: { activo: true, bimestreId, matricula: { seccionId: { in: seccionIds } } },
    },
    select: {
      competenciaId: true,
      calificacion: { select: { matriculaId: true } },
      _count: { select: { evidencias: { where: { activo: true } } } },
    },
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
    select: { gradoId: true, cursoId: true },
  });
}

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

// Publicar toma la fila de la sección en exclusiva y cada escritura de notas o evidencia la toma
// compartida. Así ninguna escritura entra después de publicar ni invalida la comprobación en curso.
export const bloquearSeccionExclusivo = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "Seccion" WHERE "id" = ${id} FOR UPDATE`;

export const bloquearSeccionCompartido = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "Seccion" WHERE "id" = ${id} FOR SHARE`;
