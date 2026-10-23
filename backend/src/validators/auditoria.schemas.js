import { z } from 'zod';
import { RESULTADOS_AUDITORIA } from '../services/auditoria.service.js';

const id = z.coerce.number().int().positive().max(2147483647).optional();
const texto = z.string().trim().min(1).max(60).optional();
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.')
  // Descarta fechas inexistentes como 2026-02-30, que Date convertiría a otro día.
  .refine((valor) => {
    const dia = new Date(valor);
    return !Number.isNaN(dia.getTime()) && dia.toISOString().startsWith(valor);
  }, 'La fecha no es válida.')
  .optional();

export const consultaAuditoriaSchema = z
  .object({
    tipoEvento: texto,
    entidad: texto,
    entidadId: id,
    usuarioId: id,
    resultado: z.enum(RESULTADOS_AUDITORIA).optional(),
    desde: fecha,
    hasta: fecha,
    pagina: z.coerce.number().int().positive().max(1000000).default(1),
    limite: z.coerce
      .number()
      .refine((valor) => [10, 25, 50].includes(valor), 'El límite debe ser 10, 25 o 50.')
      .default(10),
  })
  .strict()
  .refine((filtro) => !filtro.desde || !filtro.hasta || filtro.desde <= filtro.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['hasta'],
  });
