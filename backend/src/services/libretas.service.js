import * as repository from '../repositories/libretas.repository.js';
import { filtrosEstudiantesAutorizados } from './portal.service.js';
import { armarLibreta } from '../domain/libreta.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

function exigirFiltros(user) {
  const filtros = filtrosEstudiantesAutorizados(user);
  if (!filtros.length)
    throw new AppError(
      403,
      'FORBIDDEN',
      'La libreta solo la consultan el propio alumno y su apoderado.',
    );
  return filtros;
}

const datosInstitucion = () => ({
  nombre: env.INSTITUCION_NOMBRE ?? null,
  dre: env.INSTITUCION_DRE ?? null,
  ugel: env.INSTITUCION_UGEL ?? null,
  codigoModular: env.INSTITUCION_CODIGO_MODULAR ?? null,
  nivel: env.INSTITUCION_NIVEL ?? null,
});

export async function listarLibretas(user) {
  const estudiantes = await repository.listEstudiantes({ OR: exigirFiltros(user) });
  return estudiantes.map(({ id, persona, matriculas }) => ({
    id,
    nombre: `${persona.nombres} ${persona.apellidos}`,
    matriculas: matriculas.map(({ id: matriculaId, activo, anioAcademico, seccion }) => ({
      id: matriculaId,
      anioAcademico: anioAcademico.codigo,
      seccion: `${seccion.grado.nombre} ${seccion.nombre}`,
      activa: activo,
    })),
  }));
}

export async function obtenerLibreta(matriculaId, user) {
  const filtros = exigirFiltros(user);
  const matricula = await repository.findMatricula(matriculaId);
  if (!matricula) throw new AppError(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe.');
  const autorizado = await repository.countEstudiantes({
    id: matricula.estudianteId,
    OR: filtros,
  });
  if (!autorizado)
    throw new AppError(
      403,
      'STUDENT_FORBIDDEN',
      'Solo puedes consultar tus datos o los de tus hijos vinculados.',
    );

  const { anioAcademicoId, seccionId, seccion, estudiante, anioAcademico } = matricula;
  const bimestres = await repository.listPeriodos({ anioAcademicoId, seccionId });
  const periodos = bimestres.map(({ publicaciones, ...bimestre }) => ({
    ...bimestre,
    publicado: publicaciones.length > 0,
  }));
  const [cursos, notas] = await Promise.all([
    repository.listCursosDeSeccion(seccionId),
    repository.listNotasPublicadas({
      matriculaId,
      bimestreIds: periodos.filter(({ publicado }) => publicado).map(({ id }) => id),
    }),
  ]);
  const { persona, codigoEstudiante } = estudiante;
  return {
    institucion: datosInstitucion(),
    estudiante: {
      apellidosNombres: `${persona.apellidos}, ${persona.nombres}`,
      codigo: codigoEstudiante,
      dni: persona.numeroDocumento,
    },
    matricula: {
      id: matricula.id,
      anioAcademico: anioAcademico.codigo,
      grado: seccion.grado.nombre,
      seccion: seccion.nombre,
      activa: matricula.activo,
    },
    periodos,
    ...armarLibreta({ cursos, notas, periodos }),
  };
}
