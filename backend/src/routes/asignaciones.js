import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../validators/schemas.js';
import { asignacionesQuerySchema } from '../validators/asignaciones.schemas.js';
import * as controller from '../controllers/asignaciones.controller.js';

export const asignacionesRouter = Router();
asignacionesRouter.get(
  '/',
  requireAuth,
  validate(asignacionesQuerySchema, 'query'),
  controller.listar,
);
