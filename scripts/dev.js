import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));

/** Lee backend/.env sin dependencias: solo líneas CLAVE=valor. */
function leerEnv(ruta) {
  try {
    return Object.fromEntries(
      readFileSync(ruta, 'utf8')
        .split(/\r?\n/)
        .map((linea) => linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, clave, valor]) => [clave, valor.replace(/^(['"])(.*)\1$/, '$2')]),
    );
  } catch {
    return {};
  }
}

const aviso = (texto) => console.warn(`\x1b[33m[stripe] ${texto}\x1b[0m`);

const children = [
  spawn(process.execPath, ['--watch', 'src/server.js'], {
    cwd: `${root}/backend`,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost'], {
    cwd: `${root}/frontend`,
    stdio: 'inherit',
  }),
];

/**
 * Con PAGOS_PROVEEDOR=stripe, levanta también `stripe listen` para que los
 * webhooks de Stripe lleguen al backend local y los pagos se confirmen solos.
 * Es opcional: si la CLI de Stripe no está instalada o no hay sesión iniciada,
 * se avisa y el resto sigue funcionando. SAGE_STRIPE_LISTEN=0 lo desactiva.
 */
function iniciarStripeListen() {
  const env = leerEnv(`${root}/backend/.env`);
  if (env.PAGOS_PROVEEDOR !== 'stripe' || process.env.SAGE_STRIPE_LISTEN === '0') return null;

  const version = spawnSync('stripe', ['--version'], { encoding: 'utf8' });
  if (version.error || version.status !== 0) {
    aviso('No se encontró la CLI de Stripe; los pagos no se confirmarán solos.');
    aviso('Instálala (https://docs.stripe.com/stripe-cli) y ejecuta "stripe login" una vez.');
    return null;
  }

  // El secreto con el que firma `stripe listen` debe ser el de backend/.env.
  const secreto = spawnSync('stripe', ['listen', '--print-secret'], { encoding: 'utf8' });
  const whsec = secreto.stdout?.trim();
  if (secreto.status !== 0 || !whsec?.startsWith('whsec_')) {
    aviso('No se pudo usar la CLI de Stripe. Ejecuta "stripe login" y vuelve a iniciar SAGE.');
    return null;
  }
  if (whsec !== env.STRIPE_WEBHOOK_SECRET)
    aviso(
      'STRIPE_WEBHOOK_SECRET de backend/.env no coincide con el de "stripe listen": ' +
        'cópialo de "stripe listen --print-secret" o los webhooks se rechazarán.',
    );

  const destino = `localhost:${env.PORT || 3000}/api/v1/pagos/notificaciones`;
  console.log(`[stripe] Reenviando webhooks a ${destino}`);
  const listen = spawn('stripe', ['listen', '--forward-to', destino], { stdio: 'inherit' });
  // Si `stripe listen` se cae, el backend y el frontend siguen corriendo.
  listen.on('error', () => aviso('No se pudo iniciar "stripe listen".'));
  listen.on('exit', (code) => {
    if (!stopping) aviso(`"stripe listen" terminó (código ${code}); los pagos no se confirmarán solos.`);
  });
  return listen;
}

let stopping = false;
const stripeListen = iniciarStripeListen();
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  children.forEach((child) => child.kill());
  stripeListen?.kill();
}
children.forEach((child) => {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 0));
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
