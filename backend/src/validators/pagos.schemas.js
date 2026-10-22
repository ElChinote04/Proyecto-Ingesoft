import { z } from 'zod';

const id = z.number().int().positive().max(2147483647);

/** Monto en soles con dos decimales como máximo, recibido siempre como texto
 *  para no perder precisión en el transporte JSON. */
const monto = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'El monto debe tener como máximo dos decimales.');

/** Cronograma pactado al matricular (US-006). */
export const planPagoSchema = z
  .object({
    montoPension: monto,
    numeroCuotas: z.number().int().min(1).max(12),
    diaVencimiento: z.number().int().min(1).max(28),
    mesInicio: z.number().int().min(1).max(12),
    concepto: z.string().trim().min(1).max(60).default('Pensión'),
  })
  .strict();

/** Alta del plan sobre una matrícula existente. */
export const crearPlanSchema = planPagoSchema;

/** Inicio del pago de una boleta (US-007B). El apoderado solo envía la boleta:
 *  el monto, el estudiante y el estado los resuelve el servidor. */
export const iniciarPagoSchema = z.object({ compromisoPagoId: id }).strict();

/** Consulta del historial de boletas (US-007A). */
export const boletasQuerySchema = z
  .object({
    estudianteId: z.coerce.number().int().positive().max(2147483647).optional(),
    estado: z.enum(['PENDIENTE', 'PAGADA', 'MOROSA', 'ANULADA']).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
