import { z } from 'zod';
export const horarioSchema = z
  .object({ perfil: z.enum(['DOCENTE', 'ALUMNO']).optional() })
  .strict();
export const paginaSchema = z
  .object({
    pagina: z.coerce.number().int().positive().default(1),
    limite: z.coerce
      .number()
      .int()
      .refine((value) => [10, 25, 50].includes(value))
      .default(10),
  })
  .strict();
export const vinculoSchema = z
  .object({
    apoderadoId: z.number().int().positive(),
    estudianteId: z.number().int().positive(),
    parentesco: z.string().trim().min(1).max(50),
    activo: z.boolean().default(true),
  })
  .strict();
