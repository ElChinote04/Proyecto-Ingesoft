import { prisma } from '../config/database.js';

export const listEstudiantes = (where, db = prisma) =>
  db.estudiante.findMany({
    where: { persona: { activo: true }, ...where },
    select: {
      id: true,
      persona: { select: { nombres: true, apellidos: true } },
      matriculas: {
        select: {
          id: true,
          activo: true,
          anioAcademico: { select: { codigo: true } },
          seccion: { select: { nombre: true, grado: { select: { nombre: true } } } },
        },
        orderBy: { anioAcademico: { codigo: 'desc' } },
      },
    },
    orderBy: { id: 'asc' },
  });

export const findMatricula = (id, db = prisma) =>
  db.matricula.findUnique({
    where: { id },
    select: {
      id: true,
      activo: true,
      estudianteId: true,
      seccionId: true,
      anioAcademicoId: true,
      anioAcademico: { select: { codigo: true } },
      seccion: { select: { nombre: true, grado: { select: { nombre: true } } } },
      estudiante: {
        select: {
          codigoEstudiante: true,
          persona: { select: { nombres: true, apellidos: true, numeroDocumento: true } },
        },
      },
    },
  });

export const countEstudiantes = (where, db = prisma) =>
  db.estudiante.count({ where: { persona: { activo: true }, ...where } });

export const listPeriodos = ({ anioAcademicoId, seccionId }, db = prisma) =>
  db.bimestreAcademico.findMany({
    where: { anioAcademicoId, activo: true },
    select: {
      id: true,
      numero: true,
      nombre: true,
      publicaciones: { where: { seccionId }, select: { id: true } },
    },
    orderBy: { numero: 'asc' },
  });

export const listCursosDeSeccion = (seccionId, db = prisma) =>
  db.curso.findMany({
    where: { activo: true, asignaciones: { some: { seccionId, activo: true } } },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      competencias: {
        where: { activo: true },
        select: { id: true, codigo: true, nombre: true },
      },
    },
  });

// El filtro por bimestre va en la consulta: una nota sin publicar no llega ni a la memoria del caso
// de uso. El orden deja la nota más reciente al final si una reasignación dejó dos en un bimestre.
export const listNotasPublicadas = ({ matriculaId, bimestreIds }, db = prisma) =>
  db.calificacionCompetencia.findMany({
    where: {
      activo: true,
      calificacion: { activo: true, matriculaId, bimestreId: { in: bimestreIds } },
    },
    select: {
      nivelLogro: true,
      calificacion: { select: { bimestreId: true, regla: { select: { metodo: true } } } },
      competencia: {
        select: {
          id: true,
          codigo: true,
          nombre: true,
          curso: { select: { id: true, codigo: true, nombre: true } },
        },
      },
    },
    orderBy: { modificadoEn: 'asc' },
  });
