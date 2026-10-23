import { z } from 'zod';

export const calificacionQuerySchema = z.object({ estudianteId: z.coerce.number().int().positive().optional() }).strict();

export const calificacionContextQuerySchema = z
  .object({ cursoId: z.coerce.number().int().positive(), seccionId: z.coerce.number().int().positive(), bimestreId: z.coerce.number().int().positive(), competenciaId: z.coerce.number().int().positive() })
  .strict();

export const bulkCalificacionSchema = z
  .object({
    cursoId: z.number().int().positive(),
    seccionId: z.number().int().positive(),
    bimestreId: z.number().int().positive(),
    competenciaId: z.number().int().positive(),
    calificaciones: z.array(z.object({ matriculaId: z.number().int().positive(), nivelLogro: z.enum(['AD', 'A', 'B', 'C']) }).strict()).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.calificaciones.map(({ matriculaId }) => matriculaId);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['calificaciones'], message: 'No repitas alumnos.' });
  });
