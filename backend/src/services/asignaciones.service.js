import * as repository from '../repositories/asignaciones.repository.js';
import * as libretas from '../repositories/libretas.repository.js';
import { filtrosEstudiantesAutorizados } from './portal.service.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const presentar = ({ id, curso, seccion }) => ({
  id,
  curso,
  seccion: { id: seccion.id, nombre: seccion.nombre, grado: seccion.grado.nombre },
});

/** Las clases (curso + sección) que puede ver la sesión, con salida mínima. */
export async function listarAsignaciones(filtros, actor) {
  if (actor.roles.includes('ADMINISTRADOR'))
    return (
      await repository.listAsignacionesVigentes({
        ...(filtros.cursoId && { cursoId: filtros.cursoId }),
        ...(filtros.seccionId && { seccionId: filtros.seccionId }),
      })
    ).map(presentar);
  if (actor.roles.includes('DOCENTE')) {
    if (!actor.docenteId)
      fail(403, 'NO_TEACHER_PROFILE', 'Tu cuenta no tiene un perfil docente asociado.');
    return (await repository.listAsignacionesVigentes({ docenteId: actor.docenteId })).map(
      presentar,
    );
  }
  const permisos = filtrosEstudiantesAutorizados(actor);
  if (!permisos.length) fail(403, 'FORBIDDEN', 'No tienes clases para consultar.');
  if (!filtros.matriculaId) fail(400, 'VALIDATION_ERROR', 'Indica la matrícula.');
  const matricula = await libretas.findMatricula(filtros.matriculaId);
  if (!matricula) fail(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe.');
  const autorizado = await libretas.countEstudiantes({ id: matricula.estudianteId, OR: permisos });
  if (!autorizado)
    fail(
      403,
      'STUDENT_FORBIDDEN',
      'Solo puedes consultar tus datos o los de tus hijos vinculados.',
    );
  // Un curso con dos docentes aparece una sola vez: a la familia le importa el curso.
  const porCurso = new Map();
  for (const item of await repository.listAsignacionesDeSeccion(matricula.seccionId))
    if (!porCurso.has(item.curso.id)) porCurso.set(item.curso.id, presentar(item));
  return [...porCurso.values()];
}
