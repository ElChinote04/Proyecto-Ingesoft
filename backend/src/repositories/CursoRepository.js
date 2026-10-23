import { prisma } from '../config/database.js';

const include = {
  competencias: { where: { activo: true }, orderBy: { nombre: 'asc' } },
  reglas: {
    where: { activo: true },
    include: { grado: true },
    orderBy: { version: 'desc' },
  },
  asignaciones: {
    where: { activo: true },
    include: {
      seccion: { include: { grado: true, anioAcademico: true } },
      anioAcademico: true,
      docente: { include: { persona: true } },
      bloques: {
        where: { activo: true },
        include: {
          aula: true,
          sesiones: { where: { activo: true }, orderBy: { fecha: 'asc' } },
        },
      },
    },
  },
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
  db.curso.update({ where: { id }, data: { activo: false }, include });

export const transaction = (operation) => prisma.$transaction(operation);

export const auditCurso = (db, { usuarioId, tipoEvento, cursoId, valorAnterior, valorNuevo, requestId }) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento,
      resultado: 'EXITOSO',
      tipoEntidad: 'Curso',
      idEntidad: String(cursoId),
      valorAnterior: valorAnterior ? JSON.stringify(valorAnterior) : null,
      valorNuevo: valorNuevo ? JSON.stringify(valorNuevo) : null,
      observacion: requestId ? `requestId=${requestId}` : null,
    },
  });
