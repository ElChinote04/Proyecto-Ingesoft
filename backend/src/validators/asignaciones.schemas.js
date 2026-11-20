import { z } from 'zod';

const id = z.coerce.number().int().positive().max(2147483647);

export const asignacionesQuerySchema = z
  .object({ cursoId: id.optional(), seccionId: id.optional(), matriculaId: id.optional() })
  .strict();
