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
export const inTransaction = (operation) =>
  prisma.$transaction(operation, { isolationLevel: 'Serializable' });
export async function saveAttendance(db, sesionId, version, records, userId) {
  const result = await db.sesionClase.updateMany({
    where: { id: sesionId, version },
    data: { version: { increment: 1 } },
  });
  if (result.count !== 1) return false;
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
        version: version + 1,
        cambios: records.map((r) => ({
          alumnoId: r.alumnoId,
          anterior: r.anterior,
          nuevo: r.estado,
        })),
      },
    },
  });
  return { fechaHora: event.fechaHora, version: version + 1 };
}
