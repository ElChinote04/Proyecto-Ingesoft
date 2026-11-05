import * as service from '../services/planAcademicoService.js';

export const listar = async (_req, res) => res.json({ data: await service.listarPlanes() });
export const detalle = async (req, res) => res.json({ data: await service.obtenerPlan(req.validated.params.id) });
export const crear = async (req, res) => res.status(201).json({ data: await service.crearPlan(req.validated.body, req.user, req.requestId) });
export const modificar = async (req, res) => res.json({ data: await service.modificarPlan(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const desactivar = async (req, res) => res.json({ data: await service.desactivarPlan(req.validated.params.id, req.user, req.requestId) });
