import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import * as schemas from '../validators/pagos.schemas.js';
import * as controller from '../controllers/pagos.controller.js';
import { env } from '../config/env.js';

export const pagosRouter = Router();

// La notificación de la pasarela se declara antes de requireAuth: llega desde
// otro origen y no puede presentar la cookie de sesión. Su control de acceso es
// la verificación de la firma dentro del controlador.
pagosRouter.post('/pagos/notificaciones', controller.recibirNotificacion);

// US-006 — emitir el compromiso de pago sobre una matrícula existente.
pagosRouter.post(
  '/matriculas/:id/plan-pago',
  requireAuth,
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(schemas.crearPlanSchema),
  controller.crearPlan,
);

// US-007A — historial de boletas. El alcance lo resuelve el servicio según el rol.
pagosRouter.get(
  '/compromisos-pago',
  requireAuth,
  validate(schemas.boletasQuerySchema, 'query'),
  controller.listarBoletas,
);

// US-007B — iniciar y consultar el pago de una boleta.
pagosRouter.post(
  '/pagos',
  requireAuth,
  validate(schemas.iniciarPagoSchema),
  controller.iniciarPago,
);
pagosRouter.get('/pagos/:id', requireAuth, validate(idSchema, 'params'), controller.obtenerPago);

// Atajo de desarrollo para recorrer el flujo a mano: fija el resultado de la
// pasarela simulada y aplica la confirmación sin tener que firmar el webhook.
// No existe en producción ni con un proveedor real.
if (env.PAGOS_PROVEEDOR === 'simulada' && env.NODE_ENV !== 'production')
  pagosRouter.post(
    '/pagos/:id/simular',
    requireAuth,
    validate(idSchema, 'params'),
    validate(schemas.simularSchema),
    controller.simularResultado,
  );
