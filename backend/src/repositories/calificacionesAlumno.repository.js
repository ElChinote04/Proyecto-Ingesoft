import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

const asignacionVigente = (docenteId) => ({ docenteId, activo: true, curso: { activo: true } });

export const listSalones = (docenteId, db = prisma) =>
  db.seccion.findMany({
    where: {
      anioAcademico: { activo: true },
      asignaciones: { some: asignacionVigente(docenteId) },
    },
    select: {
      id: true,
      nombre: true,
      anioAcademicoId: true,
      grado: { select: { nombre: true } },
      anioAcademico: { select: { codigo: true } },
    },
    orderBy: [{ grado: { nombre: 'asc' } }, { nombre: 'asc' }],
  });

// Solo los campos que muestra la lista: nunca el documento de identidad ni las notas.
export const listAlumnos = (seccionId, db = prisma) =>
  db.matricula.findMany({
    where: { seccionId, activo: true },
    select: {
      id: true,
      estudiante: {
        select: {
          codigoEstudiante: true,
          persona: { select: { nombres: true, apellidos: true } },
        },
      },
    },
    orderBy: [
      { estudiante: { persona: { apellidos: 'asc' } } },
      { estudiante: { persona: { nombres: 'asc' } } },
    ],
  });

export const findMatricula = (id, db = prisma) =>
  db.matricula.findUnique({
    where: { id },
    select: {
      id: true,
      activo: true,
      seccionId: true,
      anioAcademicoId: true,
      seccion: { select: { gradoId: true } },
    },
  });

export const findBimestre = (id, db = prisma) =>
  db.bimestreAcademico.findUnique({
    where: { id },
    select: { id: true, nombre: true, activo: true, anioAcademicoId: true },
  });

export const listAsignaciones = (seccionId, docenteId, db = prisma) =>
  db.cursoSeccionDocente.findMany({
    where: { seccionId, ...asignacionVigente(docenteId) },
    select: {
      id: true,
      curso: {
        select: {
          id: true,
          nombre: true,
          competencias: {
            where: { activo: true },
            select: { id: true, codigo: true, nombre: true },
            orderBy: { codigo: 'asc' },
          },
        },
      },
    },
    orderBy: { curso: { nombre: 'asc' } },
  });

export function listReglasVigentes({ gradoId, cursoIds }, db = prisma) {
  const ahora = new Date();
  return db.reglaConsolidacion.findMany({
    where: {
      activo: true,
      gradoId,
      cursoId: { in: cursoIds },
      vigenteDesde: { lte: ahora },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
    },
    select: { id: true, cursoId: true, nombre: true },
    orderBy: { version: 'desc' },
  });
}

export const listNiveles = ({ matriculaId, bimestreId, asignacionIds }, db = prisma) =>
  db.calificacionCompetencia.findMany({
    where: {
      activo: true,
      calificacion: { activo: true, matriculaId, bimestreId, asignacionId: { in: asignacionIds } },
    },
    select: { competenciaId: true, nivelLogro: true },
  });

export async function guardarNivel(datos, db) {
  const { matriculaId, bimestreId, asignacionId, reglaId, competenciaId, nivelLogro, actorId } =
    datos;
  const calificacion = await db.calificacion.upsert({
    where: { matriculaId_bimestreId_asignacionId: { matriculaId, bimestreId, asignacionId } },
    create: {
      matriculaId,
      bimestreId,
      asignacionId,
      reglaId,
      creadoPorId: actorId,
      modificadoPorId: actorId,
    },
    update: { reglaId, activo: true, modificadoPorId: actorId },
    select: { id: true },
  });
  const clave = {
    calificacionId_competenciaId: { calificacionId: calificacion.id, competenciaId },
  };
  const anterior = await db.calificacionCompetencia.findUnique({
    where: clave,
    select: { nivelLogro: true, activo: true },
  });
  await db.calificacionCompetencia.upsert({
    where: clave,
    create: {
      calificacionId: calificacion.id,
      competenciaId,
      nivelLogro,
      creadoPorId: actorId,
      modificadoPorId: actorId,
    },
    update: { nivelLogro, activo: true, modificadoPorId: actorId },
  });
  return {
    calificacionId: calificacion.id,
    nivelAnterior: anterior?.activo ? anterior.nivelLogro : null,
  };
}
