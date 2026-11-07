import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { recibirArchivos } from '../middleware/archivosEvidencia.js';
import { validate, idSchema } from '../validators/schemas.js';
import { bajaConMotivoSchema } from '../validators/calificacion.schemas.js';
import {
  archivoEvidenciaParamsSchema,
  crearEvidenciaSchema,
  modificarEvidenciaSchema,
} from '../validators/evidenciasCalificacion.schemas.js';
import * as controller from '../controllers/evidenciasCalificacion.controller.js';

// Consultar y dar de baja admite dos roles: el service decide con el docente vigente del curso.
export const evidenciasCalificacionRouter = Router();
const docente = [requireAuth, requireRole('DOCENTE')];

evidenciasCalificacionRouter.get(
  '/calificaciones-competencias/:id/evidencias',
  requireAuth,
  validate(idSchema, 'params'),
  controller.listar,
);
evidenciasCalificacionRouter.post(
  '/calificaciones-competencias/:id/evidencias',
  docente,
  validate(idSchema, 'params'),
  recibirArchivos,
  validate(crearEvidenciaSchema),
  controller.crear,
);
evidenciasCalificacionRouter.patch(
  '/evidencias-calificaciones/:id',
  docente,
  validate(idSchema, 'params'),
  validate(modificarEvidenciaSchema),
  controller.modificar,
);
evidenciasCalificacionRouter.delete(
  '/evidencias-calificaciones/:id',
  requireAuth,
  validate(idSchema, 'params'),
  validate(bajaConMotivoSchema),
  controller.darDeBaja,
);
evidenciasCalificacionRouter.post(
  '/evidencias-calificaciones/:id/archivos',
  docente,
  validate(idSchema, 'params'),
  recibirArchivos,
  controller.agregarArchivos,
);
evidenciasCalificacionRouter.get(
  '/evidencias-calificaciones/:id/archivos/:archivoId',
  requireAuth,
  validate(archivoEvidenciaParamsSchema, 'params'),
  controller.descargarArchivo,
);
evidenciasCalificacionRouter.delete(
  '/evidencias-calificaciones/:id/archivos/:archivoId',
  docente,
  validate(archivoEvidenciaParamsSchema, 'params'),
  controller.quitarArchivo,
);
