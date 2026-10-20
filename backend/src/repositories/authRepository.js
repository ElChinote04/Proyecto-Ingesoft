import { prisma } from '../config/database.js';
const include = {
  roles: { include: { rol: true } },
  persona: { include: { docente: true, estudiante: true, apoderado: true } },
};
export const transaction = (operation) => prisma.$transaction(operation, { timeout: 15000 });
export const lockIdentifier = async (identificador, db) => {
  await db.$queryRaw`SELECT id FROM "Usuario" WHERE identificador = ${identificador} FOR UPDATE`;
  return db.usuario.findUnique({ where: { identificador }, include });
};
export const findUserById = (id) => prisma.usuario.findUnique({ where: { id }, include });
export const updateUser = (id, data, db = prisma) => db.usuario.update({ where: { id }, data });
export const createSession = (data, db) => db.sesionAuth.create({ data });
export const findSession = (id) => prisma.sesionAuth.findUnique({ where: { id } });
export const touchSession = (id) =>
  prisma.sesionAuth.updateMany({ where: { id }, data: { ultimaActividad: new Date() } });
export const deleteSession = (id) => prisma.sesionAuth.deleteMany({ where: { id } });
export const revokeSessions = (usuarioId, db) => db.sesionAuth.deleteMany({ where: { usuarioId } });
export const deleteExpiredSessions = (db) =>
  db.sesionAuth.deleteMany({ where: { expiraEn: { lt: new Date() } } });
export const audit = (data, db = prisma) => db.registroAuditoria.create({ data });
