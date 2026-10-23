
import { prisma } from '../config/database.js';
import { auditCreate, auditUpdate } from '../utils/audit.js';

// 1. Buscaremos un docente por su ID
export const findDocente = (docenteId, db = prisma) =>
  db.docente.findUnique({
    where: { id: docenteId },
    include: {
      persona: true,
    },
  });

// 2. Buscaremos la asistencia de un docente en una fecha
export const findByDocenteAndFecha = (docenteId, fecha, db = prisma) =>
  db.asistenciaDocente.findUnique({
    where: {
      docenteId_fecha: {
        docenteId,
        fecha,
      },
    },
  });

// 3. Obtendremos el historial completo de un docente
export const findByDocente = (docenteId, db = prisma) =>
  db.asistenciaDocente.findMany({
    where: {
      docenteId,
    },
    orderBy: {
      fecha: 'desc',
    },
  });

// 4. Consultaremos asistencias por rango de fechas
export const findByDateRange = (
  { fechaInicio, fechaFin, docenteId },
  db = prisma
) =>
  db.asistenciaDocente.findMany({
    where: {
      fecha: {
        gte: fechaInicio,
        lte: fechaFin,
      },
      ...(docenteId !== undefined ? { docenteId } : {}),
    },
    include: {
      docente: {
        select: {
          id: true,
          codigoDocente: true,
          persona: {
            select: {
              nombres: true,
              apellidos: true,
            },
          },
        },
      },
    },
    orderBy: [
      { fecha: 'desc' },
      { docenteId: 'asc' },
    ],
  });

// 5. Ejecutaremos operaciones dentro de una transacción
export const inTransaction = (docenteId, operation) =>
  prisma.$transaction(
    async (db) => {
      await db.$queryRaw`
        SELECT id FROM "Docente"
        WHERE id = ${docenteId}
        FOR UPDATE
      `;

      return operation(db);
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: 15000,
    }
  );

// 6. Crear o actualizar la asistencia de un docente
export async function saveAttendance(
  db,
  { docenteId, fecha, condicion, observacion = '' },
  userId
) {
  const anterior = await findByDocenteAndFecha(
    docenteId,
    fecha,
    db
  );

  const asistencia = await db.asistenciaDocente.upsert({
    where: {
      docenteId_fecha: {
        docenteId,
        fecha,
      },
    },

    create: {
      docenteId,
      fecha,
      condicion,
      observacion,
      ...auditCreate(userId),
    },

    update: {
      condicion,
      observacion,
      ...auditUpdate(userId),
    },
  });

  await db.registroAuditoria.create({
    data: {
      usuarioId: userId,
      tipoEvento: 'ASISTENCIA_DOCENTE_GUARDADA',
      entidad: 'AsistenciaDocente',
      entidadId: asistencia.id,
      detalle: {
        docenteId,
        fecha: fecha.toISOString().slice(0, 10),
        anterior: anterior?.condicion ?? null,
        nuevo: condicion,
      },
    },
  });

  return asistencia;
}
