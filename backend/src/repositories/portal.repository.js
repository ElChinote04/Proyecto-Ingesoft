import { prisma } from '../config/database.js';
import { blockInclude } from './adminRepository.js';

export const obtenerAnioActivo = (db = prisma) =>
  db.anioAcademico.findFirst({ where: { activo: true } });
export const obtenerEstudiantes = (where) =>
  prisma.estudiante.findMany({
    where: { persona: { activo: true }, ...where },
    include: {
      persona: true,
      matriculas: {
        where: { activo: true, anioAcademico: { activo: true } },
        include: { seccion: { include: { grado: true, anioAcademico: true } } },
      },
    },
    orderBy: { id: 'asc' },
  });
export const obtenerBloques = (asignacion) =>
  prisma.cursoSeccionDocenteAula.findMany({
    where: { activo: true, asignacion },
    include: blockInclude,
    orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }, { id: 'asc' }],
  });
export async function obtenerAsistencias(estudianteId, pagina, limite) {
  const where = { matricula: { estudianteId } };
  const [total, registros] = await prisma.$transaction([
    prisma.asistenciaEstudiante.count({ where }),
    prisma.asistenciaEstudiante.findMany({
      where,
      skip: (pagina - 1) * limite,
      take: limite,
      include: { sesion: { include: { bloque: { include: blockInclude } } } },
      orderBy: [{ sesion: { fecha: 'desc' } }, { id: 'desc' }],
    }),
  ]);
  return { total, registros };
}
