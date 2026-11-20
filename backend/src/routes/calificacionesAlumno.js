import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import {
  calificacionAlumnoQuerySchema,
  calificacionAlumnoSchema,
} from '../validators/calificacion.schemas.js';
import * as controller from '../controllers/calificacionesAlumno.controller.js';

// Se declara ruta por ruta: /matriculas también lo usa el módulo de pagos, y un
// middleware común dejaría sus rutas restringidas al rol docente.
export const calificacionesAlumnoRouter = Router();
const docente = [requireAuth, requireRole('DOCENTE')];

calificacionesAlumnoRouter.get('/secciones', docente, controller.salones);
calificacionesAlumnoRouter.get(
  '/secciones/:id/alumnos',
  docente,
  validate(idSchema, 'params'),
  controller.alumnos,
);
calificacionesAlumnoRouter.get(
  '/matriculas/:id/calificaciones',
  docente,
  validate(idSchema, 'params'),
  validate(calificacionAlumnoQuerySchema, 'query'),
  controller.consultar,
);
calificacionesAlumnoRouter.put(
  '/matriculas/:id/calificaciones',
  docente,
  validate(idSchema, 'params'),
  validate(calificacionAlumnoSchema),
  controller.guardar,
);
