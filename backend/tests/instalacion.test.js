import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/database.js';
import * as service from '../src/services/adminService.js';
import { logger } from '../src/logging/logger.js';

const original = {
  NODE_ENV: env.NODE_ENV,
  HOST: env.HOST,
  INITIAL_SETUP_KEY: env.INITIAL_SETUP_KEY,
};
const base = '/api/v1/instalacion';
const datos = {
  numeroDocumento: 'ADMIN-LOCAL',
  nombres: 'Administrador',
  apellidos: 'Local',
  identificador: 'admin-local',
  contrasena: 'MiClavePersonal123!',
};
function desarrollo() {
  Object.assign(env, { NODE_ENV: 'development', HOST: '127.0.0.1', INITIAL_SETUP_KEY: undefined });
}
afterEach(() => Object.assign(env, original));
after(async () => {
  await prisma.$disconnect();
  await new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
});

test('INST-01: producción exige clave aunque escuche solo en localhost', async () => {
  env.NODE_ENV = 'production';
  env.HOST = '127.0.0.1';
  const estado = (await request(app).get(base).expect(200)).body.data;
  assert.deepEqual(estado, { requerido: true, requiereClave: true });
  for (const input of [datos, { ...datos, claveInstalacion: 'incorrecta' }]) {
    const respuesta = await request(app).post(base).send(input).expect(403);
    assert.equal(respuesta.body.error.code, 'INVALID_SETUP_KEY');
  }
  assert.equal(await prisma.usuario.count(), 0);
});

test('INST-02: una instalación protegida sin clave configurada rechaza el alta', async () => {
  env.NODE_ENV = 'production';
  env.INITIAL_SETUP_KEY = undefined;
  const respuesta = await request(app).post(base).send(datos).expect(503);
  assert.equal(respuesta.body.error.code, 'SETUP_NOT_CONFIGURED');
  assert.equal(await prisma.usuario.count(), 0);
});

test('INST-03: escuchar en la red conserva la protección incluso en desarrollo', async () => {
  env.NODE_ENV = 'development';
  env.HOST = '0.0.0.0';
  assert.equal((await request(app).get(base).expect(200)).body.data.requiereClave, true);
  await request(app).post(base).set('X-Forwarded-For', '127.0.0.1').send(datos).expect(403);
  assert.equal(await prisma.usuario.count(), 0);
});

test('INST-04: una conexión remota no obtiene la excepción local', async () => {
  env.NODE_ENV = 'development';
  env.HOST = '127.0.0.1';
  assert.equal((await service.setupStatus('198.51.100.40')).requiereClave, true);
  await assert.rejects(
    service.initialize(datos, 'prueba-origen-remoto', '198.51.100.40'),
    (error) => error.status === 403 && error.code === 'INVALID_SETUP_KEY',
  );
  assert.equal(await prisma.usuario.count(), 0);
});

test('INST-05: desarrollo local admite loopback IPv4, IPv6 y mapeado sin clave', async () => {
  desarrollo();
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1'])
    assert.deepEqual(await service.setupStatus(ip), { requerido: true, requiereClave: false });
  assert.deepEqual((await request(app).get(base).expect(200)).body.data, {
    requerido: true,
    requiereClave: false,
  });
});

test('INST-06: dos altas locales sin clave crean un solo administrador, sin seed', async () => {
  desarrollo();
  const respuestas = await Promise.all([1, 2].map(() => request(app).post(base).send(datos)));
  assert.deepEqual(respuestas.map((r) => r.status).sort(), [201, 409]);
  const cuenta = respuestas.find((r) => r.status === 201).body.data;
  assert.deepEqual(cuenta.roles, ['ADMINISTRADOR']);
  assert.equal(cuenta.requiereCambioContrasena, false);
  assert.equal(await prisma.usuario.count(), 1);
  assert.equal(await prisma.instalacion.count(), 1);
  assert.equal(await prisma.rol.count(), 4);
  assert.equal(await prisma.estudiante.count(), 0);
  assert.equal(await prisma.anioAcademico.count(), 0);
  const administrador = request.agent(app);
  await administrador
    .post('/api/v1/auth/login')
    .send({
      identificador: datos.identificador,
      contrasena: datos.contrasena,
    })
    .expect(200);
  await administrador.get('/api/v1/auth/me').expect(200);
});

test('INST-07: el alta inicial queda cerrada sin pedir más claves', async () => {
  desarrollo();
  assert.deepEqual((await request(app).get(base).expect(200)).body.data, {
    requerido: false,
    requiereClave: false,
  });
  const respuesta = await request(app).post(base).send(datos).expect(409);
  assert.equal(respuesta.body.error.code, 'SETUP_COMPLETED');
  assert.equal(await prisma.usuario.count(), 1);
});

test('INST-08: retirar el rol administrador no reabre la instalación completada', async () => {
  desarrollo();
  const rol = await prisma.rol.findUnique({ where: { nombre: 'ADMINISTRADOR' } });
  await prisma.usuarioRol.deleteMany({ where: { rolId: rol.id } });
  assert.equal((await request(app).get(base)).body.data.requerido, false);
  await request(app).post(base).send(datos).expect(409);
  assert.equal(await prisma.usuario.count(), 1);
});
