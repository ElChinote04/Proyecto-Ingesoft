import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { createReglaConsolidacionSchema, updateReglaConsolidacionSchema } from '../validators/adminSchemas.js';
import * as controller from '../controllers/reglaConsolidacionController.js';

export const reglaConsolidacionRouter = Router();
reglaConsolidacionRouter.use(requireAuth);
reglaConsolidacionRouter.get('/', controller.listar);
reglaConsolidacionRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
reglaConsolidacionRouter.post('/', requireRole('ADMINISTRADOR'), validate(createReglaConsolidacionSchema), controller.crear);
reglaConsolidacionRouter.put('/:id/version', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), validate(updateReglaConsolidacionSchema), controller.versionar);
reglaConsolidacionRouter.delete('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), controller.desactivar);
