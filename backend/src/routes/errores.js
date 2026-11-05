import { Router } from 'express';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { validate } from '../validators/schemas.js';
import { consultaErroresSchema } from '../validators/errores.schemas.js';
import * as controller from '../controllers/errores.controller.js';

export const erroresRouter = Router();
erroresRouter.get(
  '/',
  requireAuth,
  requirePermiso('errores.consultar'),
  validate(consultaErroresSchema, 'query'),
  controller.obtenerErrores,
);
