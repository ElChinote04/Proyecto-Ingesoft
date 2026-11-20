import { z } from 'zod';
import { motivoCorreccion } from './calificacion.schemas.js';
import { fechaCalendario } from './bimestres.schemas.js';

// Los formularios llegan como multipart: todos los campos son texto y se convierten aquí.
const id = z.coerce.number().int().positive().max(2147483647);
const semana = z.coerce.number().int().min(1, 'La semana empieza en 1.').max(60);
const tipo = z.enum(['EXPOSICION', 'EJERCICIO', 'VIDEO', 'AVANCE_PLAN', 'OTRO']);
const titulo = z
  .string()
  .trim()
  .min(1, 'Ingresa el título de la actividad.')
  .max(200, 'El título admite hasta 200 caracteres.');
const descripcion = z
  .string()
  .trim()
  .max(2000, 'La descripción admite hasta 2000 caracteres.')
  .transform((valor) => valor || null);

function desdeJson(valor) {
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

const enlace = z
  .string()
  .trim()
  .max(500, 'Cada enlace admite hasta 500 caracteres.')
  .refine((valor) => {
    try {
      return new URL(valor).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Cada enlace debe ser una dirección https:// válida.');
const enlaces = z.preprocess(
  desdeJson,
  z
    .array(enlace)
    .max(5, 'Puedes registrar hasta 5 enlaces.')
    .refine((valores) => new Set(valores).size === valores.length, 'No repitas enlaces.'),
);
// OCULTA: solo la ve el docente. AHORA: la ven los alumnos desde hoy. PROGRAMADA: desde
// publicadaDesde, que solo se admite en ese caso.
const publicacion = z.enum(['OCULTA', 'AHORA', 'PROGRAMADA']);
const fechaSoloSiProgramada = (valor) =>
  (valor.publicacion === 'PROGRAMADA') === (valor.publicadaDesde !== undefined);
const avisoFecha = {
  message: 'Indica la fecha de publicación solo al programarla.',
  path: ['publicadaDesde'],
};

export const crearEvidenciaPedagogicaSchema = z
  .object({
    planId: id,
    numeroSemana: semana,
    tipo,
    titulo,
    descripcion: descripcion.optional(),
    enlaces: enlaces.optional().default([]),
    publicacion: publicacion.optional().default('OCULTA'),
    publicadaDesde: fechaCalendario.optional(),
    motivo: motivoCorreccion.optional(),
  })
  .strict()
  .refine(fechaSoloSiProgramada, avisoFecha);

// Sin refine de "al menos un dato": los archivos nuevos llegan aparte, en req.files.
export const modificarEvidenciaPedagogicaSchema = z
  .object({
    numeroSemana: semana.optional(),
    tipo: tipo.optional(),
    titulo: titulo.optional(),
    descripcion: descripcion.optional(),
    enlaces: enlaces.optional(),
    publicacion: publicacion.optional(),
    publicadaDesde: fechaCalendario.optional(),
    motivo: motivoCorreccion.optional(),
  })
  .strict()
  .refine(
    (valor) =>
      valor.publicacion === undefined
        ? valor.publicadaDesde === undefined
        : fechaSoloSiProgramada(valor),
    avisoFecha,
  );

export const revisarEvidenciaPedagogicaSchema = z
  .object({
    estadoRevision: z.enum(['OBSERVADA', 'VALIDADA']),
    observacionesRevision: z
      .string()
      .trim()
      .max(2000, 'Las observaciones admiten hasta 2000 caracteres.')
      .transform((valor) => valor || null)
      .optional(),
  })
  .strict()
  .refine((valor) => valor.estadoRevision !== 'OBSERVADA' || valor.observacionesRevision, {
    message: 'Explica qué debe corregir el docente.',
    path: ['observacionesRevision'],
  });

export const evidenciasPedagogicasQuerySchema = z
  .object({
    planId: id.optional(),
    numeroSemana: semana.optional(),
    matriculaId: id.optional(),
    cursoId: id.optional(),
    bimestreId: id.optional(),
  })
  .strict();

export const archivoEvidenciaPedagogicaParamsSchema = z.object({ id, archivoId: id }).strict();

export const motivoOpcionalSchema = z
  .object({ motivo: motivoCorreccion.optional() })
  .strict()
  .optional();
