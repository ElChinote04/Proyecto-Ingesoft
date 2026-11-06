import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { logger, logDirectory } from '../src/logging/logger.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const apoderado = request.agent(app);
// Fechas antiguas para separar estos registros de los que generan las propias pruebas.
const rango = { desde: '2020-01-01', hasta: '2020-01-31' };
const consultar = async (filtros) =>
  (
    await admin
      .get(`${base}/errores`)
      .query({ ...rango, ...filtros })
      .expect(200)
  ).body.data;

async function crearCuenta(identificador, roles, agente) {
  await admin
    .post(`${base}/admin/usuarios`)
    .send({
      numeroDocumento: identificador,
      nombres: identificador,
      apellidos: 'Errores',
      identificador,
      contrasena: 'InicialTemporal123!',
      roles,
    })
    .expect(201);
  await agente
    .post(`${base}/auth/login`)
    .send({ identificador, contrasena: 'InicialTemporal123!' })
    .expect(200);
  await agente
    .put(`${base}/auth/contrasena`)
    .send({ contrasenaActual: 'InicialTemporal123!', nuevaContrasena: clave })
    .expect(200);
  await agente.post(`${base}/auth/login`).send({ identificador, contrasena: clave }).expect(200);
}

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-ERRORES',
      nombres: 'Administrador',
      apellidos: 'Errores',
      identificador: 'admin-errores',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  const adminId = (
    await admin
      .post(`${base}/auth/login`)
      .send({ identificador: 'admin-errores', contrasena: clave })
      .expect(200)
  ).body.data.id;
  await crearCuenta('docente-errores', ['DOCENTE'], docente);
  await crearCuenta('apoderado-errores', ['APODERADO'], apoderado);
  // Se simula una copia rotada: así las pruebas no dependen de cuándo Winston escribe a disco.
  const lineas = [
    {
      level: 'error',
      message: 'Error interno de aplicación',
      module: 'pagos',
      code: 'INTERNAL_ERROR',
      errorType: 'TypeError',
      requestId: 'req-1',
      userId: adminId,
      stackFrames: ['at interno.js:1:1'],
      timestamp: '2020-01-10T15:00:00.000Z',
    },
    {
      level: 'warn',
      message: 'No tienes permiso.',
      module: 'calificaciones',
      code: 'FORBIDDEN',
      requestId: 'req-2',
      timestamp: '2020-01-11T15:00:00.000Z',
    },
    { level: 'info', message: 'Inicio', module: 'auth', timestamp: '2020-01-12T15:00:00.000Z' },
  ].map((linea) => JSON.stringify(linea));
  writeFileSync(
    path.join(logDirectory, 'app1.log'),
    [...lineas, '{"level":"error","message":"incomp'].join('\n'),
  );
});
after(() => prisma.$disconnect());

test('ERR-01 sin sesión no se consulta el log', async () => {
  await request(app).get(`${base}/errores`).expect(401);
});

test('ERR-02 sin el permiso se responde 403', async () => {
  await docente.get(`${base}/errores`).expect(403);
  await apoderado.get(`${base}/errores`).expect(403);
});

test('ERR-03 el permiso solo lo recibe el administrador', async () => {
  const permisos = async (agente) => (await agente.get(`${base}/auth/me`).expect(200)).body.data;
  assert.ok((await permisos(admin)).permisos.includes('errores.consultar'));
  assert.ok(!(await permisos(docente)).permisos.includes('errores.consultar'));
});

test('ERR-04 lista errores y advertencias, del más reciente al más antiguo', async () => {
  const datos = await consultar();
  assert.equal(datos.total, 2);
  assert.deepEqual(datos.registros, [
    {
      fechaHora: '2020-01-11T15:00:00.000Z',
      severidad: 'ADVERTENCIA',
      modulo: 'calificaciones',
      codigo: 'FORBIDDEN',
      descripcion: 'No tienes permiso.',
      usuario: null,
      requestId: 'req-2',
    },
    {
      fechaHora: '2020-01-10T15:00:00.000Z',
      severidad: 'ERROR',
      modulo: 'pagos',
      codigo: 'INTERNAL_ERROR',
      descripcion: 'Error interno de aplicación (TypeError)',
      usuario: 'admin-errores',
      requestId: 'req-1',
    },
  ]);
  assert.ok(datos.codigos.includes('INTERNAL_ERROR'));
});

test('ERR-05 filtra por severidad, código, usuario y fechas', async () => {
  const unico = async (filtros) => (await consultar(filtros)).registros.map((r) => r.requestId);
  assert.deepEqual(await unico({ severidad: 'ERROR' }), ['req-1']);
  assert.deepEqual(await unico({ codigo: 'FORBIDDEN' }), ['req-2']);
  assert.deepEqual(await unico({ usuario: 'admin-errores' }), ['req-1']);
  assert.deepEqual(await unico({ desde: '2020-01-11', hasta: '2020-01-11' }), ['req-2']);
  assert.deepEqual(await unico({ codigo: 'NO_EXISTE' }), []);
});

test('ERR-06 pagina los resultados', async () => {
  // Filas de relleno para llenar una página de 10 sin depender de otros registros.
  const relleno = Array.from({ length: 11 }, (_, indice) =>
    JSON.stringify({
      level: 'warn',
      message: 'Relleno',
      code: 'RELLENO',
      timestamp: `2021-01-01T00:00:${String(indice).padStart(2, '0')}.000Z`,
    }),
  );
  writeFileSync(path.join(logDirectory, 'app2.log'), relleno.join('\n'));
  const filtros = { desde: '2020-12-31', hasta: '2021-01-02' };
  const primera = await consultar({ ...filtros, limite: 10 });
  assert.equal(primera.total, 11);
  assert.equal(primera.registros.length, 10);
  const segunda = await consultar({ ...filtros, limite: 10, pagina: 2 });
  assert.equal(segunda.registros.length, 1);
  assert.equal(segunda.registros[0].fechaHora, '2021-01-01T00:00:00.000Z');
});

test('ERR-07 rechaza filtros inválidos', async () => {
  for (const invalida of [
    { severidad: 'CRITICA' },
    { desde: '10/01/2020' },
    { desde: '2020-02-30' },
    { desde: '2020-02-02', hasta: '2020-02-01' },
    { limite: 7 },
    { pagina: 0 },
    { campoExtra: 'x' },
  ])
    await admin.get(`${base}/errores`).query(invalida).expect(400);
});

test('ERR-08 cada error registra el módulo de la ruta que falló', async (t) => {
  const log = t.mock.method(logger, 'log');
  await admin.get(`${base}/errores`).query({ limite: 7 }).expect(400);
  assert.equal(log.mock.calls.at(-1).arguments[2].module, 'errores');
});
