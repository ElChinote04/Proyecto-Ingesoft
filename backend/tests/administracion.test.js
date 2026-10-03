import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { userFormBody } from '../../frontend/src/utils/userForm.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { logger, logDirectory } from '../src/logging/logger.js';

const base = '/api/v1';
const admin = request.agent(app),
  teacher = request.agent(app),
  secondTeacher = request.agent(app);
const password = 'PruebaFlujo123!';
const initial = {
  numeroDocumento: 'ADMIN-01',
  nombres: 'María',
  apellidos: 'Dirección',
  identificador: 'admin@prueba.local',
  contrasena: password,
  claveInstalacion: env.INITIAL_SETUP_KEY,
};
const teacherInput = {
  numeroDocumento: 'DOC-01',
  nombres: 'Elena',
  apellidos: 'Pérez',
  identificador: 'docente@prueba.local',
  contrasena: password,
  roles: ['DOCENTE', 'APODERADO'],
  activo: true,
};
let adminUser,
  teacherUser,
  otherTeacher,
  year,
  grade,
  section,
  otherSection,
  course,
  room,
  otherRoom,
  student,
  enrollment,
  block,
  session;
const post = (url, body, status = 201) =>
  admin.post(`${base}/admin/${url}`).send(body).expect(status);
// Usa el mismo contrato de FormData que la pantalla para probar altas y ediciones.
function accountForm(values, editing = false) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (key === 'activo') {
      if (value) form.append(key, 'on');
    } else if (Array.isArray(value)) value.forEach((item) => form.append(key, item));
    else form.append(key, String(value));
  }
  return userFormBody(form, editing);
}
const edit = (u, changes = {}) =>
  admin.put(`${base}/admin/usuarios/${u.id}`).send(accountForm({ ...u, ...changes }, true));

after(async () => {
  await prisma.$disconnect();
  if (!logger.writableEnded)
    await new Promise((resolve) => {
      logger.on('finish', resolve);
      logger.end();
    });
});

