import { z } from 'zod';
import { fechaCalendario } from './bimestres.schemas.js';

const id = z.number().int().positive().max(2147483647);
const idTexto = z.coerce.number().int().positive().max(2147483647);
const titulo = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre de la evaluación.')
  .max(150, 'El nombre admite hasta 150 caracteres.');
const descripcion = z
  .string()
  .trim()
  .max(500, 'La descripción admite hasta 500 caracteres.')
  .transform((valor) => valor || null);
const peso = z
  .number()
  .int('El peso debe ser un número entero.')
  .min(1, 'El peso va de 1 a 5.')
  .max(5, 'El peso va de 1 a 5.');

export const evaluacionesQuerySchema = z
  .object({ seccionId: idTexto, bimestreId: idTexto, cursoId: idTexto.optional() })
  .strict();

export const crearEvaluacionSchema = z
  .object({
    cursoId: id,
    seccionId: id,
    bimestreId: id,
    competenciaId: id,
    titulo,
    descripcion: descripcion.optional(),
    fecha: fechaCalendario,
    peso: peso.optional().default(1),
  })
  .strict();

export const modificarEvaluacionSchema = z
  .object({
    competenciaId: id.optional(),
    titulo: titulo.optional(),
    descripcion: descripcion.optional(),
    fecha: fechaCalendario.optional(),
    peso: peso.optional(),
  })
  .strict()
  .refine((valor) => Object.values(valor).some((dato) => dato !== undefined), {
    message: 'Indica al menos un dato para actualizar.',
  });

export const resultadoParamsSchema = z.object({ id: idTexto, matriculaId: idTexto }).strict();

export const archivoResultadoParamsSchema = z
  .object({ id: idTexto, matriculaId: idTexto, archivoId: idTexto })
  .strict();

function desdeJson(valor) {
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

const textoOpcional = (maximo, campo) =>
  z
    .string()
    .trim()
    .max(maximo, `${campo} admite hasta ${maximo} caracteres.`)
    .transform((valor) => valor || null)
    .optional();

// Llega como multipart: todo es texto. El formato de la nota lo revisa el service para
// responder INVALID_GRADE; aquí solo se exige que la nota vaya con la condición CALIFICADA.
export const resultadoSchema = z
  .object({
    condicion: z.enum(['CALIFICADA', 'NO_RINDIO', 'JUSTIFICADA']),
    nota: z.union([z.string().trim(), z.number()]).optional(),
    motivo: textoOpcional(300, 'El motivo'),
    comentario: textoOpcional(500, 'El comentario'),
    archivosQuitados: z.preprocess(desdeJson, z.array(id).max(3)).optional().default([]),
  })
  .strict()
  .refine((valor) => valor.condicion === 'CALIFICADA' || valor.nota === undefined, {
    message: 'Solo una evaluación calificada lleva nota.',
    path: ['nota'],
  })
  .refine((valor) => valor.condicion === 'JUSTIFICADA' || !valor.motivo, {
    message: 'El motivo solo se indica al justificar.',
    path: ['motivo'],
  });
