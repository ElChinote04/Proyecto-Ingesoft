import * as repository from '../repositories/calificacionCompetencia.js';
import { exigirMotivoSiPublicada } from './publicacionSeccion.service.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => { throw new AppError(status, code, message); };
const requireRole = (user, role) => { if (!user?.roles?.includes(role)) fail(403, 'FORBIDDEN', `Solo un ${role.toLowerCase()} puede realizar esta operación.`); };
const snapshot = (item) => ({ id: item.id, calificacionId: item.calificacionId, competenciaId: item.competenciaId, nivelLogro: item.nivelLogro, conclusionDescriptiva: item.conclusionDescriptiva, activo: item.activo });

const ubicacion = ({ calificacion }) => ({ bimestreId: calificacion.bimestreId, seccionId: calificacion.matricula.seccionId });

export async function listarDetalles(user) {
  if (user.roles.includes('ADMINISTRADOR')) return repository.listCalificacionesCompetencia({ activo: true });
  if (user.roles.includes('DOCENTE') && user.docenteId) return repository.listCalificacionesCompetencia({ activo: true, calificacion: { asignacion: { docenteId: user.docenteId } } });
  fail(403, 'FORBIDDEN', 'No tienes permiso para consultar estas calificaciones.');
}
export async function obtenerDetalle(id, user) {
  const item = await repository.findCalificacionCompetencia(id);
  if (!item?.activo) fail(404, 'GRADE_DETAIL_NOT_FOUND', 'El detalle de calificación no existe o está inactivo.');
  const esAdministrador = user.roles.includes('ADMINISTRADOR');
  const esSuDocente = user.roles.includes('DOCENTE') && user.docenteId === item.calificacion.asignacion.docenteId;
  if (!esAdministrador && !esSuDocente) fail(403, 'FORBIDDEN', 'No tienes permiso para consultar esta calificación.');
  return item;
}

export async function desactivarDetalle(id, motivo, actor, requestId) {
  requireRole(actor, 'ADMINISTRADOR');
  return repository.transaction(async (db) => {
    const actual = await repository.findCalificacionCompetencia(id, db);
    if (!actual?.activo) fail(404, 'GRADE_DETAIL_NOT_FOUND', 'El detalle de calificación no existe o ya está inactivo.');
    await exigirMotivoSiPublicada({ ...ubicacion(actual), motivo }, db);
    const item = await repository.deleteCalificacionCompetencia(id, db);
    await repository.auditCalificacionCompetencia(db, { usuarioId: actor.id, tipoEvento: 'CALIFICACION_COMPETENCIA_DESACTIVADA', detalleId: id, valorAnterior: snapshot(actual), valorNuevo: snapshot(item), motivo, requestId });
    return item;
  });
}
