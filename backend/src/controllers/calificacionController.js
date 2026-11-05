import * as service from '../services/calificacionService.js';

export const listar = async (req, res) => res.json({ data: await service.listarCalificaciones(req.user, req.validated?.query?.estudianteId) });
export const contexto = async (req, res) => res.json({ data: await service.obtenerContextoCalificacion(req.validated.query, req.user) });
export const guardarMasivas = async (req, res) => res.json({ data: await service.guardarCalificacionesMasivas(req.validated.body, req.user, req.requestId) });
export const detalle = async (req, res) => res.json({ data: await service.obtenerCalificacion(req.validated.params.id) });
export const crear = async (req, res) => res.status(201).json({ data: await service.crearCalificacion(req.validated.body, req.user, req.requestId) });
export const modificar = async (req, res) => res.json({ data: await service.modificarCalificacion(req.validated.params.id, req.validated.body, req.user, req.requestId) });
export const desactivar = async (req, res) => res.json({ data: await service.desactivarCalificacion(req.validated.params.id, req.user, req.requestId) });
