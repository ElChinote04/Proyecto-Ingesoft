import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/logging/logger.js';

const base = '/api/v1';
const claveInicial = 'InicialTemporal123!';
const clavePersonal = 'PersonalSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const alumno = request.agent(app);
const apoderado = request.agent(app);
let cuentaDocente, cuentaAlumno, cuentaApoderado, estudiante, otroEstudiante;
let anio, grado, seccion, otraSeccion, curso, aula, bloque;
const alta = async (ruta, datos) =>
  (await admin.post(`${base}/admin/${ruta}`).send(datos).expect(201)).body.data;
async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('usuarios', {
    identificador,
    numeroDocumento: identificador,
    nombres: identificador,
    apellidos: 'Prueba',
    contrasena: claveInicial,
    roles,
  });
  const login = await agente
    .post(`${base}/auth/login`)
    .send({ identificador, contrasena: claveInicial })
    .expect(200);
  assert.equal(login.body.data.requiereCambioContrasena, true);
  await agente.get(`${base}/horarios`).expect(403);
  await agente
    .put(`${base}/auth/contrasena`)
    .send({ contrasenaActual: claveInicial, nuevaContrasena: clavePersonal })
    .expect(200);
  await agente.get(`${base}/auth/me`).expect(401);
  await agente
    .post(`${base}/auth/login`)
    .send({ identificador, contrasena: clavePersonal })
    .expect(200);
  return cuenta;
}
before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-PERFILES',
      nombres: 'Administrador',
      apellidos: 'Prueba',
      identificador: 'admin-perfiles',
      contrasena: clavePersonal,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-perfiles', contrasena: clavePersonal })
    .expect(200);
  cuentaDocente = await crearCuenta('docente-perfiles', ['DOCENTE', 'APODERADO'], docente);
  cuentaAlumno = await crearCuenta('alumno-perfiles', ['ALUMNO'], alumno);
  cuentaApoderado = await crearCuenta('apoderado-perfiles', ['APODERADO'], apoderado);
  estudiante = (await admin.get(`${base}/admin/estudiantes`)).body.data.find(
    (item) => item.personaId === cuentaAlumno.personaId,
  );
  otroEstudiante = await alta('estudiantes', {
    numeroDocumento: 'EST-AJENO',
    nombres: 'Otro',
    apellidos: 'Estudiante',
  });
  anio = await alta('catalogos/anios', { codigo: '2026' });
  grado = await alta('catalogos/grados', { nombre: 'Segundo' });
  seccion = await alta('catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  otraSeccion = await alta('catalogos/secciones', {
    nombre: 'B',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  curso = await alta('catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  aula = await alta('catalogos/aulas', { codigo: 'A201' });
  await alta('matriculas', { estudianteId: estudiante.id, seccionId: seccion.id });
  await alta('matriculas', { estudianteId: otroEstudiante.id, seccionId: otraSeccion.id });
  bloque = await alta('bloques', {
    cursoId: curso.id,
    seccionId: seccion.id,
    docenteId: cuentaDocente.docenteId,
    aulaId: aula.id,
    diaSemana: 1,
    horaInicio: '08:00',
    horaFin: '09:00',
  });
});
after(async () => {
  await prisma.$disconnect();
  await new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
});

test('US-001: cuatro perfiles, cambio inicial obligatorio y permisos de servidor', async () => {
  const cuentas = [
    [admin, 'administrar'],
    [docente, 'asistencia.registrar'],
    [alumno, 'portal.consultar'],
    [apoderado, 'portal.consultar'],
  ];
  for (const [agente, permiso] of cuentas) {
    const respuesta = await agente.get(`${base}/auth/me`).expect(200);
    assert.ok(respuesta.body.data.permisos.includes(permiso));
    assert.equal(respuesta.body.data.requiereCambioContrasena, false);
    assert.equal('success' in respuesta.body, false);
    assert.equal('hashContrasena' in respuesta.body.data, false);
  }
  await alumno.get(`${base}/admin/usuarios`).expect(403);
  await apoderado.get(`${base}/sesiones`).expect(403);
  await docente.get(`${base}/admin/horarios`).expect(403);
  await alumno
    .put(`${base}/auth/contrasena`)
    .send({ contrasenaActual: 'Incorrecta123!', nuevaContrasena: 'NuevaClaveSegura123!' })
    .expect(400);
  await alumno
    .put(`${base}/auth/contrasena`)
    .send({ contrasenaActual: clavePersonal, nuevaContrasena: clavePersonal })
    .expect(400);
  await alumno.get(`${base}/auth/me`).expect(200);
});

