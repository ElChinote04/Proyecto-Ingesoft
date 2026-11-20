import * as service from '../services/libretas.service.js';

export const listar = async (req, res) =>
  res.json({ data: await service.listarLibretas(req.user) });
export const consultar = async (req, res) =>
  res.json({ data: await service.obtenerLibreta(req.validated.params.id, req.user) });
