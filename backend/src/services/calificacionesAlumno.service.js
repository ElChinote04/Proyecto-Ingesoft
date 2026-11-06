import * as repository from '../repositories/calificacionesAlumno.repository.js';
import { auditCalificacion } from '../repositories/calificacionRepository.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

function requireDocente(actor) {
  if (!actor.docenteId)
    fail(403, 'NO_TEACHER_PROFILE', 'Tu cuenta no tiene un perfil docente asociado.');
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

// Resuelve qué cursos puede calificar el docente a este alumno en el bimestre.
async function resolverCursos(matriculaId, bimestreId, actor, db) {
  requireDocente(actor);
  const [matricula, bimestre] = await Promise.all([
    repository.findMatricula(matriculaId, db),
    repository.findBimestre(bimestreId, db),
  ]);
  if (!matricula?.activo)
    fail(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe o está inactiva.');
  const asignaciones = await repository.listAsignaciones(matricula.seccionId, actor.docenteId, db);
  if (!asignaciones.length)
    fail(403, 'FORBIDDEN', 'Solo puedes calificar a alumnos de tus salones.');
  if (!bimestre?.activo || bimestre.anioAcademicoId !== matricula.anioAcademicoId)
    fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año académico del salón.');
  const reglas = await repository.listReglasVigentes(
    {
      gradoId: matricula.seccion.gradoId,
      cursoIds: asignaciones.map(({ curso }) => curso.id),
    },
    db,
  );
  // Vienen ordenadas por versión descendente: la primera de cada curso es la vigente.
  const reglaDe = (cursoId) => reglas.find((regla) => regla.cursoId === cursoId) ?? null;
  return {
    bimestre,
    cursos: asignaciones.map(({ id, curso }) => ({
      asignacionId: id,
      curso,
      regla: reglaDe(curso.id),
    })),
  };
}

export async function obtenerCalificaciones(matriculaId, { bimestreId }, actor) {
  const { bimestre, cursos } = await resolverCursos(matriculaId, bimestreId, actor);
  const niveles = await repository.listNiveles({
    matriculaId,
    bimestreId,
    asignacionIds: cursos.map(({ asignacionId }) => asignacionId),
  });
  const nivelDe = new Map(niveles.map((item) => [item.competenciaId, item.nivelLogro]));
  return {
    bimestre: { id: bimestre.id, nombre: bimestre.nombre },
    cursos: cursos.map(({ curso, regla }) => ({
      id: curso.id,
      nombre: curso.nombre,
      regla: regla && { id: regla.id, nombre: regla.nombre },
      competencias: curso.competencias.map((competencia) => ({
        ...competencia,
        nivelLogro: nivelDe.get(competencia.id) ?? null,
      })),
    })),
  };
}

export async function guardarCalificaciones(matriculaId, input, actor, requestId) {
  return repository.transaction(async (db) => {
    const { cursos } = await resolverCursos(matriculaId, input.bimestreId, actor, db);
    const destinos = new Map(
      cursos.flatMap((destino) =>
        destino.curso.competencias.map((competencia) => [competencia.id, destino]),
      ),
    );
    const resultados = [];
    for (const { competenciaId, nivelLogro } of input.calificaciones) {
      const destino = destinos.get(competenciaId);
      if (!destino)
        fail(
          400,
          'INVALID_COMPETENCY_CONTEXT',
          'Solo puedes calificar competencias activas de los cursos que dictas en este salón.',
        );
      if (!destino.regla)
        fail(
          404,
          'RULE_NOT_FOUND',
          `El curso ${destino.curso.nombre} no tiene una regla de consolidación vigente.`,
        );
      const { calificacionId, nivelAnterior } = await repository.guardarNivel(
        {
          matriculaId,
          bimestreId: input.bimestreId,
          asignacionId: destino.asignacionId,
          reglaId: destino.regla.id,
          competenciaId,
          nivelLogro,
          actorId: actor.id,
        },
        db,
      );
      await auditCalificacion(db, {
        usuarioId: actor.id,
        tipoEvento: 'CALIFICACION_GUARDADA',
        calificacionId,
        valorAnterior: nivelAnterior && { competenciaId, nivelLogro: nivelAnterior },
        valorNuevo: { competenciaId, nivelLogro },
        requestId,
      });
      resultados.push({ calificacionId, competenciaId, nivelLogro });
    }
    return { total: resultados.length, resultados };
  });
}
