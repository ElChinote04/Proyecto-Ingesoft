import * as service from '../services/sessionService.js';
export const list = async (req, res) =>
  res.json({ data: await service.list(req.user, req.requestId) });
export const detail = async (req, res) =>
  res.json({ data: await service.detail(req.validated.params.id, req.user) });
export const students = async (req, res) =>
  res.json({ data: await service.students(req.validated.params.id, req.user) });
export const save = async (req, res) =>
  res.json({
    data: await service.save(req.validated.params.id, req.validated.body, req.user, req.requestId),
  });
