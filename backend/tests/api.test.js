import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { seed } from '../prisma/seed.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { logger, logDirectory } from '../src/logging/logger.js';
const base = '/api/v1';
const teacher = request.agent(app);
let sessionId, user, students, outsider, otherSession;
const credentials = { identificador: 'docente@sage.local', contrasena: process.env.DEMO_PASSWORD };
before(async () => {
  const result = await seed(prisma);
  sessionId = result.sesionId;
  user = await prisma.usuario.findUnique({ where: { identificador: credentials.identificador } });
  const person = await prisma.persona.create({
    data: { numeroDocumento: 'TEST-OUTSIDE', nombres: 'Otro', apellidos: 'Alumno' },
  });
  outsider = await prisma.estudiante.create({
    data: { personaId: person.id, codigoEstudiante: 'TEST-OUT' },
  });
  const anotherPerson = await prisma.persona.create({
    data: { numeroDocumento: 'TEST-TEACHER', nombres: 'Otro', apellidos: 'Docente' },
  });
  const anotherTeacher = await prisma.docente.create({
    data: { personaId: anotherPerson.id, codigoDocente: 'TEST-DOC' },
  });
  const original = await prisma.sesionClase.findUnique({
    where: { id: sessionId },
    include: { bloque: { include: { asignacion: true } } },
  });
  const assignment = await prisma.cursoSeccionDocente.create({
    data: {
      cursoId: original.bloque.asignacion.cursoId,
      seccionId: original.bloque.asignacion.seccionId,
      docenteId: anotherTeacher.id,
    },
  });
  const block = await prisma.cursoSeccionDocenteAula.create({
    data: {
      asignacionId: assignment.id,
      aulaId: original.bloque.aulaId,
      diaSemana: 5,
      horaInicio: '10:00',
      horaFin: '10:45',
    },
  });
  otherSession = await prisma.sesionClase.create({
    data: { bloqueId: block.id, fecha: original.fecha, horaInicio: '10:00', horaFin: '10:45' },
  });
});
after(async () => {
  await prisma.$disconnect();
  await new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
});
test('01 health consulta PostgreSQL', async () => {
  const r = await request(app).get(`${base}/health`).expect(200);
  assert.deepEqual(r.body, { status: 'ok', database: 'connected' });
});
test('02 login devuelve usuario seguro y cookie HttpOnly', async () => {
  const r = await teacher.post(`${base}/auth/login`).send(credentials).expect(200);
  assert.equal(r.body.data.nombre, 'Ana Torres');
  assert.ok(r.body.data.roles.includes('DOCENTE'));
  assert.equal(r.body.data.hashContrasena, undefined);
  assert.equal(r.body.token, undefined);
  assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  assert.match(r.headers['set-cookie'][0], /SameSite=Lax/);
  assert.ok(await bcrypt.compare(credentials.contrasena, user.hashContrasena));
});
test('03 rechaza contraseña incorrecta e identificador inexistente', async () => {
  for (const body of [
    { ...credentials, contrasena: 'incorrecta' },
    { ...credentials, identificador: 'noexiste@sage.local' },
  ]) {
    const r = await request(app).post(`${base}/auth/login`).send(body).expect(401);
    assert.equal(r.body.error.code, 'INVALID_CREDENTIALS');
  }
});
test('04 rechaza lecturas y escritura sin autenticación', async () => {
  await request(app).get(`${base}/sesiones`).expect(401);
  await request(app).post(`${base}/sesiones/${sessionId}/asistencias`).send({}).expect(401);
});
test('05 apoderado autenticado recibe 403', async () => {
  const guardian = request.agent(app);
  await guardian
    .post(`${base}/auth/login`)
    .send({ ...credentials, identificador: 'apoderado@sage.local' })
    .expect(200);
  await guardian.get(`${base}/sesiones`).expect(403);
  await guardian.post(`${base}/sesiones/${sessionId}/asistencias`).send({}).expect(403);
});
test('06 lista y consulta solo sesiones propias', async () => {
  const list = await teacher.get(`${base}/sesiones`).expect(200);
  assert.equal(list.body.data.length, 1);
  const r = await teacher.get(`${base}/sesiones/${sessionId}`).expect(200);
  assert.equal(r.body.data.curso.nombre, 'Matemática');
  assert.equal(r.body.data.seccion.nombre, '3.° B');
  await teacher.get(`${base}/sesiones/${otherSession.id}`).expect(403);
  await teacher
    .post(`${base}/sesiones/${otherSession.id}/asistencias`)
    .send({ version: 0, asistencias: [{ alumnoId: 1, estado: 'PRESENTE' }] })
    .expect(403);
});
test('07 obtiene cinco alumnos matriculados desde PostgreSQL', async () => {
  const r = await teacher.get(`${base}/sesiones/${sessionId}/alumnos`).expect(200);
  students = r.body.data.alumnos;
  assert.equal(students.length, 5);
  assert.equal(students[0].nombre, 'Carlos Mendoza');
  assert.ok(students.every((s) => s.estado === null));
});
const attendance = () =>
  students.map((s, i) => ({
    alumnoId: s.alumnoId,
    estado: ['PRESENTE', 'TARDANZA', 'AUSENTE'][i % 3],
    observacion: i === 1 ? 'Llegó a las 08:12' : '',
  }));
