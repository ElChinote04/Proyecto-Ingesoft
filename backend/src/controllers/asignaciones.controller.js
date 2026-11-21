import * as service from '../services/asignaciones.service.js';

export const listar = async (req, res) =>
  res.json({ data: await service.listarAsignaciones(req.validated.query, req.user) });
