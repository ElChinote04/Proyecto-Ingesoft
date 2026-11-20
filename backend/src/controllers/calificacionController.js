import * as service from '../services/calificacionService.js';

export const listar = async (req, res) =>
  res.json({
    data: await service.listarCalificaciones(req.user, req.validated?.query?.estudianteId),
  });
export const detalle = async (req, res) =>
  res.json({ data: await service.obtenerCalificacion(req.validated.params.id, req.user) });
export const desactivar = async (req, res) =>
  res.json({
    data: await service.desactivarCalificacion(
      req.validated.params.id,
      req.validated.body?.motivo,
      req.user,
      req.requestId,
    ),
  });
