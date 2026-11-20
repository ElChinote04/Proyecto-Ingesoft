import { z } from 'zod';

const id = z.coerce.number().int().positive().max(2147483647);
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.')
  // Descarta fechas inexistentes como 2026-02-30, que Date convertiría a otro día.
  .refine((valor) => {
    const dia = new Date(valor);
    return !Number.isNaN(dia.getTime()) && dia.toISOString().startsWith(valor);
  }, 'La fecha no es válida.');

const filtrosAula = {
  anioAcademicoId: id.optional(),
  gradoId: id.optional(),
  seccionId: id.optional(),
};

/** US-008: morosidad por estudiante. */
export const morosidadQuerySchema = z.object(filtrosAula).strict();

const DIAS_MAXIMOS = 3 * 366;

/** US-012: reporte de pagos por periodo, en JSON o como archivo. */
export const reportePagosQuerySchema = z
  .object({
    ...filtrosAula,
    desde: fecha,
    hasta: fecha,
    formato: z.enum(['json', 'pdf', 'xlsx']).default('json'),
  })
  .strict()
  .refine((consulta) => consulta.desde <= consulta.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['hasta'],
  })
  .refine(
    (consulta) => (new Date(consulta.hasta) - new Date(consulta.desde)) / 86400000 <= DIAS_MAXIMOS,
    { message: 'El rango no puede superar tres años.', path: ['hasta'] },
  );
