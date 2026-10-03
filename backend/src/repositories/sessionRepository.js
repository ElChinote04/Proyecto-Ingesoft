import { prisma } from '../config/database.js';
import { auditCreate, auditUpdate } from '../utils/audit.js';
const include = {
  bloque: {
    include: {
      aula: true,
      asignacion: {
        include: {
          curso: true,
          docente: { include: { persona: true } },
          seccion: { include: { grado: true, anioAcademico: true } },
        },
      },
    },
  },
};
export const listSessions = (docenteId) =>
  prisma.sesionClase.findMany({
    where: { activo: true, bloque: { asignacion: { docenteId } } },
    include,
    orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
  });
export const findSession = (id, db = prisma) =>
  db.sesionClase.findUnique({ where: { id }, include });
export const findStudents = (seccionId, sesionId, db = prisma) =>
  db.matricula.findMany({
    where: { seccionId, activo: true, estudiante: { persona: { activo: true } } },
    include: { estudiante: { include: { persona: true } }, asistencias: { where: { sesionId } } },
    orderBy: { estudiante: { id: 'asc' } },
  });
// El bloqueo interno ordena guardados completos de la misma sesión.
// No requiere una versión del cliente ni rechaza formularios abiertos previamente.
export const inTransaction = (sesionId, operation) =>
  prisma.$transaction(
    async (db) => {
      await db.$queryRaw`SELECT id FROM "SesionClase" WHERE id = ${sesionId} FOR UPDATE`;
      return operation(db);
    },
    { isolationLevel: 'ReadCommitted', timeout: 15000 },
  );
export async function saveAttendance(db, sesionId, records, userId) {
  for (const record of records) {
    const data = { condicion: record.estado, observacion: record.observacion };
    await db.asistenciaEstudiante.upsert({
      where: { sesionId_matriculaId: { sesionId, matriculaId: record.matriculaId } },
      create: { sesionId, matriculaId: record.matriculaId, ...data, ...auditCreate(userId) },
      update: { ...data, ...auditUpdate(userId) },
    });
  }
  const event = await db.registroAuditoria.create({
    data: {
      usuarioId: userId,
      tipoEvento: 'ASISTENCIA_GUARDADA',
      entidadId: sesionId,
      detalle: {
        cambios: records.map((r) => ({
          alumnoId: r.alumnoId,
          anterior: r.anterior,
          nuevo: r.estado,
        })),
      },
    },
  });
  return { fechaHora: event.fechaHora };
}
