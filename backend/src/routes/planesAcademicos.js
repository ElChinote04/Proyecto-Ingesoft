import { Router } from 'express';
import { requireAlgunRol, requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import {
  crearPlanSchema,
  modificarPlanSchema,
  planesQuerySchema,
} from '../validators/planesAcademicos.schemas.js';
import * as controller from '../controllers/planesAcademicos.controller.js';

export const planesAcademicosRouter = Router();
// Un solo recurso para docente y administrador: el service resuelve el alcance (docente
// vigente de la clase o administrador).
planesAcademicosRouter.use(requireAuth, requireAlgunRol('DOCENTE', 'ADMINISTRADOR'));
planesAcademicosRouter.get('/', validate(planesQuerySchema, 'query'), controller.listar);
planesAcademicosRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
planesAcademicosRouter.post('/', validate(crearPlanSchema), controller.crear);
planesAcademicosRouter.patch(
  '/:id',
  validate(idSchema, 'params'),
  validate(modificarPlanSchema),
  controller.modificar,
);
planesAcademicosRouter.delete(
  '/:id',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  controller.desactivar,
);
