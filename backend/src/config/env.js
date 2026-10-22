import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
export const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
/**
 * Una variable declarada pero vacía en .env (STRIPE_SECRET_KEY=) llega como
 * cadena vacía, no como ausente, de modo que ni .optional() ni .default() se
 * aplicarían. Esto la convierte en ausente antes de validar.
 */
const vacioEsAusente = (esquema) =>
  z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
    esquema,
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  INITIAL_SETUP_KEY: vacioEsAusente(z.string().min(32).optional()),
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
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(2).max(30).default(5),
  LOGIN_LOCK_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  SESSION_IDLE_SECONDS: z.coerce.number().int().min(60).max(86400).default(1800),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
  // Pasarela de pagos (ADR-002). 'simulada' permite desarrollar y probar sin
  // credenciales; 'stripe' exige las llaves del proveedor.
  PAGOS_PROVEEDOR: z.enum(['simulada', 'stripe']).default('simulada'),
  PAGOS_MONEDA: z.string().length(3).default('PEN'),
  PAGOS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  STRIPE_SECRET_KEY: vacioEsAusente(z.string().min(20).optional()),
  STRIPE_WEBHOOK_SECRET: vacioEsAusente(z.string().min(16).default('secreto_de_pruebas_simulada')),
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
if (env.PAGOS_PROVEEDOR === 'stripe' && !env.STRIPE_SECRET_KEY)
  throw new Error('STRIPE_SECRET_KEY es obligatorio cuando PAGOS_PROVEEDOR=stripe');
if (env.NODE_ENV === 'production' && env.PAGOS_PROVEEDOR !== 'stripe')
  throw new Error('La pasarela simulada no puede usarse en producción');
