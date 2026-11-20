import * as repository from '../repositories/planesAcademicos.repository.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import {
  aTexto,
  estaCerrado,
  listarSemanas,
  tieneFechas,
  totalSemanas,
} from '../domain/semanasBimestre.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

export const esAdministrador = (actor) => actor.roles.includes('ADMINISTRADOR');
const esDocente = (actor) => actor.roles.includes('DOCENTE');
const fecha = (valor) => new Date(`${valor}T00:00:00.000Z`);
const texto = (valor) => valor && aTexto(valor);

// Vale la clase (curso + sección), no el id de asignación: reasignar un curso crea otra
// asignación y el plan sigue ligado a la anterior.
export async function esDocenteVigente(plan, actor, db) {
  if (!esDocente(actor) || !actor.docenteId) return false;
  const total = await repository.contarAsignacionesVigentes(
    { docenteId: actor.docenteId, cursoId: plan.cursoId, seccionId: plan.seccionId },
    db,
  );
  return total > 0;
}

export async function exigirConsultaPlan(plan, actor, db) {
  if (!esAdministrador(actor) && !(await esDocenteVigente(plan, actor, db)))
    fail(403, 'FORBIDDEN', 'Solo el docente del curso y el administrador consultan este plan.');
}

export async function exigirGestionPlan(plan, actor, db) {
  if (!esAdministrador(actor) && !(await esDocenteVigente(plan, actor, db)))
    fail(403, 'FORBIDDEN', 'Solo el docente del curso puede modificar este plan.');
}

export function exigirFechasBimestre(bimestre) {
  if (!tieneFechas(bimestre))
    fail(409, 'TERM_WITHOUT_DATES', 'El administrador aún no definió las fechas de este bimestre.');
}

export async function exigirPlanActivo(id, db) {
  const plan = await repository.findPlan(id, db);
  if (!plan?.activo) fail(404, 'PLAN_NOT_FOUND', 'El plan no existe o está inactivo.');
  return plan;
}

const nombreDocente = (plan) => {
  const persona = plan.asignacion?.docente?.persona;
  return persona ? `${persona.nombres} ${persona.apellidos}` : null;
};

export function presentarBimestre(bimestre) {
  return {
    id: bimestre.id,
    nombre: bimestre.nombre,
    fechaInicio: texto(bimestre.fechaInicio),
    fechaFin: texto(bimestre.fechaFin),
    semanas: totalSemanas(bimestre),
    cerrado: estaCerrado(bimestre),
  };
}

export const presentarClase = (plan) => ({
  curso: { id: plan.curso.id, nombre: plan.curso.nombre },
  seccion: { id: plan.seccion.id, nombre: plan.seccion.nombre, grado: plan.seccion.grado.nombre },
});

function presentarResumen(plan) {
  return {
    id: plan.id,
    titulo: plan.titulo,
    objetivo: plan.objetivo,
    fechaInicio: texto(plan.fechaInicio),
    fechaFin: texto(plan.fechaFin),
    ...presentarClase(plan),
    docente: nombreDocente(plan),
    bimestre: presentarBimestre(plan.bimestre),
    competencias: plan.competencias,
    ...(plan._count && { totalActividades: plan._count.evidencias }),
  };
}

export function presentarEvidenciaResumida(evidencia) {
  return {
    id: evidencia.id,
    numeroSemana: evidencia.numeroSemana,
    tipo: evidencia.tipo,
    titulo: evidencia.titulo,
    descripcion: evidencia.descripcion,
    estado: evidencia.estado,
    fechaRealizacion: texto(evidencia.fechaRealizacion),
    estadoRevision: evidencia.estadoRevision,
    observacionesRevision: evidencia.observacionesRevision,
    totalArchivos: evidencia._count.archivos,
    totalEnlaces: evidencia.enlaces.length,
  };
}

/** Todas las semanas del bimestre, también las vacías, con sus actividades en orden. */
export function agruparPorSemana(bimestre, evidencias, presentar) {
  return listarSemanas(bimestre).map((semana) => ({
    ...semana,
    evidencias: evidencias
      .filter(({ numeroSemana }) => numeroSemana === semana.numero)
      .map(presentar),
  }));
}

