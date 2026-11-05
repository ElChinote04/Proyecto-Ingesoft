import * as service from '../services/cursoService.js';

export const listar = async (req, res) => res.json({ data: await service.listarCursos(req.user) });
export const detalle = async (req, res) =>
  res.json({ data: await service.obtenerCurso(req.validated.params.id, req.user) });
export const crear = async (req, res) =>
  res.status(201).json({ data: await service.crearCurso(req.validated.body, req.user, req.requestId) });
export const modificar = async (req, res) =>
  res.json({ data: await service.modificarCurso(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const desactivar = async (req, res) =>
  res.json({ data: await service.desactivarCurso(req.validated.params.id, req.user, req.requestId) });
