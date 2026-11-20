import { z } from 'zod';

export const calificacionQuerySchema = z
  .object({ estudianteId: z.coerce.number().int().positive().optional() })
  .strict();

const id = z.number().int().positive().max(2147483647);
const idRuta = z.coerce.number().int().positive().max(2147483647);

export const motivoCorreccion = z
  .string()
  .trim()
  .min(5, 'Explica el motivo en al menos 5 caracteres.')
  .max(500, 'El motivo admite hasta 500 caracteres.');

// El cuerpo es opcional: el motivo solo se exige con la sección publicada.
export const bajaConMotivoSchema = z
  .object({ motivo: motivoCorreccion.optional() })
  .strict()
  .optional();

export const publicacionQuerySchema = z
  .object({
    pagina: z.coerce.number().int().positive().max(100000).default(1),
    limite: z.coerce
      .number()
      .refine((valor) => [10, 25, 50].includes(valor), 'El límite debe ser 10, 25 o 50.')
      .default(10),
  })
  .strict();

export const publicacionSeccionParamsSchema = z.object({ id: idRuta, seccionId: idRuta });

export const publicacionMasivaSchema = z
  .object({ seccionIds: z.array(id).min(1, 'Elige al menos una sección.').max(200) })
  .strict()
  .refine(({ seccionIds }) => new Set(seccionIds).size === seccionIds.length, {
    path: ['seccionIds'],
    message: 'No repitas secciones.',
  });

export const calificacionAlumnoQuerySchema = z
  .object({ bimestreId: z.coerce.number().int().positive().max(2147483647) })
  .strict();

export const calificacionAlumnoSchema = z
  .object({
    bimestreId: id,
    calificaciones: z
      .array(
        z
          .object({
            competenciaId: id,
            nivelLogro: z.enum(['AD', 'A', 'B', 'C']),
            conclusionDescriptiva: z.string().trim().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1, 'Registra al menos una competencia.')
      .max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.calificaciones.map(({ competenciaId }) => competenciaId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        path: ['calificaciones'],
        message: 'No repitas competencias.',
      });
  });