const snapshot = (plan) => ({
  id: plan.id,
  bimestreId: plan.bimestreId,
  asignacionId: plan.asignacionId,
  cursoId: plan.cursoId,
  seccionId: plan.seccionId,
  titulo: plan.titulo,
  objetivo: plan.objetivo,
  fechaInicio: plan.fechaInicio,
  fechaFin: plan.fechaFin,
  activo: plan.activo,
  competenciaIds: plan.competencias.map(({ id }) => id),
});

export async function listarPlanes(filtros, actor) {
  const where = {
    ...(filtros.bimestreId && { bimestreId: filtros.bimestreId }),
    ...(filtros.cursoId && { cursoId: filtros.cursoId }),
    ...(filtros.seccionId && { seccionId: filtros.seccionId }),
  };
  if (esAdministrador(actor)) return (await repository.listPlanes(where)).map(presentarResumen);
  if (!esDocente(actor) || !actor.docenteId)
    fail(403, 'FORBIDDEN', 'Los planes de trabajo los consultan el docente y el administrador.');
  const clases = await repository.listClasesVigentes(actor.docenteId);
  if (!clases.length) return [];
  const planes = await repository.listPlanes({
    ...where,
    OR: clases.map(({ cursoId, seccionId }) => ({ cursoId, seccionId })),
  });
  return planes.map(presentarResumen);
}

export async function obtenerPlan(id, actor) {
  const plan = await repository.findPlanConEvidencias(id);
  if (!plan?.activo) fail(404, 'PLAN_NOT_FOUND', 'El plan no existe o está inactivo.');
  await exigirConsultaPlan(plan, actor);
  const bimestre = presentarBimestre(plan.bimestre);
  return {
    ...presentarResumen(plan),
    // Lo que la pantalla puede ofrecer; el servidor lo vuelve a comprobar al guardar.
    puedeEditar: esAdministrador(actor) || !bimestre.cerrado,
    semanas: agruparPorSemana(plan.bimestre, plan.evidencias, presentarEvidenciaResumida),
  };
}

async function validarCompetencias(ids, cursoId, db) {
  const competencias = await repository.listCompetencias(ids, db);
  if (
    competencias.length !== ids.length ||
    competencias.some((item) => !item.activo || item.cursoId !== cursoId)
  )
    fail(
      400,
      'INVALID_PLAN_COMPETENCIES',
      'Las competencias deben pertenecer al curso y estar activas.',
    );
}

function validarRangoPlan({ fechaInicio, fechaFin }, bimestre) {
  const inicioBimestre = aTexto(bimestre.fechaInicio);
  const finBimestre = aTexto(bimestre.fechaFin);
  if (fechaInicio < inicioBimestre || fechaInicio > finBimestre)
    fail(400, 'INVALID_PLAN_START', 'La fecha de inicio del plan debe estar dentro del bimestre.');
  if (fechaFin && (fechaFin < fechaInicio || fechaFin > finBimestre))
    fail(
      400,
      'INVALID_PLAN_END',
      'La fecha de fin del plan debe estar entre su inicio y el fin del bimestre.',
    );
}

