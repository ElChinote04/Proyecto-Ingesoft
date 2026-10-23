import { prisma } from '../config/database.js';

const include = {
  cursos: true,
  planes: true,
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
  db.competencia.delete({ where: { id } });
