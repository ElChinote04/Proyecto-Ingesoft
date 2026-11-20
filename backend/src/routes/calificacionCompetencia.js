import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import { bajaConMotivoSchema } from '../validators/calificacion.schemas.js';
import * as controller from '../controllers/calificacionCompetenciaController.js';

export const calificacionCompetenciaRouter = Router();
calificacionCompetenciaRouter.use(requireAuth);
// La letra ya no se escribe a mano: la calculan las evaluaciones (rutas /evaluaciones).
calificacionCompetenciaRouter.get('/', controller.listar);
calificacionCompetenciaRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
calificacionCompetenciaRouter.delete('/:id', requireRole('ADMINISTRADOR'), validate(idSchema, 'params'), validate(bajaConMotivoSchema), controller.desactivar);
