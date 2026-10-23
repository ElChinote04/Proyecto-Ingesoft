import { prisma } from '../config/database.js';

const include = {
  competencias: true,
};

export const listCursos = (where = {}, db = prisma) =>
  db.curso.findMany({ where, include, orderBy: { nombre: 'asc' } });

export const findCurso = (id, db = prisma) =>
  db.curso.findUnique({ where: { id }, include });

export const findCursoByCodigo = (codigo, db = prisma) =>
  db.curso.findUnique({ where: { codigo }, include });

export const createCurso = (data, db = prisma) =>
  db.curso.create({ data, include });

export const updateCurso = (id, data, db = prisma) =>
  db.curso.update({ where: { id }, data, include });

export const deleteCurso = (id, db = prisma) =>
  db.curso.delete({ where: { id } });
