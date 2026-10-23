import * as service from '../services/reglaConsolidacionService.js';

export const listar = async (_req, res) => res.json({ data: await service.listarReglas() });
export const detalle = async (req, res) => res.json({ data: await service.obtenerRegla(req.validated.params.id) });
export const crear = async (req, res) => res.status(201).json({ data: await service.crearRegla(req.validated.body, req.user, req.requestId) });
export const versionar = async (req, res) => res.status(201).json({ data: await service.crearNuevaVersion(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const desactivar = async (req, res) => res.json({ data: await service.desactivarRegla(req.validated.params.id, req.user, req.requestId) });
