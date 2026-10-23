import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { createEvidenciaPedagogicaSchema, updateEvidenciaPedagogicaSchema, reviewEvidenciaPedagogicaSchema } from '../validators/adminSchemas.js';
import * as controller from '../controllers/evidenciaPedagogicaController.js';

export const evidenciaPedagogicaRouter = Router();
evidenciaPedagogicaRouter.use(requireAuth);
evidenciaPedagogicaRouter.get('/', controller.listar);
evidenciaPedagogicaRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
evidenciaPedagogicaRouter.post('/', requireRole('DOCENTE'), validate(createEvidenciaPedagogicaSchema), controller.crear);
evidenciaPedagogicaRouter.put('/:id', requireRole('DOCENTE'), validate(idSchema, 'params'), validate(updateEvidenciaPedagogicaSchema), controller.modificar);
evidenciaPedagogicaRouter.put('/:id/revision', validate(idSchema, 'params'), validate(reviewEvidenciaPedagogicaSchema), controller.revisar);
evidenciaPedagogicaRouter.delete('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), controller.desactivar);
