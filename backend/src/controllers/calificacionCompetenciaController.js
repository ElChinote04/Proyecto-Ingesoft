import * as service from '../services/calificacionCompetenciaService.js';

export const listar = async (_req, res) => res.json({ data: await service.listarDetalles() });
export const detalle = async (req, res) => res.json({ data: await service.obtenerDetalle(req.validated.params.id) });
export const crear = async (req, res) => res.status(201).json({ data: await service.crearDetalle(req.validated.body, req.user, req.requestId) });
export const modificar = async (req, res) => res.json({ data: await service.modificarDetalle(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const desactivar = async (req, res) => res.json({ data: await service.desactivarDetalle(req.validated.params.id, req.user, req.requestId) });
