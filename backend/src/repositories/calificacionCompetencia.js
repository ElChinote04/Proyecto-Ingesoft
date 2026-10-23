import { prisma } from '../config/database.js';

const include = {
  calificacion: true,
  competencia: true,
};

export const listCalificacionesCompetencia = (where = {}, db = prisma) =>
  db.calificacionCompetencia.findMany({ where, include, orderBy: { id: 'asc' } });

export const findCalificacionCompetencia = (id, db = prisma) =>
  db.calificacionCompetencia.findUnique({ where: { id }, include });

export const findCalificacionCompetenciaByKey = (
  { calificacionId, competenciaId },
  db = prisma,
) =>
  db.calificacionCompetencia.findUnique({
    where: { calificacionId_competenciaId: { calificacionId, competenciaId } },
    include,
  });

export const createCalificacionCompetencia = (data, db = prisma) =>
  db.calificacionCompetencia.create({ data, include });

export const updateCalificacionCompetencia = (id, data, db = prisma) =>
  db.calificacionCompetencia.update({ where: { id }, data, include });

export const deleteCalificacionCompetencia = (id, db = prisma) =>
  db.calificacionCompetencia.delete({ where: { id } });
