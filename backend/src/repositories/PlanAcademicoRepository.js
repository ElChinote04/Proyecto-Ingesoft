import { prisma } from '../config/database.js';

const include = {
  bimestre: true,
  asignacion: { include: { curso: true, seccion: { include: { grado: true, anioAcademico: true } }, docente: { include: { persona: true } } } },
  competencias: { where: { activo: true }, include: { curso: true } },
  evidencias: { where: { activo: true }, include: { docente: { include: { persona: true } }, revisor: true } },
};

export const listPlanesAcademicos = (where = {}, db = prisma) =>
  db.planAcademico.findMany({ where, include, orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }] });

export const findPlanAcademico = (id, db = prisma) =>
  db.planAcademico.findUnique({ where: { id }, include });

export const createPlanAcademico = (data, db = prisma) =>
  db.planAcademico.create({ data, include });

export const updatePlanAcademico = (id, data, db = prisma) =>
  db.planAcademico.update({ where: { id }, data, include });

export const deletePlanAcademico = (id, db = prisma) =>
  db.planAcademico.update({ where: { id }, data: { activo: false, fechaFin: new Date() }, include });

export const transaction = (operation) => prisma.$transaction(operation);

export const auditPlanAcademico = (db, { usuarioId, tipoEvento, planId, valorAnterior, valorNuevo, requestId }) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento,
      resultado: 'EXITOSO',
      tipoEntidad: 'PlanAcademico',
      idEntidad: String(planId),
      valorAnterior: valorAnterior ? JSON.stringify(valorAnterior) : null,
      valorNuevo: valorNuevo ? JSON.stringify(valorNuevo) : null,
      observacion: requestId ? `requestId=${requestId}` : null,
    },
  });
