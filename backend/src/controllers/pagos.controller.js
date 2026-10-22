import * as service from '../services/pagos.service.js';
import { pasarela } from '../integrations/pasarelaPagos.js';

export const crearPlan = async (req, res) =>
  res.status(201).json({
    data: await service.crearPlanDePago(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req.requestId,
    ),
  });

export const listarBoletas = async (req, res) =>
  res.json({ data: await service.listarBoletas(req.validated.query, req.user) });

export const iniciarPago = async (req, res) =>
  res
    .status(201)
    .json({ data: await service.iniciarPago(req.validated.body, req.user, req.requestId) });

export const obtenerPago = async (req, res) =>
  res.json({ data: await service.obtenerPago(req.validated.params.id, req.user) });

/**
 * Notificación de la pasarela. No lleva sesión de usuario: su control de acceso
 * es la firma del proveedor (ADR-001 y ADR-002). Responde 200 incluso cuando no
 * hay nada que aplicar, porque el proveedor reintenta mientras no reciba acuse
 * de recibo y el reenvío debe ser inofensivo (QAS008).
 */
export const recibirNotificacion = async (req, res) => {
  const evento = pasarela.verificarNotificacion(
    req.rawBody,
    req.get('stripe-signature') ?? req.get('x-sage-firma'),
  );
  const resultado = await service.confirmarDesdeNotificacion(evento, req.requestId);
  res.status(200).json({ data: { recibido: true, ...resultado } });
};

/**
 * Atajo de desarrollo: fija el resultado que devolverá la pasarela simulada y
 * aplica la confirmación, para poder recorrer el flujo a mano sin firmar el
 * webhook. La ruta solo se registra con PAGOS_PROVEEDOR=simulada y fuera de
 * producción; el camino real, con firma verificada, es /pagos/notificaciones.
 */
export const simularResultado = async (req, res) =>
  res.json({
    data: await service.simularResultadoPasarela(
      req.validated.params.id,
      req.validated.body.resultado,
      req.user,
      req.requestId,
    ),
  });
