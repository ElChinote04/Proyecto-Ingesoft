import { prisma } from '../config/database.js';

const include = {
  docente: { include: { persona: true } },
  plan: { include: { asignacion: { include: { curso: true, seccion: true } } } },
  revisor: { select: { id: true, identificador: true } },
};

export const listEvidenciasPedagogicas = (where = {}, db = prisma) =>
  db.evidenciaPedagogica.findMany({ where, include, orderBy: [{ fechaRegistro: 'desc' }, { id: 'desc' }] });

export const findEvidenciaPedagogica = (id, db = prisma) =>
  db.evidenciaPedagogica.findUnique({ where: { id }, include });

export const createEvidenciaPedagogica = (data, db = prisma) =>
  db.evidenciaPedagogica.create({ data, include });

export const updateEvidenciaPedagogica = (id, data, db = prisma) =>
  db.evidenciaPedagogica.update({ where: { id }, data, include });

export const deleteEvidenciaPedagogica = (id, db = prisma) =>
  db.evidenciaPedagogica.update({ where: { id }, data: { activo: false }, include });
