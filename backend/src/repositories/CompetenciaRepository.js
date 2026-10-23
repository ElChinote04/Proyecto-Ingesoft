import { prisma } from '../config/database.js';

const include = {
  curso: true,
  planes: {
    where: { activo: true },
    include: { bimestre: true, asignacion: { include: { curso: true, seccion: true, docente: { include: { persona: true } } } } },
  },
  calificaciones: {
    where: { activo: true },
    include: {
      calificacion: {
        include: { matricula: { include: { estudiante: { include: { persona: true } }, seccion: true } }, bimestre: true },
      },
    },
  },
};

export const listCompetencias = (where = {}, db = prisma) =>
  db.competencia.findMany({ where, include, orderBy: [{ nombre: 'asc' }, { id: 'asc' }] });

export const findCompetencia = (id, db = prisma) =>
  db.competencia.findUnique({ where: { id }, include });

export const findCompetenciaByCodigo = (codigo, db = prisma) =>
  db.competencia.findUnique({ where: { codigo }, include });

export const createCompetencia = (data, db = prisma) =>
  db.competencia.create({ data, include });

export const updateCompetencia = (id, data, db = prisma) =>
  db.competencia.update({ where: { id }, data, include });

export const deleteCompetencia = (id, db = prisma) =>
  db.competencia.update({ where: { id }, data: { activo: false }, include });

export const transaction = (operation) => prisma.$transaction(operation);

export const auditCompetencia = (db, { usuarioId, tipoEvento, competenciaId, valorAnterior, valorNuevo, requestId }) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento,
      resultado: 'EXITOSO',
      tipoEntidad: 'Competencia',
      idEntidad: String(competenciaId),
      valorAnterior: valorAnterior ? JSON.stringify(valorAnterior) : null,
      valorNuevo: valorNuevo ? JSON.stringify(valorNuevo) : null,
      observacion: requestId ? `requestId=${requestId}` : null,
    },
  });
