import * as repository from '../repositories/calificacionesAlumno.repository.js';
import * as evaluacionesRepository from '../repositories/evaluaciones.repository.js';
import * as logrosRepository from '../repositories/logros.repository.js';
import { estaPublicada } from './publicacionSeccion.service.js';
import { presentarResultado } from './evaluaciones.service.js';
import { consolidar } from '../domain/consolidacion.js';
import { aTexto } from '../domain/semanasBimestre.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

function requireDocente(actor) {
  if (!actor.docenteId)
    fail(403, 'NO_TEACHER_PROFILE', 'Tu cuenta no tiene un perfil docente asociado.');
}

export function agregarLogroConsolidado(calificaciones) {
  const grupos = new Map();
  for (const calificacion of calificaciones) {
    // Una competencia sin notas que cuenten todavía no tiene letra que consolidar.
    for (const item of (calificacion.competencias ?? []).filter(({ nivelLogro }) => nivelLogro)) {
      const clave = `${calificacion.matriculaId}:${calificacion.asignacionId}:${item.competenciaId}`;
      const grupo = grupos.get(clave) ?? [];
      grupo.push({ nivelLogro: item.nivelLogro, modificadoEn: calificacion.modificadoEn });
      grupos.set(clave, grupo);
    }
  }
  return calificaciones.map((calificacion) => ({
    ...calificacion,
    competencias: calificacion.competencias?.map((item) => {
      const clave = `${calificacion.matriculaId}:${calificacion.asignacionId}:${item.competenciaId}`;
      return {
        ...item,
        logroConsolidado: consolidar(grupos.get(clave) ?? [], calificacion.regla?.metodo),
      };
    }),
  }));
}

export async function listarSalones(actor) {
  requireDocente(actor);
  const salones = await repository.listSalones(actor.docenteId);
  return salones.map((salon) => ({
    id: salon.id,
    nombre: `${salon.grado.nombre} ${salon.nombre}`,
    anioAcademicoId: salon.anioAcademicoId,
    anioAcademico: salon.anioAcademico.codigo,
  }));
}

export async function listarAlumnos(seccionId, actor) {
  requireDocente(actor);
  const asignaciones = await repository.listAsignaciones(seccionId, actor.docenteId);
  if (!asignaciones.length) fail(403, 'FORBIDDEN', 'Solo puedes consultar tus propios salones.');
  const matriculas = await repository.listAlumnos(seccionId);
  return matriculas.map(({ id, estudiante }) => ({
    matriculaId: id,
    codigo: estudiante.codigoEstudiante,
    nombre: `${estudiante.persona.nombres} ${estudiante.persona.apellidos}`,
  }));
}

// Resuelve qué cursos puede calificar el docente a este alumno en el bimestre. La regla de
// consolidación ya no se exige aquí: solo hace falta para publicar.
async function resolverCursos(matriculaId, bimestreId, actor) {
  requireDocente(actor);
  const [matricula, bimestre] = await Promise.all([
    repository.findMatricula(matriculaId),
    repository.findBimestre(bimestreId),
  ]);
  if (!matricula?.activo)
    fail(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe o está inactiva.');
  const asignaciones = await repository.listAsignaciones(matricula.seccionId, actor.docenteId);
  if (!asignaciones.length)
    fail(403, 'FORBIDDEN', 'Solo puedes calificar a alumnos de tus salones.');
  if (!bimestre?.activo || bimestre.anioAcademicoId !== matricula.anioAcademicoId)
    fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año académico del salón.');
  // Reasignar un curso deja dos asignaciones del mismo curso: se muestra una sola vez.
  const cursos = new Map(asignaciones.map(({ curso }) => [curso.id, curso]));
  return { bimestre, seccionId: matricula.seccionId, cursos: [...cursos.values()] };
}

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/**
 * Lo que ve el docente en el modal de un alumno: por competencia, sus evaluaciones con el
 * resultado del alumno, cuántas le faltan y la letra calculada con su promedio.
 */
export async function obtenerCalificaciones(matriculaId, { bimestreId }, actor) {
  const { bimestre, seccionId, cursos } = await resolverCursos(matriculaId, bimestreId, actor);
  const cursoIds = cursos.map(({ id }) => id);
  const [evaluaciones, logros, publicado] = await Promise.all([
    evaluacionesRepository.listEvaluacionesDeAlumno({
      seccionId,
      bimestreId,
      cursoIds,
      matriculaId,
    }),
    logrosRepository.listLogros({ matriculaId, bimestreId, cursoIds }),
    estaPublicada({ bimestreId, seccionId }),
  ]);
  // Vienen de la más antigua a la más reciente: si una reasignación dejó dos, gana la última.
  const logroDe = new Map(logros.map((logro) => [logro.competenciaId, logro]));
  return {
    bimestre: { id: bimestre.id, nombre: bimestre.nombre, publicado },
    cursos: cursos.map((curso) => ({
      id: curso.id,
      nombre: curso.nombre,
      competencias: curso.competencias.map((competencia) => {
        const propias = evaluaciones.filter((item) => item.competenciaId === competencia.id);
        const logro = logroDe.get(competencia.id);
        return {
          ...competencia,
          promedio: numero(logro?.promedio),
          nivelLogro: logro?.nivelLogro ?? null,
          pendientes: propias.filter(({ resultados }) => !resultados.length).length,
          evaluaciones: propias.map(({ resultados, fecha, ...evaluacion }) => ({
            id: evaluacion.id,
            titulo: evaluacion.titulo,
            descripcion: evaluacion.descripcion,
            fecha: aTexto(fecha),
            peso: evaluacion.peso,
            resultado: presentarResultado(resultados[0] ?? null),
          })),
        };
      }),
    })),
  };
}
