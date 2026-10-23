import * as repository from '../repositories/calificacionCompetencia.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => { throw new AppError(status, code, message); };
const requireRole = (user, role) => { if (!user?.roles?.includes(role)) fail(403, 'FORBIDDEN', `Solo un ${role.toLowerCase()} puede realizar esta operación.`); };
const snapshot = (item) => ({ id: item.id, calificacionId: item.calificacionId, competenciaId: item.competenciaId, nivelLogro: item.nivelLogro, conclusionDescriptiva: item.conclusionDescriptiva, activo: item.activo });

async function validateContext(input, db) {
  const [calificacion, competencia] = await Promise.all([
    db.calificacion.findUnique({ where: { id: input.calificacionId }, include: { asignacion: true } }),
    db.competencia.findUnique({ where: { id: input.competenciaId } }),
  ]);
  if (!calificacion?.activo) fail(404, 'GRADE_NOT_FOUND', 'La calificación no existe o está inactiva.');
  if (!competencia?.activo) fail(404, 'COMPETENCY_NOT_FOUND', 'La competencia no existe o está inactiva.');
  if (competencia.cursoId !== calificacion.asignacion.cursoId) fail(400, 'INVALID_COMPETENCY_CONTEXT', 'La competencia no pertenece al curso de la calificación.');
}

export async function listarDetalles() { return repository.listCalificacionesCompetencia({ activo: true }); }
export async function obtenerDetalle(id) {
  const item = await repository.findCalificacionCompetencia(id);
  if (!item?.activo) fail(404, 'GRADE_DETAIL_NOT_FOUND', 'El detalle de calificación no existe o está inactivo.');
  return item;
}

export async function crearDetalle(input, actor, requestId) {
  requireRole(actor, 'DOCENTE');
  return repository.transaction(async (db) => {
    await validateContext(input, db);
    const existing = await repository.findCalificacionCompetenciaByKey(input, db);
    if (existing?.activo) fail(409, 'GRADE_DETAIL_EXISTS', 'La competencia ya tiene una calificación en ese bimestre.');
    const item = existing
      ? await repository.updateCalificacionCompetencia(existing.id, { nivelLogro: input.nivelLogro, conclusionDescriptiva: input.conclusionDescriptiva, activo: true, modificadoPorId: actor.id }, db)
      : await repository.createCalificacionCompetencia({ ...input, creadoPorId: actor.id, modificadoPorId: actor.id }, db);
    await repository.auditCalificacionCompetencia(db, { usuarioId: actor.id, tipoEvento: 'CALIFICACION_COMPETENCIA_CREADA', detalleId: item.id, valorNuevo: snapshot(item), requestId });
    return item;
  });
}

export async function modificarDetalle(id, input, actor, requestId) {
  requireRole(actor, 'ADMINISTRADOR');
  return repository.transaction(async (db) => {
    const actual = await repository.findCalificacionCompetencia(id, db);
    if (!actual?.activo) fail(404, 'GRADE_DETAIL_NOT_FOUND', 'El detalle de calificación no existe o está inactivo.');
    const item = await repository.updateCalificacionCompetencia(id, { ...input, modificadoPorId: actor.id }, db);
    await repository.auditCalificacionCompetencia(db, { usuarioId: actor.id, tipoEvento: 'CALIFICACION_COMPETENCIA_MODIFICADA', detalleId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(item), requestId });
    return item;
  });
}

export async function desactivarDetalle(id, actor, requestId) {
  requireRole(actor, 'ADMINISTRADOR');
  return repository.transaction(async (db) => {
    const actual = await repository.findCalificacionCompetencia(id, db);
    if (!actual?.activo) fail(404, 'GRADE_DETAIL_NOT_FOUND', 'El detalle de calificación no existe o ya está inactivo.');
    const item = await repository.deleteCalificacionCompetencia(id, db);
    await repository.auditCalificacionCompetencia(db, { usuarioId: actor.id, tipoEvento: 'CALIFICACION_COMPETENCIA_DESACTIVADA', detalleId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(item), requestId });
    return item;
  });
}
