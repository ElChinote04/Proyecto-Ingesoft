import { prisma } from '../config/database.js';

const include = {
  matricula: { include: { estudiante: { include: { persona: true } }, seccion: true } },
  bimestre: true,
  asignacion: { include: { curso: true, seccion: true, docente: { include: { persona: true } } } },
  regla: true,
  competencias: { include: { competencia: true } },
};

export const listCalificaciones = (where = {}, db = prisma) =>
  db.calificacion.findMany({ where, include, orderBy: [{ bimestreId: 'asc' }, { id: 'asc' }] });

export const findCalificacion = (id, db = prisma) =>
  db.calificacion.findUnique({ where: { id }, include });

export const findCalificacionByKey = ({ matriculaId, bimestreId, asignacionId }, db = prisma) =>
  db.calificacion.findUnique({
    where: { matriculaId_bimestreId_asignacionId: { matriculaId, bimestreId, asignacionId } },
    include,
  });

export const createCalificacion = (data, db = prisma) =>
  db.calificacion.create({ data, include });

export const updateCalificacion = (id, data, db = prisma) =>
  db.calificacion.update({ where: { id }, data, include });

export const deleteCalificacion = (id, db = prisma) =>
  db.calificacion.update({ where: { id }, data: { activo: false }, include });
