import { z } from 'zod';

export const calificacionQuerySchema = z
  .object({ estudianteId: z.coerce.number().int().positive().optional() })
  .strict();

const id = z.number().int().positive().max(2147483647);

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
