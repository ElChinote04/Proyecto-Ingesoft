import * as service from '../services/escalaCalificacion.service.js';

export const consultar = async (_req, res) => res.json({ data: await service.obtenerEscala() });

export const modificar = async (req, res) =>
  res.json({ data: await service.modificarEscala(req.validated.body, req.user, req.requestId) });
