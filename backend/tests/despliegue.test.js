import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import { app } from '../src/app.js';
import { env, backendRoot } from '../src/config/env.js';
import { prisma } from '../src/config/database.js';
import { logger } from '../src/logging/logger.js';

const login = '/api/v1/auth/login';
const produccion = {
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://sage.example.test',
  PAGOS_PROVEEDOR: 'stripe',
  STRIPE_SECRET_KEY: `sk_test_${'x'.repeat(24)}`,
};

// La configuración se valida al importar, así que cada variante se prueba en un
// proceso propio. La salida se vacía antes de salir para no perder líneas.
function enProceso(codigo, variables) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `${codigo}\nprocess.stdout.write('', () => process.exit(0));`],
    { cwd: backendRoot, env: { ...process.env, ...variables }, encoding: 'utf8', timeout: 20000 },
  );
}

after(async () => {
  app.set('trust proxy', env.TRUST_PROXY);
  await prisma.$disconnect();
  await new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
});

test('DESP-01: TRUST_PROXY configura los saltos de confianza de Express', () => {
  const resultado = enProceso(
    "const { app } = await import('./src/app.js');\nconsole.log(app.get('trust proxy'));",
    { TRUST_PROXY: '2' },
  );
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.equal(resultado.stdout.trim(), '2');
});

test('DESP-02: un TRUST_PROXY inválido impide arrancar', () => {
  for (const valor of ['-1', 'abc', 'true', '1.5', '6']) {
    const resultado = enProceso("await import('./src/config/env.js');", { TRUST_PROXY: valor });
    assert.notEqual(resultado.status, 0, `TRUST_PROXY=${valor} debería rechazarse`);
    assert.match(resultado.stderr, /Configuración inválida: .*TRUST_PROXY/);
  }
});

test('DESP-03: sin proxies de confianza, X-Forwarded-For no evade el límite de acceso', async () => {
  for (let i = 1; i <= 30; i++)
    await request(app).post(login).set('X-Forwarded-For', `198.51.100.${i}`).send({}).expect(400);
  const respuesta = await request(app)
    .post(login)
    .set('X-Forwarded-For', '198.51.100.31')
    .send({})
    .expect(429);
  assert.equal(respuesta.body.error.code, 'TOO_MANY_ATTEMPTS');
});

test('DESP-04: con dos saltos de confianza el límite de acceso es por cliente', async () => {
  app.set('trust proxy', 2);
  try {
    const desde = (ip) =>
      request(app).post(login).set('X-Forwarded-For', `${ip}, 203.0.113.9`).send({});
    for (let i = 0; i < 30; i++) await desde('192.0.2.10').expect(400);
    const bloqueado = await desde('192.0.2.10').expect(429);
    assert.equal(bloqueado.body.error.code, 'TOO_MANY_ATTEMPTS');
    await desde('192.0.2.20').expect(400);
  } finally {
    app.set('trust proxy', env.TRUST_PROXY);
  }
});

test('DESP-05: en producción los registros salen también por la salida estándar', () => {
  const resultado = enProceso(
    "const { logger } = await import('./src/logging/logger.js');\nlogger.info('prueba-consola', { module: 'despliegue' });",
    produccion,
  );
  assert.equal(resultado.status, 0, resultado.stderr);
  const registro = resultado.stdout
    .split('\n')
    .filter((linea) => linea.startsWith('{'))
    .map((linea) => JSON.parse(linea))
    .find((entrada) => entrada.message === 'prueba-consola');
  assert.ok(registro, `Salida recibida: ${resultado.stdout}`);
  assert.equal(registro.level, 'info');
  assert.equal(registro.module, 'despliegue');
  assert.ok(registro.timestamp);
});

test('DESP-06: fuera de producción los registros no salen por consola', () => {
  const resultado = enProceso(
    "const { logger } = await import('./src/logging/logger.js');\nlogger.info('prueba-consola');",
    { NODE_ENV: 'test' },
  );
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.doesNotMatch(resultado.stdout, /prueba-consola/);
});
