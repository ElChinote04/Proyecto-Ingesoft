import { z } from 'zod';
import { fechaCalendario } from './bimestres.schemas.js';

const id = z.number().int().positive().max(2147483647);
const idEnTexto = z.coerce.number().int().positive().max(2147483647);
const texto = (etiqueta, max) => z.string().trim().min(1, `Ingresa ${etiqueta}.`).max(max);
const competenciaIds = z
  .array(id)
  .max(30)
  .refine((valores) => new Set(valores).size === valores.length, 'No repitas competencias.');

export const crearPlanSchema = z
  .object({
    asignacionId: id,
    bimestreId: id,
    titulo: texto('el título del plan', 200),
    objetivo: texto('el objetivo del plan', 1000),
    fechaInicio: fechaCalendario.optional(),
    fechaFin: fechaCalendario.optional(),
    competenciaIds: competenciaIds.optional().default([]),
  })
  .strict();

export const modificarPlanSchema = z
  .object({
    titulo: texto('el título del plan', 200).optional(),
    objetivo: texto('el objetivo del plan', 1000).optional(),
    fechaFin: fechaCalendario.nullable().optional(),
    competenciaIds: competenciaIds.optional(),
  })
  .strict()
  .refine((valor) => Object.values(valor).some((dato) => dato !== undefined), {
    message: 'Indica al menos un dato para actualizar.',
  });

export const planesQuerySchema = z
  .object({
    bimestreId: idEnTexto.optional(),
    cursoId: idEnTexto.optional(),
    seccionId: idEnTexto.optional(),
  })
  .strict();
