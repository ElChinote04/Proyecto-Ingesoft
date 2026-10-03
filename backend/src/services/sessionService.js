import * as repository from '../repositories/sessionRepository.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
function requireTeacher(user) {
  if (!user.docenteId)
    throw new AppError(403, 'NO_TEACHER_PROFILE', 'Tu cuenta no tiene un perfil docente asociado.');
}
function checkSession(session, user) {
  requireTeacher(user);
  if (!session || !session.activo)
    throw new AppError(
      404,
      'SESSION_NOT_FOUND',
      'La sesión de clase no existe o no está disponible.',
    );
  if (session.bloque.asignacion.docenteId !== user.docenteId)
    throw new AppError(
      403,
      'SESSION_FORBIDDEN',
      'Solo puedes acceder a tus propias sesiones de clase.',
    );
}
function dto(session) {
  const { curso, seccion, docente } = session.bloque.asignacion;
  return {
    id: session.id,
    curso: { id: curso.id, nombre: curso.nombre },
    seccion: { id: seccion.id, nombre: `${seccion.grado.nombre} ${seccion.nombre}` },
    docente: { id: docente.id, nombre: `${docente.persona.nombres} ${docente.persona.apellidos}` },
    anioAcademico: seccion.anioAcademico.codigo,
    fecha: session.fecha.toISOString().slice(0, 10),
    horaInicio: session.horaInicio,
    horaFin: session.horaFin,
    aula: session.bloque.aula.codigo,
  };
}
function studentDto(matricula) {
  const asistencia = matricula.asistencias[0];
  return {
    alumnoId: matricula.estudianteId,
    nombre: `${matricula.estudiante.persona.nombres} ${matricula.estudiante.persona.apellidos}`,
    codigo: matricula.estudiante.codigoEstudiante,
    estado: asistencia?.condicion ?? null,
    observacion: asistencia?.observacion ?? '',
  };
}
export async function list(user, requestId) {
  requireTeacher(user);
  const sessions = await repository.listSessions(user.docenteId);
  logger.info('Consulta de sesiones', { module: 'asistencia', userId: user.id, requestId });
  return sessions.map(dto);
}
export async function detail(id, user) {
  const session = await repository.findSession(id);
  checkSession(session, user);
  return dto(session);
}
export async function students(id, user) {
  const session = await repository.findSession(id);
  checkSession(session, user);
  return {
    sesion: dto(session),
    alumnos: (await repository.findStudents(session.bloque.asignacion.seccionId, id)).map(
      studentDto,
    ),
  };
}
export async function save(id, input, user, requestId) {
  const result = await repository.inTransaction(id, async (db) => {
    const session = await repository.findSession(id, db);
    checkSession(session, user);
    const students = await repository.findStudents(session.bloque.asignacion.seccionId, id, db);
    const ids = input.asistencias.map((a) => a.alumnoId);
    if (new Set(ids).size !== ids.length)
      throw new AppError(409, 'DUPLICATE_STUDENT', 'Cada alumno debe aparecer una sola vez.');
    const byId = new Map(students.map((m) => [m.estudianteId, m]));
    if (ids.some((studentId) => !byId.has(studentId)))
      throw new AppError(
        400,
        'STUDENT_NOT_ENROLLED',
        'Uno de los alumnos no tiene matrícula activa en esta sección.',
      );
    if (ids.length !== students.length)
      throw new AppError(
        400,
        'INCOMPLETE_ATTENDANCE',
        'Registra un estado para cada alumno matriculado.',
      );
    const records = input.asistencias.map((a) => ({
      ...a,
      matriculaId: byId.get(a.alumnoId).id,
      anterior: byId.get(a.alumnoId).asistencias[0]?.condicion ?? null,
    }));
    const saved = await repository.saveAttendance(db, id, records, user.id);
    const resumen = { PRESENTE: 0, TARDANZA: 0, AUSENTE: 0 };
    records.forEach((r) => resumen[r.estado]++);
    return {
      ...saved,
      sesion: dto(session),
      total: records.length,
      resumen,
      registradoPor: user.nombre,
    };
  });
  logger.info('Asistencia guardada', {
    module: 'asistencia',
    userId: user.id,
    requestId,
    sesionId: id,
    total: result.total,
  });
  return result;
}
