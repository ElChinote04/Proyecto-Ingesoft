import { z } from 'zod';

const id = z.coerce.number().int().positive().max(2147483647);
const titulo = z
  .string()
  .trim()
  .min(1, 'Ingresa el título de la evidencia.')
  .max(120, 'El título admite hasta 120 caracteres.');
const descripcion = z
  .string()
  .trim()
  .max(2000, 'La descripción admite hasta 2000 caracteres.')
  .transform((valor) => valor || null);

export const crearEvidenciaSchema = z
  .object({ titulo, descripcion: descripcion.optional() })
  .strict();

export const modificarEvidenciaSchema = z
  .object({ titulo: titulo.optional(), descripcion: descripcion.nullable().optional() })
  .strict()
  .refine((valor) => valor.titulo !== undefined || valor.descripcion !== undefined, {
    message: 'Indica al menos un dato para actualizar.',
  });

export const archivoEvidenciaParamsSchema = z.object({ id, archivoId: id });
