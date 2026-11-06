import { prisma } from '../config/database.js';

const include = {
  matricula: {
    include: {
      estudiante: { include: { persona: true } },
      seccion: { include: { grado: true, anioAcademico: true } },
    },
  },
  bimestre: true,
  asignacion: { include: { curso: true, seccion: true, docente: { include: { persona: true } } } },
  regla: true,
  competencias: { where: { activo: true }, include: { competencia: { include: { curso: true } } } },
};

export const listCalificaciones = (where = {}, db = prisma) =>
  db.calificacion.findMany({ where, include, orderBy: [{ bimestreId: 'asc' }, { id: 'asc' }] });

export const listBimestresPublicados = (bimestreIds, db = prisma) =>
  db.registroAuditoria.findMany({
    where: {
      tipoEvento: 'NOTA_PUBLICADA',
      entidad: 'BimestreAcademico',
      entidadId: { in: bimestreIds },
    },
    distinct: ['entidadId'],
    select: { entidadId: true },
  });

export const publishBimestre = (db, { usuarioId, bimestreId, requestId }) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento: 'NOTA_PUBLICADA',
      resultado: 'EXITO',
      entidad: 'BimestreAcademico',
      entidadId: bimestreId,
      requestId,
      detalle: { valorAnterior: null, valorNuevo: { bimestreId } },
    },
  });

export const findCalificacion = (id, db = prisma) =>
  db.calificacion.findUnique({ where: { id }, include });

export const findCalificacionByKey = ({ matriculaId, bimestreId, asignacionId }, db = prisma) =>
  db.calificacion.findUnique({
    where: { matriculaId_bimestreId_asignacionId: { matriculaId, bimestreId, asignacionId } },
    include,
  });

export const createCalificacion = (data, db = prisma) => db.calificacion.create({ data, include });

export const updateCalificacion = (id, data, db = prisma) =>
  db.calificacion.update({ where: { id }, data, include });

export const deleteCalificacion = (id, db = prisma) =>
  db.calificacion.update({ where: { id }, data: { activo: false }, include });

export const transaction = (operation) => prisma.$transaction(operation);

export const auditCalificacion = (
  db,
  { usuarioId, tipoEvento, calificacionId, valorAnterior, valorNuevo, requestId },
) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento,
      resultado: 'EXITOSO',
      entidad: 'Calificacion',
      entidadId: calificacionId,
      requestId,
      detalle: {
        valorAnterior: valorAnterior ?? null,
        valorNuevo: valorNuevo ?? null,
      },
    },
  });
