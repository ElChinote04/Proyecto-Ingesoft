import * as repository from '../repositories/evidenciaPedagogicaRepository.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => { throw new AppError(status, code, message); };
const isAdmin = (user) => user?.roles?.includes('ADMINISTRADOR');
const isTeacher = (user) => user?.roles?.includes('DOCENTE');
const date = (value) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
const snapshot = (evidence) => ({ id: evidence.id, docenteId: evidence.docenteId, planId: evidence.planId, fechaRegistro: evidence.fechaRegistro, fechaEntrega: evidence.fechaEntrega, descripcionAvance: evidence.descripcionAvance, archivos: evidence.archivos, observacionesRevision: evidence.observacionesRevision, estadoRevision: evidence.estadoRevision, fechaRevision: evidence.fechaRevision, activo: evidence.activo });

async function findContext(input, db) {
  const [docente, plan] = await Promise.all([
    db.docente.findUnique({ where: { id: input.docenteId }, include: { persona: true } }),
    db.planAcademico.findUnique({ where: { id: input.planId }, include: { asignacion: true } }),
  ]);
  if (!docente?.activo || !docente.persona.activo) fail(404, 'TEACHER_NOT_FOUND', 'El docente no existe o está inactivo.');
  if (!plan?.activo) fail(404, 'PLAN_NOT_FOUND', 'El plan no existe o está inactivo.');
  if (plan.asignacion.docenteId !== docente.id) fail(400, 'INVALID_PLAN_TEACHER', 'El docente no corresponde al plan académico.');
  const entrega = date(input.fechaEntrega);
  if (entrega && entrega < plan.fechaInicio) fail(400, 'INVALID_DELIVERY_DATE', 'La fecha de entrega no puede ser anterior al inicio del plan.');
  if (plan.fechaFin && entrega && entrega > plan.fechaFin) fail(400, 'INVALID_DELIVERY_DATE', 'La fecha de entrega no puede superar el fin del plan.');
  return { docente, plan, entrega };
}

export async function listarEvidencias() { return repository.listEvidenciasPedagogicas({ activo: true }); }
export async function obtenerEvidencia(id) {
  const evidence = await repository.findEvidenciaPedagogica(id);
  if (!evidence?.activo) fail(404, 'EVIDENCE_NOT_FOUND', 'La evidencia no existe o está inactiva.');
  return evidence;
}

export async function crearEvidencia(input, actor, requestId) {
  if (!isTeacher(actor)) fail(403, 'FORBIDDEN', 'Solo un docente puede crear evidencias.');
  if (actor.docenteId !== input.docenteId) fail(403, 'FORBIDDEN', 'Solo puedes crear evidencias propias.');
  return repository.transaction(async (db) => {
    const context = await findContext(input, db);
    const evidence = await repository.createEvidenciaPedagogica({ docenteId: input.docenteId, planId: input.planId, fechaRegistro: new Date(), fechaEntrega: context.entrega, descripcionAvance: input.descripcionAvance, archivos: input.archivos, estadoRevision: 'PENDIENTE_REVISION', creadoPorId: actor.id, modificadoPorId: actor.id }, db);
    await repository.auditEvidenciaPedagogica(db, { usuarioId: actor.id, tipoEvento: 'EVIDENCIA_CREADA', evidenciaId: evidence.id, valorNuevo: snapshot(evidence), requestId });
    return evidence;
  });
}

export async function modificarEvidencia(id, input, actor, requestId) {
  if (!isTeacher(actor)) fail(403, 'FORBIDDEN', 'Solo un docente puede modificar evidencias.');
  return repository.transaction(async (db) => {
    const actual = await repository.findEvidenciaPedagogica(id, db);
    if (!actual?.activo) fail(404, 'EVIDENCE_NOT_FOUND', 'La evidencia no existe o está inactiva.');
    if (actual.docenteId !== actor.docenteId) fail(403, 'FORBIDDEN', 'Solo puedes modificar evidencias propias.');
    const data = { ...(input.fechaEntrega !== undefined && { fechaEntrega: date(input.fechaEntrega) }), ...(input.descripcionAvance !== undefined && { descripcionAvance: input.descripcionAvance }), ...(input.archivos !== undefined && { archivos: input.archivos }), modificadoPorId: actor.id };
    if (input.fechaEntrega !== undefined) await findContext({ docenteId: actual.docenteId, planId: actual.planId, fechaEntrega: input.fechaEntrega }, db);
    const evidence = await repository.updateEvidenciaPedagogica(id, data, db);
    await repository.auditEvidenciaPedagogica(db, { usuarioId: actor.id, tipoEvento: 'EVIDENCIA_MODIFICADA', evidenciaId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(evidence), requestId });
    return evidence;
  });
}

export async function revisarEvidencia(id, input, actor, requestId) {
  if (!isAdmin(actor) && !isTeacher(actor)) fail(403, 'FORBIDDEN', 'Solo docentes y administradores pueden revisar evidencias.');
  return repository.transaction(async (db) => {
    const actual = await repository.findEvidenciaPedagogica(id, db);
    if (!actual?.activo) fail(404, 'EVIDENCE_NOT_FOUND', 'La evidencia no existe o está inactiva.');
    const evidence = await repository.updateEvidenciaPedagogica(id, { estadoRevision: input.estadoRevision, observacionesRevision: input.observacionesRevision ?? null, revisorId: actor.id, fechaRevision: new Date(), modificadoPorId: actor.id }, db);
    await repository.auditEvidenciaPedagogica(db, { usuarioId: actor.id, tipoEvento: 'EVIDENCIA_REVISADA', evidenciaId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(evidence), requestId });
    return evidence;
  });
}

export async function desactivarEvidencia(id, actor, requestId) {
  if (!isAdmin(actor)) fail(403, 'FORBIDDEN', 'Solo un administrador puede desactivar evidencias.');
  return repository.transaction(async (db) => {
    const actual = await repository.findEvidenciaPedagogica(id, db);
    if (!actual?.activo) fail(404, 'EVIDENCE_NOT_FOUND', 'La evidencia no existe o ya está inactiva.');
    const evidence = await repository.deleteEvidenciaPedagogica(id, db);
    await repository.auditEvidenciaPedagogica(db, { usuarioId: actor.id, tipoEvento: 'EVIDENCIA_DESACTIVADA', evidenciaId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(evidence), requestId });
    return evidence;
  });
}
