import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { createPlanAcademicoSchema, updatePlanAcademicoSchema } from '../validators/adminSchemas.js';
import * as controller from '../controllers/planAcademicoController.js';

export const planAcademicoRouter = Router();
planAcademicoRouter.use(requireAuth);
planAcademicoRouter.get('/', controller.listar);
planAcademicoRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
planAcademicoRouter.post('/', requireRole('ADMINISTRADOR'), validate(createPlanAcademicoSchema), controller.crear);
planAcademicoRouter.post('/docente', requireRole('DOCENTE'), validate(createPlanAcademicoSchema), controller.crear);
planAcademicoRouter.put('/:id', validate(idSchema, 'params'), validate(updatePlanAcademicoSchema), controller.modificar);
planAcademicoRouter.delete('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), controller.desactivar);
