import { prisma } from '../config/database.js';
const include = { roles: { include: { rol: true } }, persona: { include: { docente: true } } };
export const findUserByIdentifier = (identificador) =>
  prisma.usuario.findUnique({ where: { identificador }, include });
export const findUserById = (id) => prisma.usuario.findUnique({ where: { id }, include });
export const createSession = (data) => prisma.sesionAuth.create({ data });
export const findSession = (id) => prisma.sesionAuth.findUnique({ where: { id } });
export const deleteSession = (id) => prisma.sesionAuth.deleteMany({ where: { id } });
export const deleteExpiredSessions = () =>
  prisma.sesionAuth.deleteMany({ where: { expiraEn: { lt: new Date() } } });