test('08 guarda en una transacción con trazabilidad', async () => {
  const r = await teacher
    .post(`${base}/sesiones/${sessionId}/asistencias`)
    .send({ version: 0, asistencias: attendance() })
    .expect(200);
  assert.equal(r.body.data.total, 5);
  assert.equal(r.body.data.version, 1);
  assert.deepEqual(r.body.data.resumen, { PRESENTE: 2, TARDANZA: 2, AUSENTE: 1 });
  assert.equal(await prisma.asistenciaEstudiante.count(), 5);
  assert.equal(await prisma.registroAuditoria.count(), 1);
});
test('09 rechaza estado fuera del enum', async () => {
  const records = attendance();
  records[0].estado = 'JUSTIFICADA';
  await teacher
    .post(`${base}/sesiones/${sessionId}/asistencias`)
    .send({ version: 1, asistencias: records })
    .expect(400);
});
test('10 rechaza alumno sin matrícula de la sección sin escritura parcial', async () => {
  const records = attendance();
  records[0].alumnoId = outsider.id;
  const r = await teacher
    .post(`${base}/sesiones/${sessionId}/asistencias`)
    .send({ version: 1, asistencias: records })
    .expect(400);
  assert.equal(r.body.error.code, 'STUDENT_NOT_ENROLLED');
  assert.equal(await prisma.asistenciaEstudiante.count(), 5);
});
test('11 recupera estados y observación guardados', async () => {
  const r = await teacher.get(`${base}/sesiones/${sessionId}/alumnos`).expect(200);
  assert.equal(r.body.data.sesion.version, 1);
  assert.deepEqual(
    r.body.data.alumnos.map((s) => s.estado),
    attendance().map((a) => a.estado),
  );
  assert.equal(r.body.data.alumnos[1].observacion, 'Llegó a las 08:12');
});
test('12 evita duplicados y versiones desactualizadas', async () => {
  await teacher
    .post(`${base}/sesiones/${sessionId}/asistencias`)
    .send({ version: 1, asistencias: [...attendance(), attendance()[0]] })
    .expect(409);
  await teacher
    .post(`${base}/sesiones/${sessionId}/asistencias`)
    .send({ version: 0, asistencias: attendance() })
    .expect(409);
  await teacher
    .post(`${base}/sesiones/${sessionId}/asistencias`)
    .send({ version: 1, asistencias: attendance() })
    .expect(200);
  assert.equal(await prisma.asistenciaEstudiante.count(), 5);
});
test('13 rechaza lista vacía, incompleta, IDs inválidos y datos extra', async () => {
  for (const asistencias of [[], attendance().slice(0, 2), [{ alumnoId: -1, estado: 'PRESENTE' }]])
    await teacher
      .post(`${base}/sesiones/${sessionId}/asistencias`)
      .send({ version: 2, asistencias })
      .expect(400);
  await teacher.get(`${base}/sesiones/no-numero`).expect(400);
  await teacher.get(`${base}/sesiones/2147483647`).expect(404);
  await request(app).post(`${base}/auth/login`).send({}).expect(400);
  await request(app)
    .post(`${base}/auth/login`)
    .send({ ...credentials, roles: ['ADMINISTRADOR'] })
    .expect(400);
});
test('14 dos guardados simultáneos: uno exitoso y otro conflicto', async () => {
  const responses = await Promise.all(
    [1, 2].map(() =>
      teacher
        .post(`${base}/sesiones/${sessionId}/asistencias`)
        .send({ version: 2, asistencias: attendance() }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await prisma.asistenciaEstudiante.count(), 5);
});
test('15 admite varios roles para una misma persona', async () => {
  const rol = await prisma.rol.findUnique({ where: { nombre: 'APODERADO' } });
  await prisma.usuarioRol.create({ data: { usuarioId: user.id, rolId: rol.id } });
  const r = await teacher.get(`${base}/auth/me`).expect(200);
  assert.deepEqual(r.body.data.roles.sort(), ['APODERADO', 'DOCENTE']);
  await teacher.get(`${base}/sesiones`).expect(200);
});
test('16 bloquea cuentas desactivadas y tokens vencidos/manipulados', async () => {
  await prisma.usuario.update({ where: { id: user.id }, data: { activo: false } });
  await teacher.get(`${base}/auth/me`).expect(401);
  await request(app).post(`${base}/auth/login`).send(credentials).expect(401);
  await prisma.usuario.update({ where: { id: user.id }, data: { activo: true } });
  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: -10,
    issuer: 'sage-api',
    audience: 'sage-web',
  });
  await request(app).get(`${base}/auth/me`).set('Cookie', `sage_session=${token}`).expect(401);
  await request(app).get(`${base}/auth/me`).set('Cookie', 'sage_session=manipulado').expect(401);
});
test('17 CORS permite solo el frontend configurado y procesa JSON inválido', async () => {
  const r = await request(app)
    .options(`${base}/auth/login`)
    .set('Origin', env.FRONTEND_URL)
    .set('Access-Control-Request-Method', 'POST')
    .expect(204);
  assert.equal(r.headers['access-control-allow-credentials'], 'true');
  await request(app)
    .post(`${base}/auth/login`)
    .set('Origin', 'https://evil.example')
    .send(credentials)
    .expect(403);
  await request(app)
    .post(`${base}/auth/login`)
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
  await request(app).get(`${base}/ruta-inexistente`).expect(404);
});
test('18 seed repetido conserva asistencias y no duplica alumnos', async () => {
  await seed(prisma);
  assert.equal(await prisma.asistenciaEstudiante.count(), 5);
  assert.equal(await prisma.matricula.count(), 5);
});
test('19 logout elimina cookie y revoca JWT en PostgreSQL', async () => {
  const r = await teacher.post(`${base}/auth/login`).send(credentials).expect(200);
  const cookie = r.headers['set-cookie'][0].split(';')[0];
  const out = await teacher.post(`${base}/auth/logout`).expect(200);
  assert.match(out.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  await request(app).get(`${base}/auth/me`).set('Cookie', cookie).expect(401);
  await teacher.get(`${base}/sesiones`).expect(401);
});
test('20 error 500 centralizado, logs físicos sin secretos', async () => {
  const probe = express();
  probe.get('/failure', () => {
    throw new Error('sensitive-test-string');
  });
  probe.use(errorHandler);
  const r = await request(probe).get('/failure').expect(500);
  assert.equal(r.body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(r.body).includes('sensitive-test-string'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const appLog = readFileSync(path.join(logDirectory, 'app.log'), 'utf8');
  const errorLog = readFileSync(path.join(logDirectory, 'error.log'), 'utf8');
  for (const value of ['Login exitoso', 'Login fallido', 'Asistencia guardada'])
    assert.ok(appLog.includes(value));
  assert.ok(errorLog.includes('Error interno de aplicación'));
  for (const secret of [
    credentials.contrasena,
    user.hashContrasena,
    env.JWT_SECRET,
    'sensitive-test-string',
  ])
    assert.ok(!appLog.includes(secret));
});
