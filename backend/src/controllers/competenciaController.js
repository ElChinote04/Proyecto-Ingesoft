import * as service from '../services/competenciaService.js';

export const listar = async (_req, res) => res.json({ data: await service.listarCompetencias() });
export const detalle = async (req, res) =>
  res.json({ data: await service.obtenerCompetencia(req.validated.params.id) });
export const crear = async (req, res) =>
  res.status(201).json({ data: await service.crearCompetencia(req.validated.body, req.user, req.requestId) });
export const modificar = async (req, res) =>
  res.json({ data: await service.modificarCompetencia(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const desactivar = async (req, res) =>
  res.json({ data: await service.desactivarCompetencia(req.validated.params.id, req.user, req.requestId) });
