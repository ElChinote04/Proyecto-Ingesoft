import * as service from '../services/portal.service.js';
export const obtenerPortal = async (req, res) =>
  res.json({ data: await service.obtenerPortal(req.user) });
export const obtenerHistorial = async (req, res) =>
  res.json({
    data: await service.obtenerHistorial(req.validated.params.id, req.validated.query, req.user),
  });
export const obtenerHorario = async (req, res) =>
  res.json({ data: await service.obtenerHorario(req.validated.query, req.user) });
