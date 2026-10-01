import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
export const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.url(),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((v) => !v.startsWith('change_this'), 'Genera un secreto aleatorio'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/)
    .default('1h'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
});
const result = schema.safeParse(process.env);
if (!result.success)
  throw new Error(
    `Configuración inválida: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
  );
export const env = result.data;
if (env.NODE_ENV === 'production' && !env.FRONTEND_URL.startsWith('https://')) {
  throw new Error('FRONTEND_URL debe usar HTTPS en producción');
}
