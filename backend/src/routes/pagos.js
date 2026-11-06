import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idSchema } from '../validators/schemas.js';
import * as schemas from '../validators/pagos.schemas.js';
import * as controller from '../controllers/pagos.controller.js';
import * as cobranza from '../controllers/cobranza.controller.js';
import * as cobranzaSchemas from '../validators/cobranza.schemas.js';
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

// US-009 — comprobante en PDF de una boleta pagada.
pagosRouter.get(
  '/compromisos-pago/:id/comprobante',
  requireAuth,
  validate(idSchema, 'params'),
  controller.descargarComprobante,
);

// US-010 — pago fraccionado de una boleta pendiente.
pagosRouter.post(
  '/compromisos-pago/:id/fracciones',
  requireAuth,
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(schemas.fraccionarSchema),
  controller.fraccionarBoleta,
);

// US-007B — iniciar y consultar el pago de una boleta.
pagosRouter.post(
  '/pagos',
  requireAuth,
  validate(schemas.iniciarPagoSchema),
  controller.iniciarPago,
);
pagosRouter.get('/pagos/:id', requireAuth, validate(idSchema, 'params'), controller.obtenerPago);
// Da de baja un intento que el apoderado abandonó en la pasarela, para que
// pueda volver a pagar la misma boleta sin esperar a que el proveedor lo expire.
pagosRouter.delete(
  '/pagos/:id',
  requireAuth,
  validate(idSchema, 'params'),
  controller.cancelarPago,
);

// US-013 — el administrador anula un pago confirmado que se registró por error.
pagosRouter.put(
  '/pagos/:id/anulacion',
  requireAuth,
  requireRole('ADMINISTRADOR'),
  validate(idSchema, 'params'),
  validate(schemas.anulacionSchema),
  controller.anularPago,
);

// US-008 — estudiantes con pensiones morosas, para la cobranza.
pagosRouter.get(
  '/reportes/pagos/morosidad',
  requireAuth,
  requireRole('ADMINISTRADOR'),
  validate(cobranzaSchemas.morosidadQuerySchema, 'query'),
  cobranza.obtenerMorosidad,
);

// US-012 — reporte de pagos por periodo; ?formato=pdf|xlsx lo descarga.
pagosRouter.get(
  '/reportes/pagos',
  requireAuth,
  requireRole('ADMINISTRADOR'),
  validate(cobranzaSchemas.reportePagosQuerySchema, 'query'),
  cobranza.obtenerReporte,
);

// US-011 — boletas de los estudiantes a cargo que están por vencer.
pagosRouter.get(
  '/avisos-vencimiento',
  requireAuth,
  requireRole('APODERADO'),
  cobranza.obtenerAvisos,
);

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
