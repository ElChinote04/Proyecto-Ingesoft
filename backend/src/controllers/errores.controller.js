import * as service from '../services/errores.service.js';
export const obtenerErrores = async (req, res) =>
  res.json({ data: await service.obtenerErrores(req.validated.query) });
