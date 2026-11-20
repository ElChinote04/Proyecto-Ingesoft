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
