import * as repository from '../repositories/reglaConsolidacionRepository.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => { throw new AppError(status, code, message); };
const requireAdmin = (user) => {
  if (!user?.roles?.includes('ADMINISTRADOR')) fail(403, 'FORBIDDEN', 'Solo un administrador puede gestionar reglas de consolidación.');
};
const snapshot = (regla) => ({ id: regla.id, gradoId: regla.gradoId, cursoId: regla.cursoId, nombre: regla.nombre, version: regla.version, metodo: regla.metodo, vigenteDesde: regla.vigenteDesde, vigenteHasta: regla.vigenteHasta, activo: regla.activo });
const date = (value) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

function vigenteWhere() {
  const hoy = new Date();
  return { activo: true, vigenteDesde: { lte: hoy }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: hoy } }] };
}

export async function listarReglas() {
  return repository.listReglasConsolidacion({});
}
export async function obtenerRegla(id) {
  const regla = await repository.findReglaConsolidacion(id);
  const where = vigenteWhere();
  const isVigente = regla && regla.activo && regla.vigenteDesde <= where.vigenteDesde.lte && (!regla.vigenteHasta || regla.vigenteHasta >= where.vigenteDesde.lte);
  if (!isVigente) fail(404, 'RULE_NOT_FOUND', 'La regla no existe, está inactiva o fuera de vigencia.');
  return regla;
}

async function validateReferences(input, db) {
  const [grado, curso] = await Promise.all([
    db.grado.findUnique({ where: { id: input.gradoId } }),
    db.curso.findUnique({ where: { id: input.cursoId } }),
  ]);
  if (!grado) fail(404, 'GRADE_NOT_FOUND', 'El grado no existe.');
  if (!curso) fail(404, 'COURSE_NOT_FOUND', 'El curso no existe.');
}

export async function crearRegla(input, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    await validateReferences(input, db);
    const existente = await db.reglaConsolidacion.findUnique({ where: { gradoId_cursoId_version: { gradoId: input.gradoId, cursoId: input.cursoId, version: input.version } } });
    if (existente) fail(409, 'RULE_VERSION_EXISTS', 'Ya existe esa versión para el grado y curso.');
    const regla = await repository.createReglaConsolidacion({ ...input, vigenteDesde: new Date(), vigenteHasta: date(input.vigenteHasta), creadoPorId: actor.id, modificadoPorId: actor.id }, db);
    await repository.auditReglaConsolidacion(db, { usuarioId: actor.id, tipoEvento: 'REGLA_CONSOLIDACION_CREADA', reglaId: regla.id, valorNuevo: snapshot(regla), requestId });
    return regla;
  });
}

export async function crearNuevaVersion(id, input, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const actual = await repository.findReglaConsolidacion(id, db);
    if (!actual?.activo) fail(404, 'RULE_NOT_FOUND', 'La regla no existe o está inactiva.');
    const existente = await db.reglaConsolidacion.findUnique({ where: { gradoId_cursoId_version: { gradoId: actual.gradoId, cursoId: actual.cursoId, version: input.version } } });
    if (existente) fail(409, 'RULE_VERSION_EXISTS', 'Ya existe esa versión para el grado y curso.');
    const nueva = await repository.createReglaConsolidacion({ gradoId: actual.gradoId, cursoId: actual.cursoId, nombre: actual.nombre, version: input.version, metodo: input.metodo, vigenteDesde: new Date(), creadoPorId: actor.id, modificadoPorId: actor.id }, db);
    const anterior = await repository.updateReglaConsolidacion(id, { activo: false, vigenteHasta: new Date(), modificadoPorId: actor.id }, db);
    await repository.auditReglaConsolidacion(db, { usuarioId: actor.id, tipoEvento: 'REGLA_CONSOLIDACION_VERSIONADA', reglaId: nueva.id, valorAnterior: snapshot(anterior), valorNuevo: snapshot(nueva), requestId });
    return nueva;
  });
}

export async function desactivarRegla(id, actor, requestId) {
  requireAdmin(actor);
  return repository.transaction(async (db) => {
    const actual = await repository.findReglaConsolidacion(id, db);
    if (!actual?.activo) fail(404, 'RULE_NOT_FOUND', 'La regla no existe o ya está inactiva.');
    const regla = await repository.deleteReglaConsolidacion(id, db);
    await repository.auditReglaConsolidacion(db, { usuarioId: actor.id, tipoEvento: 'REGLA_CONSOLIDACION_DESACTIVADA', reglaId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(regla), requestId });
    return regla;
  });
}
