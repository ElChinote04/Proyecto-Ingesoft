import { prisma } from '../config/database.js';

const include = {
  grado: true,
  curso: true,
  calificaciones: { where: { activo: true }, include: { matricula: { include: { estudiante: { include: { persona: true } } } }, bimestre: true } },
};

export const listReglasConsolidacion = (where = {}, db = prisma) =>
  db.reglaConsolidacion.findMany({ where, include, orderBy: [{ nombre: 'asc' }, { version: 'desc' }] });

export const findReglaConsolidacion = (id, db = prisma) =>
  db.reglaConsolidacion.findUnique({ where: { id }, include });

export const createReglaConsolidacion = (data, db = prisma) =>
  db.reglaConsolidacion.create({ data, include });

export const updateReglaConsolidacion = (id, data, db = prisma) =>
  db.reglaConsolidacion.update({ where: { id }, data, include });

export const deleteReglaConsolidacion = (id, db = prisma) =>
  db.reglaConsolidacion.update({ where: { id }, data: { activo: false, vigenteHasta: new Date() }, include });

export const transaction = (operation) => prisma.$transaction(operation);

export const auditReglaConsolidacion = (db, { usuarioId, tipoEvento, reglaId, valorAnterior, valorNuevo, requestId }) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento,
      resultado: 'EXITOSO',
      tipoEntidad: 'ReglaConsolidacion',
      idEntidad: String(reglaId),
      valorAnterior: valorAnterior ? JSON.stringify(valorAnterior) : null,
      valorNuevo: valorNuevo ? JSON.stringify(valorNuevo) : null,
      observacion: requestId ? `requestId=${requestId}` : null,
    },
  });
