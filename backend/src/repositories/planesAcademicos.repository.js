import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

const clase = {
  curso: { select: { id: true, nombre: true } },
  seccion: {
    select: { id: true, nombre: true, anioAcademicoId: true, grado: { select: { nombre: true } } },
  },
};

const resumenEvidencia = {
  id: true,
  numeroSemana: true,
  tipo: true,
  titulo: true,
  descripcion: true,
  publicadaDesde: true,
  estadoRevision: true,
  observacionesRevision: true,
  enlaces: true,
  creadoEn: true,
  _count: { select: { archivos: { where: { activo: true } } } },
};

const plan = {
  id: true,
  bimestreId: true,
  asignacionId: true,
  cursoId: true,
  seccionId: true,
  titulo: true,
  objetivo: true,
  fechaInicio: true,
  fechaFin: true,
  activo: true,
  ...clase,
  bimestre: {
    select: {
      id: true,
      nombre: true,
      numero: true,
      fechaInicio: true,
      fechaFin: true,
      anioAcademicoId: true,
    },
  },
  asignacion: {
    select: { docente: { select: { persona: { select: { nombres: true, apellidos: true } } } } },
  },
  competencias: {
    where: { activo: true },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { codigo: 'asc' },
  },
};

export const findPlan = (id, db = prisma) =>
  db.planAcademico.findUnique({ where: { id }, select: plan });

export const findPlanConEvidencias = (id, db = prisma) =>
  db.planAcademico.findUnique({
    where: { id },
    select: {
      ...plan,
      evidencias: {
        where: { activo: true },
        select: resumenEvidencia,
        orderBy: [{ numeroSemana: 'asc' }, { creadoEn: 'asc' }, { id: 'asc' }],
      },
    },
  });

export const listPlanes = (where, db = prisma) =>
  db.planAcademico.findMany({
    where: { activo: true, ...where },
    select: { ...plan, _count: { select: { evidencias: { where: { activo: true } } } } },
    orderBy: [{ bimestre: { numero: 'asc' } }, { curso: { nombre: 'asc' } }, { id: 'asc' }],
  });

export const findPlanActivoDeClase = ({ cursoId, seccionId, bimestreId }, db = prisma) =>
  db.planAcademico.findFirst({
    where: { cursoId, seccionId, bimestreId, activo: true },
    select: plan,
  });

export const findAsignacion = (id, db = prisma) =>
  db.cursoSeccionDocente.findUnique({
    where: { id },
    select: {
      id: true,
      cursoId: true,
      seccionId: true,
      docenteId: true,
      activo: true,
      curso: { select: { activo: true } },
      seccion: { select: { anioAcademicoId: true } },
    },
  });

export const findBimestre = (id, db = prisma) => db.bimestreAcademico.findUnique({ where: { id } });

export const listCompetencias = (ids, db = prisma) =>
  db.competencia.findMany({
    where: { id: { in: ids } },
    select: { id: true, cursoId: true, activo: true },
  });

// Clases (curso + sección) donde el docente tiene hoy una asignación activa: el dueño de un
// plan es el docente vigente de su clase, no el que lo creó.
export const listClasesVigentes = (docenteId, db = prisma) =>
  db.cursoSeccionDocente.findMany({
    where: { docenteId, activo: true, curso: { activo: true } },
    select: { cursoId: true, seccionId: true },
  });

export const contarAsignacionesVigentes = ({ docenteId, cursoId, seccionId }, db = prisma) =>
  db.cursoSeccionDocente.count({
    where: { docenteId, cursoId, seccionId, activo: true, curso: { activo: true } },
  });

// Serializa los cambios de un plan con las altas de actividades y con el cambio de fechas
// del bimestre, que bloquea los mismos planes.
export const bloquearPlan = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "PlanAcademico" WHERE "id" = ${id} FOR UPDATE`;

export const createPlan = ({ competenciaIds, ...data }, db) =>
  db.planAcademico.create({
    data: { ...data, competencias: { connect: competenciaIds.map((id) => ({ id })) } },
    select: plan,
  });

export const updatePlan = (id, { competenciaIds, ...data }, db) =>
  db.planAcademico.update({
    where: { id },
    data: {
      ...data,
      ...(competenciaIds && {
        competencias: { set: competenciaIds.map((competenciaId) => ({ id: competenciaId })) },
      }),
    },
    select: plan,
  });

export const desactivarEvidenciasDelPlan = ({ planId, actorId }, db) =>
  db.evidenciaPedagogica.updateMany({
    where: { planId, activo: true },
    data: { activo: false, modificadoPorId: actorId },
  });
