import * as repository from '../repositories/calificacionRepository.js';
import { agregarLogroConsolidado } from './calificacionesAlumno.service.js';
import { exigirMotivoSiPublicada } from './publicacionSeccion.service.js';
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
