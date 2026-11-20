import * as service from '../services/calificacionCompetenciaService.js';

export const listar = async (req, res) => res.json({ data: await service.listarDetalles(req.user) });
export const detalle = async (req, res) => res.json({ data: await service.obtenerDetalle(req.validated.params.id, req.user) });
export const desactivar = async (req, res) => res.json({ data: await service.desactivarDetalle(req.validated.params.id, req.validated.body?.motivo, req.user, req.requestId) });
