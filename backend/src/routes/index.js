import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as auth from '../controllers/authController.js';
import * as session from '../controllers/sessionController.js';
import * as health from '../controllers/healthController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, loginSchema, idSchema, asistenciaSchema } from '../validators/schemas.js';
import { AppError } from '../errors/AppError.js';
import { adminRouter } from './admin.js';
import * as admin from '../controllers/adminController.js';
import { passwordSchema } from '../validators/seguridad.schemas.js';
import { setupSchema } from '../validators/adminSchemas.js';
import * as portal from '../controllers/portal.controller.js';
import { horarioSchema, paginaSchema } from '../validators/portal.schemas.js';
import { cursoRouter } from './curso.js';
import { competenciaRouter } from './competencia.js';
import { calificacionRouter } from './calificacion.js';
import { reglaConsolidacionRouter } from './reglaConsolidacion.js';
import { planAcademicoRouter } from './planAcademico.js';
import { evidenciaPedagogicaRouter } from './evidenciaPedagogica.js';
import { calificacionCompetenciaRouter } from './calificacionCompetencia.js';
import { prisma } from '../config/database.js';
export const router = Router();
const requirePortal = (req, res, next) => {
  if (!req.user.roles.some((role) => ['ALUMNO', 'APODERADO'].includes(role)))
    throw new AppError(403, 'FORBIDDEN', 'Este portal está disponible para alumnos y apoderados.');
  next();
};
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(
      new AppError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Demasiados intentos de acceso. Espera 15 minutos antes de volver a intentar.',
      ),
    ),
});
router.get('/health', health.check);
router.get('/instalacion', admin.status);
router.post('/instalacion', loginLimit, validate(setupSchema), admin.initialize);
router.use('/admin', adminRouter);
router.use('/cursos', cursoRouter);
router.use('/competencias', competenciaRouter);
router.use('/calificaciones', calificacionRouter);
router.get('/bimestres', requireAuth, async (_req, res) => {
  const anio = await prisma.anioAcademico.findFirst({
    where: { activo: true },
    include: { bimestres: { where: { activo: true }, orderBy: { numero: 'asc' } } },
  });
  res.json({ data: anio?.bimestres ?? [] });
});
router.use('/reglas-consolidacion', reglaConsolidacionRouter);
router.use('/planes-academicos', planAcademicoRouter);
router.use('/evidencias-pedagogicas', evidenciaPedagogicaRouter);
router.use('/calificaciones-competencias', calificacionCompetenciaRouter);
router.post('/auth/login', loginLimit, validate(loginSchema), auth.login);
router.get('/auth/me', requireAuth, auth.me);
router.put('/auth/contrasena', requireAuth, validate(passwordSchema), auth.cambiarContrasena);
router.post('/auth/logout', requireAuth, auth.logout);
router.get('/horarios', requireAuth, validate(horarioSchema, 'query'), portal.obtenerHorario);
router.get('/portal/estudiantes', requireAuth, requirePortal, portal.obtenerPortal);
router.get(
  '/portal/estudiantes/:id/asistencias',
  requireAuth,
  requirePortal,
  validate(idSchema, 'params'),
  validate(paginaSchema, 'query'),
  portal.obtenerHistorial,
);
router.use('/sesiones', requireAuth, requireRole('DOCENTE'));
router.get('/sesiones', session.list);
router.get('/sesiones/:id', validate(idSchema, 'params'), session.detail);
router.get('/sesiones/:id/alumnos', validate(idSchema, 'params'), session.students);
router.put(
  '/sesiones/:id/asistencias',
  validate(idSchema, 'params'),
  validate(asistenciaSchema),
  session.save,
);
