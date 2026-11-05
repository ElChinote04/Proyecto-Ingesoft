import * as service from '../services/evidenciaPedagodicaService.js';

export const listar = async (_req, res) => res.json({ data: await service.listarEvidencias() });
export const detalle = async (req, res) => res.json({ data: await service.obtenerEvidencia(req.validated.params.id) });
export const crear = async (req, res) => res.status(201).json({ data: await service.crearEvidencia(req.validated.body, req.user, req.requestId) });
export const modificar = async (req, res) => res.json({ data: await service.modificarEvidencia(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const revisar = async (req, res) => res.json({ data: await service.revisarEvidencia(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const desactivar = async (req, res) => res.json({ data: await service.desactivarEvidencia(req.validated.params.id, req.user, req.requestId) });
