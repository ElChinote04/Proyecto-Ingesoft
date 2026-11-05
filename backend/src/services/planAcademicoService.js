import * as repository from '../repositories/PlanAcademicoRepository.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => { throw new AppError(status, code, message); };
const isAdmin = (user) => user?.roles?.includes('ADMINISTRADOR');
const isTeacher = (user) => user?.roles?.includes('DOCENTE');
const date = (value) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
const snapshot = (plan) => ({ id: plan.id, bimestreId: plan.bimestreId, asignacionId: plan.asignacionId, titulo: plan.titulo, objetivo: plan.objetivo, fechaInicio: plan.fechaInicio, fechaFin: plan.fechaFin, activo: plan.activo, competenciaIds: plan.competencias?.map(({ id }) => id) });

function canManage(user, asignacion) {
  return isAdmin(user) || (isTeacher(user) && user.docenteId === asignacion.docenteId);
}

async function validateContext(input, db) {
  const [bimestre, asignacion] = await Promise.all([
    db.bimestreAcademico.findUnique({ where: { id: input.bimestreId } }),
    db.cursoSeccionDocente.findUnique({ where: { id: input.asignacionId } }),
  ]);
  if (!bimestre?.activo) fail(404, 'TERM_NOT_FOUND', 'El bimestre no existe o está inactivo.');
  if (!asignacion?.activo) fail(404, 'ASSIGNMENT_NOT_FOUND', 'La asignación no existe o está inactiva.');
  const inicio = new Date();
  if (inicio < bimestre.fechaInicio || inicio > bimestre.fechaFin) fail(400, 'INVALID_PLAN_START', 'La fecha de inicio debe estar dentro del bimestre.');
  const fin = date(input.fechaFin);
  if (fin && (fin < inicio || fin > bimestre.fechaFin)) fail(400, 'INVALID_PLAN_END', 'La fecha fin debe ser posterior a la creación y estar dentro del bimestre.');
  const competenciaIds = input.competenciaIds ?? [];
  const competencias = await db.competencia.findMany({ where: { id: { in: competenciaIds } } });
  if (competencias.length !== competenciaIds.length || competencias.some((item) => !item.activo || item.cursoId !== asignacion.cursoId))
    fail(400, 'INVALID_PLAN_COMPETENCIES', 'Las competencias deben pertenecer al curso y estar activas.');
  return { bimestre, asignacion, fin, competencias };
}

export async function listarPlanes() { return repository.listPlanesAcademicos({ activo: true }); }
export async function obtenerPlan(id) {
  const plan = await repository.findPlanAcademico(id);
  if (!plan?.activo) fail(404, 'PLAN_NOT_FOUND', 'El plan no existe o está inactivo.');
  return plan;
}

export async function crearPlan(input, actor, requestId) {
  if (!isAdmin(actor) && !isTeacher(actor)) fail(403, 'FORBIDDEN', 'Solo docentes y administradores pueden crear planes.');
  return repository.transaction(async (db) => {
    const context = await validateContext(input, db);
    if (!canManage(actor, context.asignacion)) fail(403, 'FORBIDDEN', 'Solo puedes crear planes para tus propias asignaciones.');
    const plan = await repository.createPlanAcademico({ bimestreId: input.bimestreId, asignacionId: input.asignacionId, titulo: input.titulo, objetivo: input.objetivo, fechaInicio: new Date(), fechaFin: context.fin, creadoPorId: actor.id, modificadoPorId: actor.id, competencias: { connect: input.competenciaIds.map((id) => ({ id })) } }, db);
    await repository.auditPlanAcademico(db, { usuarioId: actor.id, tipoEvento: 'PLAN_ACADEMICO_CREADO', planId: plan.id, valorNuevo: snapshot(plan), requestId });
    return plan;
  });
}

export async function modificarPlan(id, input, actor, requestId) {
  if (!isAdmin(actor) && !isTeacher(actor)) fail(403, 'FORBIDDEN', 'Solo docentes y administradores pueden modificar planes.');
  return repository.transaction(async (db) => {
    const actual = await repository.findPlanAcademico(id, db);
    if (!actual?.activo) fail(404, 'PLAN_NOT_FOUND', 'El plan no existe o está inactivo.');
    if (!canManage(actor, actual.asignacion)) fail(403, 'FORBIDDEN', 'Solo puedes modificar planes de tus propias asignaciones.');
    const data = { ...(input.titulo !== undefined && { titulo: input.titulo }), ...(input.objetivo !== undefined && { objetivo: input.objetivo }), modificadoPorId: actor.id, ...(input.competenciaIds !== undefined && { competencias: { set: input.competenciaIds.map((competenciaId) => ({ id: competenciaId })) } }) };
    if (input.competenciaIds !== undefined) {
      const competencias = await db.competencia.findMany({ where: { id: { in: input.competenciaIds } } });
      if (competencias.length !== input.competenciaIds.length || competencias.some((item) => !item.activo || item.cursoId !== actual.asignacion.cursoId))
        fail(400, 'INVALID_PLAN_COMPETENCIES', 'Las competencias deben pertenecer al curso y estar activas.');
    }
    const plan = await repository.updatePlanAcademico(id, data, db);
    await repository.auditPlanAcademico(db, { usuarioId: actor.id, tipoEvento: 'PLAN_ACADEMICO_MODIFICADO', planId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(plan), requestId });
    return plan;
  });
}

export async function desactivarPlan(id, actor, requestId) {
  if (!isAdmin(actor)) fail(403, 'FORBIDDEN', 'Solo un administrador puede desactivar planes.');
  return repository.transaction(async (db) => {
    const actual = await repository.findPlanAcademico(id, db);
    if (!actual?.activo) fail(404, 'PLAN_NOT_FOUND', 'El plan no existe o ya está inactivo.');
    const plan = await repository.deletePlanAcademico(id, db);
    await repository.auditPlanAcademico(db, { usuarioId: actor.id, tipoEvento: 'PLAN_ACADEMICO_DESACTIVADO', planId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(plan), requestId });
    return plan;
  });
}
