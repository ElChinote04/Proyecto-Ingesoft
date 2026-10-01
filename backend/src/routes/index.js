import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as auth from '../controllers/authController.js';
import * as session from '../controllers/sessionController.js';
import * as health from '../controllers/healthController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, loginSchema, idSchema, asistenciaSchema } from '../validators/schemas.js';
import { AppError } from '../errors/AppError.js';
export const router = Router();
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
router.post('/auth/login', loginLimit, validate(loginSchema), auth.login);
router.get('/auth/me', requireAuth, auth.me);
router.post('/auth/logout', requireAuth, auth.logout);
router.use('/sesiones', requireAuth, requireRole('DOCENTE'));
router.get('/sesiones', session.list);
router.get('/sesiones/:id', validate(idSchema, 'params'), session.detail);
router.get('/sesiones/:id/alumnos', validate(idSchema, 'params'), session.students);
router.post(
  '/sesiones/:id/asistencias',
  validate(idSchema, 'params'),
  validate(asistenciaSchema),
  session.save,
);
