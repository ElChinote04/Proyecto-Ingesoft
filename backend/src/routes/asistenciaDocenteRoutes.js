
import { Router } from 'express';

import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validators/schemas.js';

import * as controller from '../controllers/asistenciaDocenteController.js';

import {
  asistenciaDocenteParams,
  asistenciaDocenteBody,
  asistenciaDocenteHistorialParams,
  asistenciaDocenteReporteQuery
} from '../validators/asistenciaDocenteSchemas.js';

export const asistenciaDocenteRouter = Router();

// 1. Registrar o actualizar asistencia docente
asistenciaDocenteRouter.put(
  '/asistencias/docentes/:docenteId/dias/:fecha',
  requireAuth,
  requireRole('ADMINISTRADOR'),
  validate(asistenciaDocenteParams, 'params'),
  validate(asistenciaDocenteBody, 'body'),
  controller.registrar
);

// 2. Consultar historial de asistencia docente
asistenciaDocenteRouter.get(
  '/asistencias/docentes/:docenteId',
  requireAuth,
  validate(asistenciaDocenteHistorialParams, 'params'),
  controller.historial
);

// 3. Obtener reporte de asistencia docente
asistenciaDocenteRouter.get(
  '/reportes/asistencia/docentes',
  requireAuth,
  requireRole('ADMINISTRADOR'),
  validate(asistenciaDocenteReporteQuery, 'query'),
  controller.reporte
);
