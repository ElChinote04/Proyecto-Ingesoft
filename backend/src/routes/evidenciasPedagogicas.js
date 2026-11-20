import { Router } from 'express';
import { requireAlgunRol, requireAuth, requireRole } from '../middleware/auth.js';
import { crearReceptorArchivos } from '../middleware/archivosEvidencia.js';
import { validate, idSchema } from '../validators/schemas.js';
import {
  archivoEvidenciaPedagogicaParamsSchema,
  crearEvidenciaPedagogicaSchema,
  evidenciasPedagogicasQuerySchema,
  modificarEvidenciaPedagogicaSchema,
  motivoOpcionalSchema,
  revisarEvidenciaPedagogicaSchema,
} from '../validators/evidenciasPedagogicas.schemas.js';
import * as controller from '../controllers/evidenciasPedagogicas.controller.js';

// Consultar admite a la familia con su propio alcance; escribir, solo docente y administrador.
// El service decide con el docente vigente de la clase del plan.
const gestion = requireAlgunRol('DOCENTE', 'ADMINISTRADOR');
// Datos, estado y archivos van en una sola petición multipart: no queda nada a medias.
const recibirActividad = crearReceptorArchivos({ campos: 10 });

export const evidenciasPedagogicasRouter = Router();
evidenciasPedagogicasRouter.use(requireAuth);
evidenciasPedagogicasRouter.get(
  '/',
  validate(evidenciasPedagogicasQuerySchema, 'query'),
  controller.listar,
);
evidenciasPedagogicasRouter.get('/:id', validate(idSchema, 'params'), controller.detalle);
evidenciasPedagogicasRouter.post(
  '/',
  gestion,
  recibirActividad,
  validate(crearEvidenciaPedagogicaSchema),
  controller.crear,
);
evidenciasPedagogicasRouter.patch(
  '/:id',
  gestion,
  validate(idSchema, 'params'),
  recibirActividad,
  validate(modificarEvidenciaPedagogicaSchema),
  controller.modificar,
);
evidenciasPedagogicasRouter.put(
  '/:id/revision',
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(revisarEvidenciaPedagogicaSchema),
  controller.revisar,
);
evidenciasPedagogicasRouter.delete(
  '/:id',
  gestion,
  validate(idSchema, 'params'),
  validate(motivoOpcionalSchema),
  controller.darDeBaja,
);
evidenciasPedagogicasRouter.get(
  '/:id/archivos/:archivoId',
  validate(archivoEvidenciaPedagogicaParamsSchema, 'params'),
  controller.descargarArchivo,
);
evidenciasPedagogicasRouter.delete(
  '/:id/archivos/:archivoId',
  gestion,
  validate(archivoEvidenciaPedagogicaParamsSchema, 'params'),
  validate(motivoOpcionalSchema),
  controller.quitarArchivo,
);
