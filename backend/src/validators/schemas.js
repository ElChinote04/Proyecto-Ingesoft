import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
export const loginSchema = z
  .object({
    identificador: z.string().trim().min(1, 'Ingresa tu usuario o correo.').max(200).toLowerCase(),
    contrasena: z.string().min(1, 'Ingresa tu contraseña.').max(72),
  })
  .strict();
export const idSchema = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const asistenciaSchema = z
  .object({
    version: z.number().int().nonnegative(),
    asistencias: z
      .array(
        z
          .object({
            alumnoId: z.number().int().positive().max(2147483647),
            estado: z.enum(['PRESENTE', 'TARDANZA', 'AUSENTE']),
            observacion: z.string().trim().max(300).default(''),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Los datos enviados no son válidos.',
        result.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      );
    req.validated = { ...req.validated, [source]: result.data };
    next();
  };
}
