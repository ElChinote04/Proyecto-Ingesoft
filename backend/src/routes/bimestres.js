import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { fechasBimestreSchema } from '../validators/bimestres.schemas.js';
import * as controller from '../controllers/bimestres.controller.js';

export const bimestresRouter = Router();
bimestresRouter.use(requireAuth);
bimestresRouter.get('/', controller.listar);
bimestresRouter.patch(
  '/:id',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(fechasBimestreSchema),
  controller.modificarFechas,
);
