import { prisma } from '../config/database.js';

const include = {
  bimestre: true,
  asignacion: { include: { curso: true, seccion: true, docente: { include: { persona: true } } } },
  competencias: true,
  evidencias: true,
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
  db.planAcademico.delete({ where: { id } });
