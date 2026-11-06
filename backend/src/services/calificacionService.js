import * as repository from '../repositories/calificacionRepository.js';
import * as detalleRepository from '../repositories/calificacionCompetencia.js';
import { agregarLogroConsolidado } from './calificacionesAlumno.service.js';
import { exigirMotivoSiPublicada, exigirSeccionSinPublicar } from './publicacionSeccion.service.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

function requireRole(user, role) {
  if (!user?.roles?.includes(role))
    fail(403, 'FORBIDDEN', `Solo un ${role.toLowerCase()} puede realizar esta operación.`);
}

function snapshot(calificacion) {
  return {
    id: calificacion.id,
    matriculaId: calificacion.matriculaId,
    bimestreId: calificacion.bimestreId,
    asignacionId: calificacion.asignacionId,
    reglaId: calificacion.reglaId,
    activo: calificacion.activo,
    competencias: calificacion.competencias?.map((item) => ({
      competenciaId: item.competenciaId,
      nivelLogro: item.nivelLogro,
      conclusionDescriptiva: item.conclusionDescriptiva,
      activo: item.activo,
    })),
  };
}

async function validateContext(input, db) {
  const [matricula, bimestre, asignacion, regla, competencias] = await Promise.all([
    db.matricula.findUnique({ where: { id: input.matriculaId }, include: { seccion: true } }),
    db.bimestreAcademico.findUnique({ where: { id: input.bimestreId } }),
    db.cursoSeccionDocente.findUnique({
      where: { id: input.asignacionId },
      include: { seccion: true },
    }),
    db.reglaConsolidacion.findUnique({ where: { id: input.reglaId } }),
    db.competencia.findMany({
      where: { id: { in: input.competencias.map((item) => item.competenciaId) } },
    }),
  ]);
  if (!matricula?.activo)
    fail(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe o está inactiva.');
  if (!bimestre?.activo) fail(404, 'TERM_NOT_FOUND', 'El bimestre no existe o está inactivo.');
  if (!asignacion)
    fail(404, 'ASSIGNMENT_NOT_FOUND', 'La asignación del curso no existe o está inactiva.');
  if (!regla?.activo)
    fail(404, 'RULE_NOT_FOUND', 'La regla de consolidación no existe o está inactiva.');
  if (
    matricula.seccionId !== asignacion.seccionId ||
    matricula.anioAcademicoId !== asignacion.seccion.anioAcademicoId
  )
    fail(400, 'INVALID_ACADEMIC_CONTEXT', 'La matrícula no corresponde a la asignación del curso.');
  if (bimestre.anioAcademicoId !== asignacion.seccion.anioAcademicoId)
    fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año académico del curso.');
  if (regla.cursoId !== asignacion.cursoId || regla.gradoId !== matricula.seccion.gradoId)
    fail(400, 'INVALID_RULE_CONTEXT', 'La regla no corresponde al curso evaluado.');
  if (
    competencias.length !== input.competencias.length ||
    competencias.some((item) => !item.activo || item.cursoId !== asignacion.cursoId)
  )
    fail(
      400,
      'INVALID_COMPETENCY_CONTEXT',
      'Todas las competencias deben pertenecer al curso y estar activas.',
    );
  return { matricula, bimestre, asignacion, regla, competencias };
}

export async function listarCalificaciones(user, estudianteId) {
  if (!user?.roles?.length)
    fail(403, 'FORBIDDEN', 'No tienes un rol habilitado para consultar calificaciones.');
  const requestedStudentId = estudianteId ? Number(estudianteId) : null;
  if (user.roles.includes('ADMINISTRADOR'))
    return agregarLogroConsolidado(
      await repository.listCalificaciones({
        activo: true,
        ...(requestedStudentId ? { matricula: { estudianteId: requestedStudentId } } : {}),
      }),
    );
  if (user.roles.includes('DOCENTE'))
    return agregarLogroConsolidado(
      await repository.listCalificaciones({
        activo: true,
        ...(user.docenteId ? { asignacion: { docenteId: user.docenteId } } : {}),
      }),
    );
  fail(403, 'FORBIDDEN', 'Las notas publicadas se consultan en la libreta.');
}

export async function obtenerCalificacion(id, user) {
  const calificacion = await repository.findCalificacion(id);
  if (!calificacion?.activo)
    fail(404, 'GRADE_NOT_FOUND', 'La calificación no existe o está inactiva.');
  const permitidas = await listarCalificaciones(user, calificacion.matricula.estudianteId);
  if (!permitidas.some((item) => item.id === id))
    fail(403, 'FORBIDDEN', 'No tienes permiso para consultar esta calificación.');
  return calificacion;
}

export async function crearCalificacion(input, actor, requestId) {
  requireRole(actor, 'DOCENTE');
  return repository.transaction(async (db) => {
    const { matricula } = await validateContext(input, db);
    await exigirSeccionSinPublicar(
      { bimestreId: input.bimestreId, seccionId: matricula.seccionId },
      db,
    );
    const existente = await repository.findCalificacionByKey(input, db);
    if (existente?.activo)
      fail(409, 'GRADE_EXISTS', 'Ya existe una calificación para ese alumno, curso y bimestre.');
    const calificacion = await repository.createCalificacion(
      {
        matriculaId: input.matriculaId,
        bimestreId: input.bimestreId,
        asignacionId: input.asignacionId,
        reglaId: input.reglaId,
        creadoPorId: actor.id,
        modificadoPorId: actor.id,
      },
      db,
    );
    for (const item of input.competencias)
      await detalleRepository.createCalificacionCompetencia(
        {
          ...item,
          calificacionId: calificacion.id,
          creadoPorId: actor.id,
          modificadoPorId: actor.id,
        },
        db,
      );
    const result = await repository.findCalificacion(calificacion.id, db);
    await repository.auditCalificacion(db, {
      usuarioId: actor.id,
      tipoEvento: 'CALIFICACION_CREADA',
      calificacionId: result.id,
      valorNuevo: snapshot(result),
      requestId,
    });
    return result;
  });
}

export async function modificarCalificacion(id, input, actor, requestId) {
  requireRole(actor, 'ADMINISTRADOR');
  return repository.transaction(async (db) => {
    const actual = await repository.findCalificacion(id, db);
    if (!actual?.activo) fail(404, 'GRADE_NOT_FOUND', 'La calificación no existe o está inactiva.');
    await exigirMotivoSiPublicada(
      {
        bimestreId: actual.bimestreId,
        seccionId: actual.matricula.seccionId,
        motivo: input.motivo,
      },
      db,
    );
    if (input.competencias)
      await validateContext({ ...actual, competencias: input.competencias }, db);
    const calificacion = await repository.updateCalificacion(id, { modificadoPorId: actor.id }, db);
    if (input.competencias) {
      for (const item of input.competencias) {
        const detalle = await detalleRepository.findCalificacionCompetenciaByKey(
          { calificacionId: id, competenciaId: item.competenciaId },
          db,
        );
        if (detalle)
          await detalleRepository.updateCalificacionCompetencia(
            detalle.id,
            {
              nivelLogro: item.nivelLogro,
              conclusionDescriptiva: item.conclusionDescriptiva,
              activo: true,
              modificadoPorId: actor.id,
            },
            db,
          );
        else
          await detalleRepository.createCalificacionCompetencia(
            { ...item, calificacionId: id, creadoPorId: actor.id, modificadoPorId: actor.id },
            db,
          );
      }
    }
    const result = await repository.findCalificacion(id, db);
    await repository.auditCalificacion(db, {
      usuarioId: actor.id,
      tipoEvento: 'CALIFICACION_MODIFICADA',
      calificacionId: id,
      valorAnterior: snapshot(actual),
      valorNuevo: snapshot(result),
      motivo: input.motivo,
      requestId,
    });
    return result;
  });
}

export async function desactivarCalificacion(id, motivo, actor, requestId) {
  requireRole(actor, 'ADMINISTRADOR');
  return repository.transaction(async (db) => {
    const actual = await repository.findCalificacion(id, db);
    if (!actual?.activo)
      fail(404, 'GRADE_NOT_FOUND', 'La calificación no existe o ya está inactiva.');
    await exigirMotivoSiPublicada(
      { bimestreId: actual.bimestreId, seccionId: actual.matricula.seccionId, motivo },
      db,
    );
    const result = await repository.deleteCalificacion(id, db);
    await db.calificacionCompetencia.updateMany({
      where: { calificacionId: id, activo: true },
      data: { activo: false, modificadoPorId: actor.id },
    });
    await repository.auditCalificacion(db, {
      usuarioId: actor.id,
      tipoEvento: 'CALIFICACION_DESACTIVADA',
      calificacionId: id,
      valorAnterior: snapshot(actual),
      valorNuevo: snapshot(result),
      motivo,
      requestId,
    });
    return result;
  });
}
