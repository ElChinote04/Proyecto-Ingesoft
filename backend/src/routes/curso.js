import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { createCursoSchema, updateCursoSchema } from '../validators/adminSchemas.js';
import * as controller from '../controllers/cursoController.js';

export const cursoRouter = Router();
cursoRouter.use(requireAuth);
cursoRouter.get('/', controller.listar);
cursoRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
cursoRouter.post('/', requireRole('ADMINISTRADOR'), validate(createCursoSchema), controller.crear);
cursoRouter.put(
  '/:id',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(updateCursoSchema),
  controller.modificar,
);
cursoRouter.delete(
  '/:id',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  controller.desactivar,
);
