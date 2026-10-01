import * as service from '../services/adminService.js';
export const status = async (_req, res) =>
  res.json({ success: true, data: await service.setupStatus() });
export const initialize = async (req, res) =>
  res
    .status(201)
    .json({ success: true, data: await service.initialize(req.validated.body, req.requestId) });
export const users = async (_req, res) => res.json({ success: true, data: await service.users() });
export const createUser = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.createUser(req.validated.body, req.user, req.requestId),
  });
export const updateUser = async (req, res) =>
  res.json({
    success: true,
    data: await service.updateUser(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req.requestId,
    ),
  });
export const catalogs = async (_req, res) =>
  res.json({ success: true, data: await service.catalogs() });
export const createCatalog = (type) => async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.createCatalog(type, req.validated.body, req.user, req.requestId),
  });
export const students = async (_req, res) =>
  res.json({ success: true, data: await service.students() });
export const createStudent = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.createStudent(req.validated.body, req.user, req.requestId),
  });
export const enroll = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.enroll(req.validated.body, req.user, req.requestId),
  });
export const schedule = async (_req, res) =>
  res.json({ success: true, data: await service.schedule() });
export const createBlock = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.createBlock(req.validated.body, req.user, req.requestId),
  });
export const createClass = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.createClass(req.validated.body, req.user, req.requestId),
  });
export const audits = async (_req, res) =>
  res.json({ success: true, data: await service.auditEvents() });
