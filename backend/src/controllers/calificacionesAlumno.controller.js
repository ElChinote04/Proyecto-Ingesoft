import * as service from '../services/calificacionesAlumno.service.js';

export const salones = async (req, res) =>
  res.json({ data: await service.listarSalones(req.user) });

export const alumnos = async (req, res) =>
  res.json({ data: await service.listarAlumnos(req.validated.params.id, req.user) });

export const consultar = async (req, res) =>
  res.json({
    data: await service.obtenerCalificaciones(
      req.validated.params.id,
      req.validated.query,
      req.user,
    ),
  });

export const guardar = async (req, res) =>
  res.json({
    data: await service.guardarCalificaciones(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req.requestId,
    ),
  });
