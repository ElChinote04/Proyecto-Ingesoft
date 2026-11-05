import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { createCalificacionSchema, updateCalificacionSchema } from '../validators/adminSchemas.js';
import { bulkCalificacionSchema, calificacionContextQuerySchema, calificacionQuerySchema } from '../validators/calificacion.schemas.js';
import * as controller from '../controllers/calificacionController.js';

export const calificacionRouter = Router();
calificacionRouter.use(requireAuth);
calificacionRouter.get('/', validate(calificacionQuerySchema, 'query'), controller.listar);
calificacionRouter.get('/contexto', requireRole('DOCENTE'), validate(calificacionContextQuerySchema, 'query'), controller.contexto);
calificacionRouter.post('/competencias/bulk', requireRole('DOCENTE'), validate(bulkCalificacionSchema), controller.guardarMasivas);
calificacionRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
calificacionRouter.post('/', requireRole('DOCENTE'), validate(createCalificacionSchema), controller.crear);
calificacionRouter.put('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), validate(updateCalificacionSchema), controller.modificar);
calificacionRouter.delete('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), controller.desactivar);