export async function crearPlan(input, actor, requestId) {
  if (!esAdministrador(actor) && !esDocente(actor))
    fail(403, 'FORBIDDEN', 'Solo docentes y administradores crean planes de trabajo.');
  try {
    return await repository.transaction(async (db) => {
      const [asignacion, bimestre] = await Promise.all([
        repository.findAsignacion(input.asignacionId, db),
        repository.findBimestre(input.bimestreId, db),
      ]);
      if (!asignacion?.activo || !asignacion.curso.activo)
        fail(404, 'ASSIGNMENT_NOT_FOUND', 'La asignación no existe o está inactiva.');
      if (!esAdministrador(actor) && asignacion.docenteId !== actor.docenteId)
        fail(403, 'FORBIDDEN', 'Solo puedes crear planes para los cursos que dictas.');
      if (!bimestre?.activo) fail(404, 'TERM_NOT_FOUND', 'El bimestre no existe o está inactivo.');
      if (bimestre.anioAcademicoId !== asignacion.seccion.anioAcademicoId)
        fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año de la sección.');
      exigirFechasBimestre(bimestre);
      // Se puede planificar antes del bimestre o durante él, nunca cuando ya terminó.
      if (estaCerrado(bimestre))
        fail(409, 'TERM_CLOSED', 'El bimestre ya terminó: no se pueden crear planes.');
      const fechaInicio = input.fechaInicio ?? aTexto(bimestre.fechaInicio);
      validarRangoPlan({ fechaInicio, fechaFin: input.fechaFin }, bimestre);
      await validarCompetencias(input.competenciaIds, asignacion.cursoId, db);
      const existente = await repository.findPlanActivoDeClase(
        { cursoId: asignacion.cursoId, seccionId: asignacion.seccionId, bimestreId: bimestre.id },
        db,
      );
      if (existente)
        fail(409, 'PLAN_EXISTS', 'Esta clase ya tiene un plan de trabajo en el bimestre.');
      const plan = await repository.createPlan(
        {
          bimestreId: bimestre.id,
          asignacionId: asignacion.id,
          cursoId: asignacion.cursoId,
          seccionId: asignacion.seccionId,
          titulo: input.titulo,
          objetivo: input.objetivo,
          fechaInicio: fecha(fechaInicio),
          fechaFin: input.fechaFin ? fecha(input.fechaFin) : null,
          competenciaIds: input.competenciaIds,
          creadoPorId: actor.id,
          modificadoPorId: actor.id,
        },
        db,
      );
      await registrarTransaccionCritica(db, {
        actorId: actor.id,
        evento: 'PLAN_ACADEMICO_CREADO',
        entidad: 'PlanAcademico',
        entidadId: plan.id,
        nuevo: snapshot(plan),
        requestId,
      });
      return presentarResumen(plan);
    });
  } catch (error) {
    // Dos altas simultáneas pasan la comprobación previa; el índice único parcial decide.
    if (error.code === 'P2002')
      fail(409, 'PLAN_EXISTS', 'Esta clase ya tiene un plan de trabajo en el bimestre.');
    throw error;
  }
}

export async function modificarPlan(id, input, actor, requestId) {
  return repository.transaction(async (db) => {
    const encontrado = await exigirPlanActivo(id, db);
    await exigirGestionPlan(encontrado, actor, db);
    await repository.bloquearPlan(id, db);
    const anterior = await exigirPlanActivo(id, db);
    if (!esAdministrador(actor) && estaCerrado(anterior.bimestre))
      fail(409, 'TERM_CLOSED', 'El bimestre ya terminó: el plan queda en solo lectura.');
    if (input.fechaFin)
      validarRangoPlan(
        { fechaInicio: aTexto(anterior.fechaInicio), fechaFin: input.fechaFin },
        anterior.bimestre,
      );
    if (input.competenciaIds) await validarCompetencias(input.competenciaIds, anterior.cursoId, db);
    const plan = await repository.updatePlan(
      id,
      {
        ...(input.titulo !== undefined && { titulo: input.titulo }),
        ...(input.objetivo !== undefined && { objetivo: input.objetivo }),
        ...(input.fechaFin !== undefined && { fechaFin: input.fechaFin && fecha(input.fechaFin) }),
        competenciaIds: input.competenciaIds,
        modificadoPorId: actor.id,
      },
      db,
    );
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'PLAN_ACADEMICO_MODIFICADO',
      entidad: 'PlanAcademico',
      entidadId: id,
      anterior: snapshot(anterior),
      nuevo: snapshot(plan),
      requestId,
    });
    return presentarResumen(plan);
  });
}

export async function desactivarPlan(id, actor, requestId) {
  if (!esAdministrador(actor)) fail(403, 'FORBIDDEN', 'Solo un administrador desactiva planes.');
  return repository.transaction(async (db) => {
    await exigirPlanActivo(id, db);
    await repository.bloquearPlan(id, db);
    const anterior = await exigirPlanActivo(id, db);
    const { count } = await repository.desactivarEvidenciasDelPlan(
      { planId: id, actorId: actor.id },
      db,
    );
    const plan = await repository.updatePlan(id, { activo: false, modificadoPorId: actor.id }, db);
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'PLAN_ACADEMICO_DESACTIVADO',
      entidad: 'PlanAcademico',
      entidadId: id,
      anterior: snapshot(anterior),
      nuevo: snapshot(plan),
      contexto: { actividadesDesactivadas: count },
      requestId,
    });
    return presentarResumen(plan);
  });
}