test('01 inicia en base vacía y protege la creación del administrador', async () => {
  assert.equal(await prisma.usuario.count(), 0);
  assert.equal(await prisma.rol.count(), 0);
  assert.equal(await prisma.anioAcademico.count(), 0);
  assert.equal(
    (await request(app).get(`${base}/instalacion`).expect(200)).body.data.requerido,
    true,
  );
  await request(app)
    .post(`${base}/instalacion`)
    .send({ ...initial, claveInstalacion: 'incorrecta' })
    .expect(403);
  assert.equal(await prisma.usuario.count(), 0);
  await request(app).get(`${base}/admin/usuarios`).expect(401);
});
test('02 instalación simultánea crea exactamente un administrador y cierra el alta pública', async () => {
  const results = await Promise.all(
    [1, 2].map(() => request(app).post(`${base}/instalacion`).send(initial)),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  adminUser = results.find((r) => r.status === 201).body.data;
  assert.equal(await prisma.usuario.count(), 1);
  assert.equal(await prisma.instalacion.count(), 1);
  assert.equal(await prisma.rol.count(), 4);
  assert.equal((await request(app).get(`${base}/instalacion`)).body.data.requerido, false);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: initial.identificador, contrasena: password })
    .expect(200);
});
test('03 crea usuario multirrol, perfil docente y contraseña segura', async () => {
  teacherUser = (await post('usuarios', accountForm(teacherInput))).body.data;
  assert.deepEqual(teacherUser.roles.sort(), ['APODERADO', 'DOCENTE']);
  assert.ok(teacherUser.docenteId);
  const stored = await prisma.usuario.findUnique({
    where: { id: teacherUser.id },
    include: { roles: true, persona: { include: { docente: true } } },
  });
  assert.equal(stored.roles.length, 2);
  assert.equal('version' in teacherUser, false);
  assert.equal('version' in stored, false);
  assert.equal(stored.persona.docente.id, teacherUser.docenteId);
  assert.ok(await bcrypt.compare(password, stored.hashContrasena));
  assert.equal(teacherUser.hashContrasena, undefined);
});
test('04 duplicados y datos inválidos no dejan personas o perfiles huérfanos', async () => {
  const people = await prisma.persona.count();
  for (const input of [teacherInput, { ...teacherInput, identificador: 'otro@prueba.local' }])
    await post('usuarios', input, 409);
  for (const input of [
    { ...teacherInput, roles: [] },
    { ...teacherInput, roles: ['DOCENTE', 'DOCENTE'] },
    { ...teacherInput, contrasena: 'á'.repeat(40) },
    { ...teacherInput, contrasena: 'corta' },
    { ...teacherInput, hashContrasena: 'inyectado' },
  ])
    await post('usuarios', input, 400);
  assert.equal(await prisma.persona.count(), people);
  assert.equal(await prisma.docente.count(), 1);
});
test('05 el docente inicia sesión, todavía sin clases, y no administra', async () => {
  const r = await teacher
    .post(`${base}/auth/login`)
    .send({ identificador: teacherInput.identificador, contrasena: password })
    .expect(200);
  assert.equal(r.body.data.docenteId, teacherUser.docenteId);
  assert.deepEqual((await teacher.get(`${base}/sesiones`).expect(200)).body.data, []);
  for (const route of ['usuarios', 'catalogos', 'estudiantes', 'horarios', 'auditoria'])
    await teacher.get(`${base}/admin/${route}`).expect(403);
  await teacher.post(`${base}/admin/usuarios`).send(teacherInput).expect(403);
});
test('06 crea todos los catálogos académicos por API, sin seed', async () => {
  year = (await post('catalogos/anios', { codigo: '2026' })).body.data;
  grade = (await post('catalogos/grados', { nombre: '3.°' })).body.data;
  section = (
    await post('catalogos/secciones', { nombre: 'B', gradoId: grade.id, anioAcademicoId: year.id })
  ).body.data;
  otherSection = (
    await post('catalogos/secciones', { nombre: 'C', gradoId: grade.id, anioAcademicoId: year.id })
  ).body.data;
  course = (await post('catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' })).body.data;
  room = (await post('catalogos/aulas', { codigo: 'A203' })).body.data;
  otherRoom = (await post('catalogos/aulas', { codigo: 'A204' })).body.data;
  await post('catalogos/anios', { codigo: '2026' }, 409);
  await post(
    'catalogos/secciones',
    { nombre: 'B', gradoId: 2147483647, anioAcademicoId: year.id },
    404,
  );
  const c = (await admin.get(`${base}/admin/catalogos`).expect(200)).body.data;
  assert.equal(c.docentes.length, 1);
  assert.equal(c.secciones[0].anioAcademico.codigo, '2026');
});
test('07 registra alumno y matrícula con año coherente derivado de la sección', async () => {
  student = (
    await post('estudiantes', { numeroDocumento: 'EST-01', nombres: 'Lucía', apellidos: 'Gómez' })
  ).body.data;
  enrollment = (await post('matriculas', { estudianteId: student.id, seccionId: section.id })).body
    .data;
  const stored = await prisma.matricula.findUnique({
    where: { id: enrollment.id },
    include: { seccion: true },
  });
  assert.equal(stored.anioAcademicoId, stored.seccion.anioAcademicoId);
  assert.equal(stored.activo, true);
  await post('matriculas', { estudianteId: student.id, seccionId: otherSection.id }, 409);
  await post(
    'matriculas',
    { estudianteId: student.id, seccionId: section.id, anioAcademicoId: 99 },
    400,
  );
  await post('matriculas', { estudianteId: 2147483647, seccionId: section.id }, 404);
  assert.equal(await prisma.matricula.count(), 1);
});
test('08 vincula cuenta ALUMNO a la misma persona y evita duplicarla', async () => {
  const account = (
    await post('usuarios', {
      numeroDocumento: 'EST-01',
      nombres: 'Lucía',
      apellidos: 'Gómez',
      identificador: 'alumna@prueba.local',
      contrasena: password,
      roles: ['ALUMNO'],
    })
  ).body.data;
  assert.equal(account.personaId, student.personaId);
  assert.equal(await prisma.estudiante.count(), 1);
  await post(
    'estudiantes',
    { numeroDocumento: 'EST-01', nombres: 'Lucía', apellidos: 'Gómez' },
    409,
  );
  await post(
    'estudiantes',
    { numeroDocumento: 'EST-01', nombres: 'Otra', apellidos: 'Persona' },
    409,
  );
});
test('09 asigna curso/sección/docente/aula y el bloque semanal', async () => {
  block = (
    await post('bloques', {
      cursoId: course.id,
      seccionId: section.id,
      docenteId: teacherUser.docenteId,
      aulaId: room.id,
      diaSemana: 5,
      horaInicio: '08:00',
      horaFin: '08:45',
    })
  ).body.data;
  assert.equal(block.asignacion.docenteId, teacherUser.docenteId);
  otherTeacher = (
    await post('usuarios', {
      ...teacherInput,
      numeroDocumento: 'DOC-02',
      identificador: 'docente2@prueba.local',
      nombres: 'Carlos',
      roles: ['DOCENTE'],
    })
  ).body.data;
  await secondTeacher
    .post(`${base}/auth/login`)
    .send({ identificador: otherTeacher.identificador, contrasena: password })
    .expect(200);
});
test('10 detecta por separado cruces de docente, aula y sección sin escritura parcial', async () => {
  const baseInput = {
    cursoId: course.id,
    seccionId: otherSection.id,
    docenteId: otherTeacher.docenteId,
    aulaId: otherRoom.id,
    diaSemana: 5,
    horaInicio: '08:30',
    horaFin: '09:00',
  };
  for (const [change, reason] of [
    [{ docenteId: teacherUser.docenteId }, 'docente'],
    [{ aulaId: room.id }, 'aula'],
    [{ seccionId: section.id }, 'sección'],
  ]) {
    const r = await post('bloques', { ...baseInput, ...change }, 409);
    assert.equal(r.body.error.code, 'SCHEDULE_CONFLICT');
    assert.ok(r.body.error.message.includes(reason));
  }
  assert.equal(await prisma.cursoSeccionDocenteAula.count(), 1);
  assert.equal(await prisma.cursoSeccionDocente.count(), 1);
  await post('bloques', { ...baseInput, horaFin: '08:00' }, 400);
  await post('bloques', { ...baseInput, docenteId: 2147483647 }, 400);
});
test('11 admite bloques contiguos y rechaza el cruce en dos altas simultáneas', async () => {
  const input = {
    cursoId: course.id,
    seccionId: section.id,
    docenteId: teacherUser.docenteId,
    aulaId: room.id,
    diaSemana: 5,
    horaInicio: '08:45',
    horaFin: '09:30',
  };
  const r = await Promise.all([1, 2].map(() => admin.post(`${base}/admin/bloques`).send(input)));
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  assert.equal(await prisma.cursoSeccionDocenteAula.count(), 2);
});
test('12 valida fecha/día/año y crea una sola sesión coherente con el bloque', async () => {
  for (const fecha of ['2026-02-30', '2026-10-01', '2027-10-01'])
    await post('sesiones', { bloqueId: block.id, fecha }, 400);
  session = (await post('sesiones', { bloqueId: block.id, fecha: '2026-10-02' })).body.data;
  assert.equal(session.horaInicio, block.horaInicio);
  assert.equal(session.horaFin, block.horaFin);
  await post('sesiones', { bloqueId: block.id, fecha: '2026-10-02' }, 409);
  assert.equal(await prisma.sesionClase.count(), 1);
  assert.equal('version' in session, false);
});
test('13 el docente ve la sesión asignada y al alumno nuevo en el padrón', async () => {
  const list = (await teacher.get(`${base}/sesiones`).expect(200)).body.data;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, session.id);
  const roster = (await teacher.get(`${base}/sesiones/${session.id}/alumnos`).expect(200)).body.data
    .alumnos;
  assert.equal(roster.length, 1);
  assert.equal(roster[0].alumnoId, student.id);
  assert.equal(roster[0].estado, null);
  assert.deepEqual((await secondTeacher.get(`${base}/sesiones`).expect(200)).body.data, []);
  await secondTeacher.get(`${base}/sesiones/${session.id}/alumnos`).expect(403);
});
test('14 asistencia completa: persistencia, auditoría y nueva lectura sin seed', async () => {
  const body = {
    asistencias: [{ alumnoId: student.id, estado: 'TARDANZA', observacion: 'Llegó a las 08:12' }],
  };
  await teacher.put(`${base}/sesiones/${session.id}/asistencias`).send(body).expect(200);
  const stored = await prisma.asistenciaEstudiante.findFirst();
  assert.equal(stored.matriculaId, enrollment.id);
  assert.equal(stored.condicion, 'TARDANZA');
  assert.equal(stored.creadoPorId, teacherUser.id);
  assert.equal(stored.modificadoPorId, teacherUser.id);
  const reload = (await teacher.get(`${base}/sesiones/${session.id}/alumnos`).expect(200)).body
    .data;
  assert.equal('version' in reload.sesion, false);
  assert.equal(reload.alumnos[0].observacion, 'Llegó a las 08:12');
  assert.equal(reload.alumnos[0].estado, 'TARDANZA');
  const audit = await prisma.registroAuditoria.findFirst({
    where: { tipoEvento: 'ASISTENCIA_GUARDADA', entidadId: session.id },
  });
  assert.equal(audit.usuarioId, teacherUser.id);
  await teacher.put(`${base}/sesiones/${session.id}/asistencias`).send(body).expect(200);
  assert.equal(await prisma.asistenciaEstudiante.count(), 1);
});
test('15 editar roles conserva la persona y deniega permisos inmediatamente', async () => {
  teacherUser = (await edit(teacherUser, { roles: ['APODERADO'] }).expect(200)).body.data;
  await teacher.get(`${base}/sesiones`).expect(403);
  await post('sesiones', { bloqueId: block.id, fecha: '2026-10-09' }, 400);
  teacherUser = (await edit(teacherUser, { roles: ['DOCENTE', 'APODERADO'] }).expect(200)).body
    .data;
  await teacher.get(`${base}/sesiones`).expect(200);
  assert.equal(await prisma.docente.count(), 2);
});
test('16 PUT repetido de usuario acepta ambos guardados; desactivar revoca sesiones y reactivar conserva historial', async () => {
  const responses = await Promise.all([1, 2].map(() => edit(teacherUser, { activo: false })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 200]);
  teacherUser = responses.find((r) => r.status === 200).body.data;
  await teacher.get(`${base}/auth/me`).expect(401);
  assert.equal(await prisma.sesionAuth.count({ where: { usuarioId: teacherUser.id } }), 0);
  teacherUser = (await edit(teacherUser, { activo: true }).expect(200)).body.data;
  await teacher
    .post(`${base}/auth/login`)
    .send({ identificador: teacherUser.identificador, contrasena: password })
    .expect(200);
  assert.equal(
    (await teacher.get(`${base}/sesiones/${session.id}/alumnos`)).body.data.alumnos[0].estado,
    'TARDANZA',
  );
});
test('17 protege al administrador y al cambiar contraseña revoca el acceso anterior', async () => {
  await edit(adminUser, { activo: false }).expect(409);
  await edit(adminUser, { roles: ['APODERADO'] }).expect(409);
  teacherUser = (await edit(teacherUser, { contrasena: 'NuevaClave123!' }).expect(200)).body.data;
  await teacher.get(`${base}/auth/me`).expect(401);
  await teacher
    .post(`${base}/auth/login`)
    .send({ identificador: teacherUser.identificador, contrasena: password })
    .expect(401);
  await teacher
    .post(`${base}/auth/login`)
    .send({ identificador: teacherUser.identificador, contrasena: 'NuevaClave123!' })
    .expect(200);
});
test('18 auditoría administrativa y logs físicos registran el recorrido sin secretos', async () => {
  const events = (await admin.get(`${base}/admin/auditoria`).expect(200)).body.data;
  for (const event of [
    'ADMINISTRADOR_INICIAL_CREADO',
    'USUARIO_CREADO',
    'CATALOGO_CREADO',
    'ESTUDIANTE_REGISTRADO',
    'MATRICULA_REGISTRADA',
    'BLOQUE_ASIGNADO',
    'SESION_CLASE_CREADA',
    'ASISTENCIA_GUARDADA',
    'USUARIO_ACTUALIZADO',
  ])
    assert.ok(
      events.some((e) => e.tipoEvento === event),
      event,
    );
  // Simula un evento histórico: la API omite el contador sin reescribir evidencia.
  const legacy = await prisma.registroAuditoria.create({
    data: {
      usuarioId: teacherUser.id,
      tipoEvento: 'ASISTENCIA_GUARDADA',
      entidadId: session.id,
      detalle: {
        version: 7,
        cambios: [{ alumnoId: student.id, anterior: 'PRESENTE', nuevo: 'TARDANZA' }],
      },
    },
  });
  for (const route of ['usuarios', 'catalogos', 'estudiantes', 'horarios', 'auditoria']) {
    const response = await admin.get(`${base}/admin/${route}`).expect(200);
    assert.equal('success' in response.body, false);
    assert.doesNotMatch(JSON.stringify(response.body), /"version":/);
  }
  const history = (await admin.get(`${base}/admin/auditoria`)).body.data;
  assert.deepEqual(history.find((e) => e.id === legacy.id).detalle, {
    cambios: legacy.detalle.cambios,
  });
  assert.equal(
    (await prisma.registroAuditoria.findUnique({ where: { id: legacy.id } })).detalle.version,
    7,
  );
  const users = (await admin.get(`${base}/admin/usuarios`).expect(200)).body.data;
  const stored = await prisma.usuario.findUnique({ where: { id: teacherUser.id } });
  await new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
  const logs = readFileSync(path.join(logDirectory, 'app.log'), 'utf8');
  for (const event of [
    'USUARIO_CREADO',
    'MATRICULA_REGISTRADA',
    'BLOQUE_ASIGNADO',
    'SESION_CLASE_CREADA',
    'Asistencia guardada',
  ])
    assert.ok(logs.includes(event), event);
  for (const secret of [
    password,
    'NuevaClave123!',
    env.INITIAL_SETUP_KEY,
    env.JWT_SECRET,
    stored.hashContrasena,
  ]) {
    assert.ok(!logs.includes(secret));
    assert.ok(!JSON.stringify({ events, users }).includes(secret));
  }
  assert.equal(readFileSync(path.join(logDirectory, 'error.log'), 'utf8'), '');
});
