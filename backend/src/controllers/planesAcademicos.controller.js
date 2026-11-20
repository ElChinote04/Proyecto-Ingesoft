import * as service from '../services/planesAcademicos.service.js';

export const listar = async (req, res) =>
  res.json({ data: await service.listarPlanes(req.validated.query, req.user) });

export const detalle = async (req, res) =>
  res.json({ data: await service.obtenerPlan(req.validated.params.id, req.user) });

export const crear = async (req, res) =>
  res
    .status(201)
    .json({ data: await service.crearPlan(req.validated.body, req.user, req.requestId) });

export const modificar = async (req, res) =>
  res.json({
    data: await service.modificarPlan(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req.requestId,
    ),
  });

export const desactivar = async (req, res) =>
  res.json({
    data: await service.desactivarPlan(req.validated.params.id, req.user, req.requestId),
  });
