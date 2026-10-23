import { prisma } from '../config/database.js';

const include = {
  calificacion: {
    include: {
      matricula: { include: { estudiante: { include: { persona: true } }, seccion: true } },
      bimestre: true,
      asignacion: { include: { curso: true, seccion: true, docente: { include: { persona: true } } } },
      regla: true,
    },
  },
  competencia: { include: { curso: true } },
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
  db.calificacionCompetencia.update({ where: { id }, data: { activo: false }, include });

export const auditCalificacionCompetencia = (db, { usuarioId, tipoEvento, detalleId, valorAnterior, valorNuevo, requestId }) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento,
      resultado: 'EXITOSO',
      tipoEntidad: 'CalificacionCompetencia',
      idEntidad: String(detalleId),
      valorAnterior: valorAnterior ? JSON.stringify(valorAnterior) : null,
      valorNuevo: valorNuevo ? JSON.stringify(valorNuevo) : null,
      observacion: requestId ? `requestId=${requestId}` : null,
    },
  });