test('US-001: bloqueo por cuenta, recuperación temporal y auditoría sin secretos', async () => {
  for (let intento = 0; intento < env.LOGIN_MAX_ATTEMPTS; intento++) {
    await request(app)
      .post(`${base}/auth/login`)
      .send({ identificador: cuentaAlumno.identificador, contrasena: 'Incorrecta123!' })
      .expect(401);
  }
  await request(app)
    .post(`${base}/auth/login`)
    .send({ identificador: cuentaAlumno.identificador, contrasena: clavePersonal })
    .expect(401);
  const guardada = await prisma.usuario.findUnique({ where: { id: cuentaAlumno.id } });
  assert.ok(guardada.bloqueadoHasta > new Date());
  await prisma.usuario.update({
    where: { id: cuentaAlumno.id },
    data: { bloqueadoHasta: new Date(Date.now() - 1000) },
  });
  await request(app)
    .post(`${base}/auth/login`)
    .send({ identificador: cuentaAlumno.identificador, contrasena: clavePersonal })
    .expect(200);
  assert.equal(
    (await prisma.usuario.findUnique({ where: { id: cuentaAlumno.id } })).intentosFallidos,
    0,
  );
  await request(app)
    .post(`${base}/auth/login`)
    .send({ identificador: 'cuenta-desconocida', contrasena: 'Incorrecta123!' })
    .expect(401);
  const eventos = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'LOGIN_FALLIDO' },
  });
  assert.ok(eventos.some((evento) => evento.usuarioId === null));
  assert.ok(eventos.every((evento) => evento.requestId && evento.resultado === 'DENEGADO'));
  assert.ok(eventos.every((evento) => evento.detalle.origen?.metodo === 'POST'));
  assert.ok(!JSON.stringify(eventos).includes('Incorrecta123!'));
});

test('US-001: sesión por inactividad; consultas automáticas no renuevan actividad', async () => {
  const agente = request.agent(app);
  await agente
    .post(`${base}/auth/login`)
    .send({ identificador: cuentaAlumno.identificador, contrasena: clavePersonal })
    .expect(200);
  const sesion = await prisma.sesionAuth.findFirst({
    where: { usuarioId: cuentaAlumno.id },
    orderBy: { creadoEn: 'desc' },
  });
  const antes = new Date(Date.now() - 30000);
  await prisma.sesionAuth.update({ where: { id: sesion.id }, data: { ultimaActividad: antes } });
  await agente.get(`${base}/horarios`).set('X-Sage-Background', '1').expect(200);
  assert.equal(
    (await prisma.sesionAuth.findUnique({ where: { id: sesion.id } })).ultimaActividad.getTime(),
    antes.getTime(),
  );
  await prisma.sesionAuth.update({
    where: { id: sesion.id },
    data: { ultimaActividad: new Date(Date.now() - (env.SESSION_IDLE_SECONDS + 1) * 1000) },
  });
  const resultado = await agente.get(`${base}/auth/me`).expect(401);
  assert.equal(resultado.body.error.code, 'SESSION_IDLE');
  assert.equal(await prisma.sesionAuth.findUnique({ where: { id: sesion.id } }), null);
});

test('US-001: portal propio, vínculo familiar y aislamiento de otros estudiantes', async () => {
  assert.deepEqual((await apoderado.get(`${base}/portal/estudiantes`).expect(200)).body.data, []);
  const propios = (await alumno.get(`${base}/portal/estudiantes`).expect(200)).body.data;
  assert.deepEqual(
    propios.map((item) => item.id),
    [estudiante.id],
  );
  await alumno.get(`${base}/portal/estudiantes/${otroEstudiante.id}/asistencias`).expect(403);
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({
      apoderadoId: cuentaApoderado.apoderadoId,
      estudianteId: estudiante.id,
      parentesco: 'Madre',
      activo: true,
    })
    .expect(200);
  assert.deepEqual(
    (await apoderado.get(`${base}/portal/estudiantes`)).body.data.map((item) => item.id),
    [estudiante.id],
  );
  await apoderado.get(`${base}/portal/estudiantes/${otroEstudiante.id}/asistencias`).expect(403);
  const historia = await apoderado
    .get(`${base}/portal/estudiantes/${estudiante.id}/asistencias?pagina=1&limite=10`)
    .expect(200);
  assert.equal(historia.body.data.total, 0);
  await apoderado
    .get(`${base}/portal/estudiantes/${estudiante.id}/asistencias?limite=999`)
    .expect(400);
  const vinculo = {
    apoderadoId: cuentaApoderado.apoderadoId,
    estudianteId: estudiante.id,
    parentesco: 'Madre',
  };
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({ ...vinculo, activo: false })
    .expect(200);
  await apoderado.get(`${base}/portal/estudiantes/${estudiante.id}/asistencias`).expect(403);
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({ ...vinculo, activo: true })
    .expect(200);
});

test('US-023: horario personalizado del docente y de la sección del alumno; solo lectura', async () => {
  for (const agente of [docente, alumno]) {
    const horario = (await agente.get(`${base}/horarios`).expect(200)).body.data;
    assert.equal(horario.anioAcademico.codigo, '2026');
    assert.deepEqual(
      horario.bloques.map((item) => item.id),
      [bloque.id],
    );
    assert.equal(horario.bloques[0].aula, aula.codigo);
    assert.equal(horario.bloques[0].curso, curso.nombre);
    assert.equal(horario.bloques[0].diaSemana, 1);
  }
  await alumno.get(`${base}/horarios?perfil=DOCENTE`).expect(403);
  await apoderado.get(`${base}/horarios`).expect(403);
  await alumno.post(`${base}/admin/bloques`).send({}).expect(403);
  await alumno.put(`${base}/admin/bloques/${bloque.id}`).send({}).expect(403);
  await alumno.delete(`${base}/admin/bloques/${bloque.id}`).expect(403);
});

