import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { registrarTransaccionCritica } from '../src/services/auditoria.service.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
let adminId;
const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const consultar = async (filtros) =>
  (await admin.get(`${base}/admin/auditoria`).query(filtros).expect(200)).body.data;
const cambioDeNota = {
  evento: 'NOTA_MODIFICADA',
  entidad: 'Calificacion',
  entidadId: 1,
  anterior: { nivelLogro: 'B' },
  nuevo: { nivelLogro: 'A' },
  motivo: 'Rectificación aprobada',
  requestId: 'req-prueba-auditoria',
};

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-AUDITORIA',
      nombres: 'Administrador',
      apellidos: 'Auditoría',
      identificador: 'admin-auditoria',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  adminId = (
    await admin
      .post(`${base}/auth/login`)
      .send({ identificador: 'admin-auditoria', contrasena: clave })
      .expect(200)
  ).body.data.id;
  // Cuenta docente con la contraseña inicial ya cambiada, para probar el 403 por rol.
  await admin
    .post(`${base}/admin/usuarios`)
    .send({
      numeroDocumento: 'DOC-AUDITORIA',
      nombres: 'Docente',
      apellidos: 'Auditoría',
      identificador: 'docente-auditoria',
      contrasena: 'InicialTemporal123!',
      roles: ['DOCENTE'],
    })
    .expect(201);
  await docente
    .post(`${base}/auth/login`)
    .send({ identificador: 'docente-auditoria', contrasena: 'InicialTemporal123!' })
    .expect(200);
  await docente
    .put(`${base}/auth/contrasena`)
    .send({ contrasenaActual: 'InicialTemporal123!', nuevaContrasena: clave })
    .expect(200);
  await docente
    .post(`${base}/auth/login`)
    .send({ identificador: 'docente-auditoria', contrasena: clave })
    .expect(200);
});
after(() => prisma.$disconnect());

test('AUD-01 un cambio de nota queda registrado con usuario, fecha, valores y motivo', async () => {
  await prisma.$transaction((db) =>
    registrarTransaccionCritica(db, { actorId: adminId, ...cambioDeNota }),
  );
  const [registro] = (await consultar({ tipoEvento: 'NOTA_MODIFICADA' })).registros;
  assert.equal(registro.usuario, 'admin-auditoria');
  assert.equal(registro.entidad, 'Calificacion');
  assert.equal(registro.resultado, 'EXITO');
  assert.equal(registro.requestId, 'req-prueba-auditoria');
  assert.ok(registro.fechaHora);
  assert.deepEqual(registro.detalle, {
    anterior: { nivelLogro: 'B' },
    nuevo: { nivelLogro: 'A' },
    motivo: 'Rectificación aprobada',
  });
});

test('AUD-02 si la operación falla, su auditoría tampoco se guarda', async () => {
  const antes = await prisma.registroAuditoria.count();
  await assert.rejects(
    prisma.$transaction(async (db) => {
      await registrarTransaccionCritica(db, { actorId: adminId, ...cambioDeNota });
      throw new Error('Falla simulada de la operación');
    }),
  );
  assert.equal(await prisma.registroAuditoria.count(), antes);
});

test('AUD-03 rechaza eventos desconocidos y modificaciones sin motivo o valores', async () => {
  const registrar = (datos) =>
    prisma.$transaction((db) => registrarTransaccionCritica(db, { actorId: adminId, ...datos }));
  await assert.rejects(registrar({ ...cambioDeNota, evento: 'NOTA_BORRADA' }), /EVENTOS_CRITICOS/);
  await assert.rejects(registrar({ ...cambioDeNota, motivo: '  ' }), /motivo/);
  await assert.rejects(registrar({ ...cambioDeNota, anterior: null }), /anterior/);
  // Un alta no exige valor anterior ni motivo.
  await registrar({
    evento: 'PAGO_INICIADO',
    entidad: 'Pago',
    entidadId: 7,
    nuevo: { monto: 350 },
  });
  assert.equal((await consultar({ tipoEvento: 'PAGO_INICIADO' })).total, 1);
});

test('AUD-04 los registros de auditoría no se pueden editar ni borrar', async () => {
  const [registro] = (await consultar({ tipoEvento: 'NOTA_MODIFICADA' })).registros;
  await assert.rejects(
    prisma.registroAuditoria.update({ where: { id: registro.id }, data: { detalle: {} } }),
  );
  await assert.rejects(prisma.registroAuditoria.delete({ where: { id: registro.id } }));
  await admin.delete(`${base}/admin/auditoria/${registro.id}`).expect(404);
});

test('AUD-05 solo el administrador consulta la auditoría', async () => {
  await request(app).get(`${base}/admin/auditoria`).expect(401);
  await docente.get(`${base}/admin/auditoria`).expect(403);
});

test('AUD-06 filtros, paginación y validación de la consulta', async () => {
  const pagina = await consultar({ limite: 10 });
  assert.equal(pagina.pagina, 1);
  assert.ok(pagina.registros.length <= 10);
  assert.ok(pagina.tiposEvento.includes('NOTA_MODIFICADA'));
  assert.equal((await consultar({ entidad: 'Pago' })).total, 1);
  assert.equal((await consultar({ resultado: 'DENEGADO', tipoEvento: 'PAGO_INICIADO' })).total, 0);
  assert.ok((await consultar({ desde: hoyLima, hasta: hoyLima })).total > 0);
  assert.equal((await consultar({ desde: '2099-01-01' })).total, 0);
  for (const invalida of [
    { limite: 7 },
    { desde: '2026-02-30' },
    { desde: '2026-10-20', hasta: '2026-10-01' },
    { resultado: 'OTRO' },
    { campoExtra: 'x' },
  ])
    await admin.get(`${base}/admin/auditoria`).query(invalida).expect(400);
});
