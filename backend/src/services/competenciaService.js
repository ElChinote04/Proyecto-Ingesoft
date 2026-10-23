import * as repository from '../repositories/CompetenciaRepository.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

function requireAdmin(user) {
  if (!user?.roles?.includes('ADMINISTRADOR'))
    fail(403, 'FORBIDDEN', 'Solo un administrador puede gestionar competencias.');
}

function auditData(competencia) {
  return {
    id: competencia.id,
    cursoId: competencia.cursoId,
    codigo: competencia.codigo,
    nombre: competencia.nombre,
    descripcion: competencia.descripcion,
    activo: competencia.activo,
  };
}

export async function listarCompetencias() {
  return repository.listCompetencias({ activo: true });
}

export async function obtenerCompetencia(id) {
  const competencia = await repository.findCompetencia(id);
  if (!competencia?.activo)
    fail(404, 'COMPETENCY_NOT_FOUND', 'La competencia no existe o está inactiva.');
  return competencia;
}

export async function crearCompetencia(input, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const [existente, curso] = await Promise.all([
      repository.findCompetenciaByCodigo(input.codigo, db),
      db.curso.findUnique({ where: { id: input.cursoId } }),
    ]);
    if (existente) fail(409, 'COMPETENCY_CODE_EXISTS', 'Ya existe una competencia con ese código.');
    if (!curso?.activo) fail(404, 'COURSE_NOT_FOUND', 'El curso no existe o está inactivo.');
    const competencia = await repository.createCompetencia(
      { ...input, creadoPorId: actor.id, modificadoPorId: actor.id },
      db,
    );
    await repository.auditCompetencia(db, {
      usuarioId: actor.id,
      tipoEvento: 'COMPETENCIA_CREADA',
      competenciaId: competencia.id,
      valorNuevo: auditData(competencia),
      requestId,
    });
    return competencia;
  });
}

export async function modificarCompetencia(id, input, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const actual = await repository.findCompetencia(id, db);
    if (!actual?.activo)
      fail(404, 'COMPETENCY_NOT_FOUND', 'La competencia no existe o está inactiva.');
    const competencia = await repository.updateCompetencia(
      id,
      { descripcion: input.descripcion, modificadoPorId: actor.id },
      db,
    );
    await repository.auditCompetencia(db, {
      usuarioId: actor.id,
      tipoEvento: 'COMPETENCIA_MODIFICADA',
      competenciaId: id,
      valorAnterior: auditData(actual),
      valorNuevo: auditData(competencia),
      requestId,
    });
    return competencia;
  });
}

export async function desactivarCompetencia(id, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const actual = await repository.findCompetencia(id, db);
    if (!actual?.activo)
      fail(404, 'COMPETENCY_NOT_FOUND', 'La competencia no existe o ya está inactiva.');
    const competencia = await repository.deleteCompetencia(id, db);
    await repository.auditCompetencia(db, {
      usuarioId: actor.id,
      tipoEvento: 'COMPETENCIA_DESACTIVADA',
      competenciaId: id,
      valorAnterior: auditData(actual),
      valorNuevo: auditData(competencia),
      requestId,
    });
    return competencia;
  });
}