test('US-023: modificación y retiro se reflejan en la siguiente actualización sin versiones', async () => {
  await admin
    .put(`${base}/admin/bloques/${bloque.id}`)
    .send({
      cursoId: curso.id,
      seccionId: seccion.id,
      docenteId: cuentaDocente.docenteId,
      aulaId: aula.id,
      diaSemana: 2,
      horaInicio: '09:00',
      horaFin: '10:00',
    })
    .expect(200);
  const nuevo = (await alumno.get(`${base}/horarios`)).body.data.bloques[0];
  assert.equal(nuevo.diaSemana, 2);
  assert.equal(nuevo.horaInicio, '09:00');
  assert.equal('version' in nuevo, false);
  await admin.delete(`${base}/admin/bloques/${bloque.id}`).expect(200);
  assert.deepEqual((await alumno.get(`${base}/horarios`)).body.data.bloques, []);
  assert.equal(
    (await prisma.cursoSeccionDocenteAula.findUnique({ where: { id: bloque.id } })).activo,
    false,
  );
  const datos = {
    cursoId: curso.id,
    seccionId: seccion.id,
    docenteId: cuentaDocente.docenteId,
    aulaId: aula.id,
    diaSemana: 2,
    horaInicio: '09:00',
    horaFin: '10:00',
  };
  const anteriorId = bloque.id;
  bloque = await alta('bloques', datos);
  assert.notEqual(bloque.id, anteriorId);
  assert.deepEqual(
    (await alumno.get(`${base}/horarios`)).body.data.bloques.map((item) => item.id),
    [bloque.id],
  );
  const sesion = await alta('sesiones', { bloqueId: bloque.id, fecha: '2026-10-06' });
  await docente
    .put(`${base}/sesiones/${sesion.id}/asistencias`)
    .send({
      asistencias: [
        { alumnoId: estudiante.id, estado: 'TARDANZA', observacion: 'Registro de prueba' },
      ],
    })
    .expect(200);
  for (const agente of [alumno, apoderado]) {
    const historial = (
      await agente.get(`${base}/portal/estudiantes/${estudiante.id}/asistencias`).expect(200)
    ).body.data;
    assert.equal(historial.total, 1);
    assert.equal(historial.registros[0].estado, 'TARDANZA');
    assert.equal(historial.registros[0].curso, curso.nombre);
  }
  await admin.put(`${base}/admin/bloques/${bloque.id}`).send(datos).expect(409);
});

test('US-023: único año activo, cambio global y protección de años anteriores', async () => {
  const siguiente = await alta('catalogos/anios', { codigo: '2027' });
  assert.equal(siguiente.activo, false);
  await admin.put(`${base}/admin/anios/${siguiente.id}/activacion`).send({}).expect(200);
  assert.equal(await prisma.anioAcademico.count({ where: { activo: true } }), 1);
  assert.equal((await alumno.get(`${base}/horarios`)).body.data.anioAcademico.codigo, '2027');
  assert.deepEqual((await docente.get(`${base}/horarios`)).body.data.bloques, []);
  await admin
    .post(`${base}/admin/bloques`)
    .send({
      cursoId: curso.id,
      seccionId: seccion.id,
      docenteId: cuentaDocente.docenteId,
      aulaId: aula.id,
      diaSemana: 1,
      horaInicio: '10:00',
      horaFin: '11:00',
    })
    .expect(409);
  await admin.delete(`${base}/admin/bloques/${bloque.id}`).expect(409);
  await admin
    .post(`${base}/admin/sesiones`)
    .send({ bloqueId: bloque.id, fecha: '2026-10-13' })
    .expect(409);
});

test('US-001: auditoría de seguridad, consulta exclusiva y protección contra modificaciones', async () => {
  await alumno.get(`${base}/admin/auditoria`).expect(403);
  await apoderado.get(`${base}/admin/auditoria`).expect(403);
  const eventos = (
    await admin.get(`${base}/admin/auditoria?tipoEvento=ACCESO_DENEGADO&limite=50`).expect(200)
  ).body.data.registros;
  assert.ok(eventos.some((evento) => evento.tipoEvento === 'ACCESO_DENEGADO' && evento.requestId));
  const registro = eventos[0];
  await assert.rejects(
    prisma.registroAuditoria.update({ where: { id: registro.id }, data: { detalle: {} } }),
  );
  await assert.rejects(prisma.registroAuditoria.delete({ where: { id: registro.id } }));
  assert.deepEqual(
    (await prisma.registroAuditoria.findUnique({ where: { id: registro.id } })).detalle,
    registro.detalle,
  );
  await admin.put(`${base}/admin/auditoria/${registro.id}`).send({ detalle: {} }).expect(404);
  await admin.delete(`${base}/admin/auditoria/${registro.id}`).expect(404);
});
