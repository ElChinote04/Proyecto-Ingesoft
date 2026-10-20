import { z } from 'zod';
const password = z
  .string()
  .min(10, 'Usa al menos 10 caracteres.')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'La contraseña no puede superar 72 bytes.',
  );
export const passwordSchema = z
  .object({
    contrasenaActual: z.string().min(1).max(72),
    nuevaContrasena: password,
  })
  .strict();
