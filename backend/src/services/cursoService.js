import * as repository from '../repositories/CursoRepository.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

function requireAdmin(user) {
  if (!user?.roles?.includes('ADMINISTRADOR'))
    fail(403, 'FORBIDDEN', 'Solo un administrador puede gestionar cursos.');
}

function visibleWhere(user) {
  if (user?.roles?.includes('ADMINISTRADOR')) return { activo: true };
  if (user?.roles?.includes('DOCENTE') && user.docenteId)
    return { activo: true, asignaciones: { some: { activo: true, docenteId: user.docenteId } } };
  if (user?.roles?.includes('ALUMNO') && user.estudianteId)
    return {
      activo: true,
      asignaciones: {
        some: {
          activo: true,
          seccion: { matriculas: { some: { activo: true, estudianteId: user.estudianteId } } },
        },
      },
    };
  if (user?.roles?.includes('APODERADO') && user.apoderadoId)
    return {
      activo: true,
      asignaciones: {
        some: {
          activo: true,
          seccion: {
            matriculas: {
              some: {
                activo: true,
                estudiante: {
                  apoderados: { some: { activo: true, apoderadoId: user.apoderadoId } },
                },
              },
            },
          },
        },
      },
    };
  return null;
}

function auditData(curso) {
  return { id: curso.id, codigo: curso.codigo, nombre: curso.nombre, descripcion: curso.descripcion, activo: curso.activo };
}

export async function listarCursos(user) {
  const where = visibleWhere(user);
  if (!where) fail(403, 'FORBIDDEN', 'Tu usuario no tiene un rol académico habilitado.');
  return repository.listCursos(where);
}

export async function obtenerCurso(id, user) {
  const where = visibleWhere(user);
  if (!where) fail(403, 'FORBIDDEN', 'Tu usuario no tiene un rol académico habilitado.');
  const cursos = await repository.listCursos({ ...where, id });
  if (!cursos[0]) fail(404, 'COURSE_NOT_FOUND', 'El curso no existe o no está disponible.');
  return cursos[0];
}

export async function crearCurso(input, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const existente = await repository.findCursoByCodigo(input.codigo, db);
    if (existente) fail(409, 'COURSE_CODE_EXISTS', 'Ya existe un curso con ese código.');
    const curso = await repository.createCurso(
      { ...input, creadoPorId: actor.id, modificadoPorId: actor.id },
      db,
    );
    await repository.auditCurso(db, {
      usuarioId: actor.id,
      tipoEvento: 'CURSO_CREADO',
      cursoId: curso.id,
      valorNuevo: auditData(curso),
      requestId,
    });
    return curso;
  });
}

export async function modificarCurso(id, input, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const actual = await repository.findCurso(id, db);
    if (!actual || !actual.activo) fail(404, 'COURSE_NOT_FOUND', 'El curso no existe o está inactivo.');
    const curso = await repository.updateCurso(
      id,
      { descripcion: input.descripcion, modificadoPorId: actor.id },
      db,
    );
    await repository.auditCurso(db, {
      usuarioId: actor.id,
      tipoEvento: 'CURSO_MODIFICADO',
      cursoId: id,
      valorAnterior: auditData(actual),
      valorNuevo: auditData(curso),
      requestId,
    });
    return curso;
  });
}

export async function desactivarCurso(id, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const actual = await repository.findCurso(id, db);
    if (!actual || !actual.activo) fail(404, 'COURSE_NOT_FOUND', 'El curso no existe o ya está inactivo.');
    const curso = await repository.deleteCurso(id, db);
    await repository.auditCurso(db, {
      usuarioId: actor.id,
      tipoEvento: 'CURSO_DESACTIVADO',
      cursoId: id,
      valorAnterior: auditData(actual),
      valorNuevo: auditData(curso),
      requestId,
    });
    return curso;
  });
}
