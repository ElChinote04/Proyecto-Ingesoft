import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { createCompetenciaSchema, updateCompetenciaSchema } from '../validators/adminSchemas.js';
import * as controller from '../controllers/competenciaController.js';

export const competenciaRouter = Router();
competenciaRouter.use(requireAuth);
competenciaRouter.get('/', controller.listar);
competenciaRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
competenciaRouter.post('/', requireRole('ADMINISTRADOR'), validate(createCompetenciaSchema), controller.crear);
competenciaRouter.put(
  '/:id',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(updateCompetenciaSchema),
  controller.modificar,
);
competenciaRouter.delete(
  '/:id',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  controller.desactivar,
);
