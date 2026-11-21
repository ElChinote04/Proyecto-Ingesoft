import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import {
  bajaConMotivoSchema,
  calificacionQuerySchema,
  publicacionMasivaSchema,
  publicacionQuerySchema,
  publicacionSeccionParamsSchema,
} from '../validators/calificacion.schemas.js';
import * as controller from '../controllers/calificacionController.js';
import * as publicacion from '../controllers/publicacionSeccion.controller.js';

export const calificacionRouter = Router();
calificacionRouter.use(requireAuth);
calificacionRouter.get('/', validate(calificacionQuerySchema, 'query'), controller.listar);
calificacionRouter.get(
  '/bimestres/:id/publicacion',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(publicacionQuerySchema, 'query'),
  publicacion.consultar,
);
calificacionRouter.post(
  '/bimestres/:id/publicacion',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(publicacionMasivaSchema),
  publicacion.publicarVarias,
);
calificacionRouter.post(
  '/bimestres/:id/secciones/:seccionId/publicacion',
  requireRole('ADMINISTRADOR'),
  validate(publicacionSeccionParamsSchema, 'params'),
  publicacion.publicar,
);
// La letra ya no se escribe a mano: la calculan las evaluaciones (rutas /evaluaciones).
calificacionRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
calificacionRouter.delete(
  '/:id',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(bajaConMotivoSchema),
  controller.desactivar,
);
