import { prisma } from '../config/database.js';
export const pingDatabase = () => prisma.$queryRaw`SELECT 1`;
