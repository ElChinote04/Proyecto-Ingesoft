import { Router } from 'express';
import { requireAlgunRol, requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validators/schemas.js';
import { escalaCalificacionSchema } from '../validators/escalaCalificacion.schemas.js';
import * as controller from '../controllers/escalaCalificacion.controller.js';

// Recurso único: PUT sin identificador reemplaza la escala completa.
export const escalaCalificacionRouter = Router();
escalaCalificacionRouter.use(requireAuth);
escalaCalificacionRouter.get(
  '/',
  requireAlgunRol('DOCENTE', 'ADMINISTRADOR'),
  controller.consultar,
);
escalaCalificacionRouter.put(
  '/',
  requireRole('ADMINISTRADOR'),
  validate(escalaCalificacionSchema),
  controller.modificar,
);
