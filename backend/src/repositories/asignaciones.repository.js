import { prisma } from '../config/database.js';

const asignacion = {
  id: true,
  curso: { select: { id: true, codigo: true, nombre: true } },
  seccion: { select: { id: true, nombre: true, grado: { select: { nombre: true } } } },
};

// Solo clases del año activo y de cursos activos: las que hoy se pueden planificar.
export const listAsignacionesVigentes = (where, db = prisma) =>
  db.cursoSeccionDocente.findMany({
    where: {
      activo: true,
      curso: { activo: true },
      seccion: { anioAcademico: { activo: true } },
      ...where,
    },
    select: asignacion,
    orderBy: [
      { curso: { nombre: 'asc' } },
      { seccion: { grado: { nombre: 'asc' } } },
      { seccion: { nombre: 'asc' } },
    ],
  });

export const listAsignacionesDeSeccion = (seccionId, db = prisma) =>
  db.cursoSeccionDocente.findMany({
    where: { seccionId, activo: true, curso: { activo: true } },
    select: asignacion,
    orderBy: { curso: { nombre: 'asc' } },
  });
