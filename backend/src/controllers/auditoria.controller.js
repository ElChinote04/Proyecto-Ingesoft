import * as service from '../services/auditoria.service.js';
export const obtenerEventos = async (req, res) =>
  res.json({ data: await service.obtenerEventos(req.validated.query) });
