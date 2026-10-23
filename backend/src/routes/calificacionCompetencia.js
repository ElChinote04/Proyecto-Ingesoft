import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { createCalificacionCompetenciaSchema, updateCalificacionCompetenciaSchema } from '../validators/adminSchemas.js';
import * as controller from '../controllers/calificacionCompetenciaController.js';

export const calificacionCompetenciaRouter = Router();
calificacionCompetenciaRouter.use(requireAuth);
calificacionCompetenciaRouter.get('/', controller.listar);
calificacionCompetenciaRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
calificacionCompetenciaRouter.post('/', requireRole('DOCENTE'), validate(createCalificacionCompetenciaSchema), controller.crear);
calificacionCompetenciaRouter.put('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), validate(updateCalificacionCompetenciaSchema), controller.modificar);
calificacionCompetenciaRouter.delete('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), controller.desactivar);
