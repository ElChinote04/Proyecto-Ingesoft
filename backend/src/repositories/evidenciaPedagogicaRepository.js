import { prisma } from '../config/database.js';

const include = {
  docente: { include: { persona: true } },
  plan: { include: { bimestre: true, asignacion: { include: { curso: true, seccion: { include: { grado: true, anioAcademico: true } }, docente: { include: { persona: true } } } }, competencias: true } },
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
  db.evidenciaPedagogica.update({ where: { id }, data: { activo: false, modificadoEn: new Date() }, include });

export const transaction = (operation) => prisma.$transaction(operation);

export const auditEvidenciaPedagogica = (db, { usuarioId, tipoEvento, evidenciaId, valorAnterior, valorNuevo, requestId }) =>
  db.registroAuditoria.create({
    data: {
      usuarioId,
      tipoEvento,
      resultado: 'EXITO',
      entidad: 'EvidenciaPedagogica',
      entidadId: evidenciaId,
      requestId,
      // Pasa por JSON porque las fechas de la evidencia son Date y el campo guarda JSON.
      detalle: JSON.parse(
        JSON.stringify({ valorAnterior: valorAnterior ?? null, valorNuevo: valorNuevo ?? null }),
      ),
    },
  });
