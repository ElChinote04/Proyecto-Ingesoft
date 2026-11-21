import { Router } from 'express';
import { requireAlgunRol, requireAuth, requireRole } from '../middleware/auth.js';
import { crearReceptorArchivos } from '../middleware/archivosEvidencia.js';
import { validate, idSchema } from '../validators/schemas.js';
import {
  archivoResultadoParamsSchema,
  crearEvaluacionSchema,
  evaluacionesQuerySchema,
  modificarEvaluacionSchema,
  resultadoParamsSchema,
  resultadoSchema,
} from '../validators/evaluaciones.schemas.js';
import * as controller from '../controllers/evaluaciones.controller.js';

// Las evaluaciones las gestiona el docente vigente de la clase; el service lo comprueba.
// La familia no entra: solo ve la letra en la libreta publicada.
const docente = requireRole('DOCENTE');
// La nota, su condición y el examen corregido van en una sola petición multipart.
const recibirResultado = crearReceptorArchivos({ campos: 6 });

export const evaluacionesRouter = Router();
evaluacionesRouter.use(requireAuth);
evaluacionesRouter.get('/', docente, validate(evaluacionesQuerySchema, 'query'), controller.listar);
evaluacionesRouter.post('/', docente, validate(crearEvaluacionSchema), controller.crear);
evaluacionesRouter.patch(
  '/:id',
  docente,
  validate(idSchema, 'params'),
  validate(modificarEvaluacionSchema),
  controller.modificar,
);
evaluacionesRouter.delete('/:id', docente, validate(idSchema, 'params'), controller.eliminar);
evaluacionesRouter.get(
  '/:id/pendientes',
  docente,
  validate(idSchema, 'params'),
  controller.pendientes,
);
evaluacionesRouter.put(
  '/:id/resultados/:matriculaId',
  docente,
  validate(resultadoParamsSchema, 'params'),
  recibirResultado,
  validate(resultadoSchema),
  controller.registrarResultado,
);
evaluacionesRouter.delete(
  '/:id/resultados/:matriculaId',
  docente,
  validate(resultadoParamsSchema, 'params'),
  controller.quitarResultado,
);
evaluacionesRouter.get(
  '/:id/resultados/:matriculaId/archivos/:archivoId',
  requireAlgunRol('DOCENTE', 'ADMINISTRADOR'),
  validate(archivoResultadoParamsSchema, 'params'),
  controller.descargarArchivo,
);
