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
const apoderado = request.agent(app);
let adminId, cuentaDocente, cuentaApoderado, anio, grado, seccion;
const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const consultar = async (filtros) =>
  (await admin.get(`${base}/admin/auditoria`).query(filtros).expect(200)).body.data;
const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

// Crea la cuenta y deja hecha la sesión con la contraseña inicial ya cambiada.
async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: identificador,
    nombres: identificador,
    apellidos: 'Auditoría',
    identificador,
    contrasena: 'InicialTemporal123!',
    roles,
  });
  await agente
    .post(`${base}/auth/login`)
    .send({ identificador, contrasena: 'InicialTemporal123!' })
    .expect(200);
  await agente
    .put(`${base}/auth/contrasena`)
    .send({ contrasenaActual: 'InicialTemporal123!', nuevaContrasena: clave })
    .expect(200);
  await agente.post(`${base}/auth/login`).send({ identificador, contrasena: clave }).expect(200);
  return cuenta;
}
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
  // El docente sirve para el 403 por rol y para registrar notas; el apoderado, para pagar.
  cuentaDocente = await crearCuenta('docente-auditoria', ['DOCENTE'], docente);
  cuentaApoderado = await crearCuenta('apoderado-auditoria', ['APODERADO'], apoderado);
  // Año futuro, como en las pruebas de pagos, para que ninguna boleta nazca morosa.
  anio = await alta('admin/catalogos/anios', { codigo: '2030' });
  grado = await alta('admin/catalogos/grados', { nombre: 'Primero' });
  seccion = await alta('admin/catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
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

// De punta a punta: se usan las rutas reales del módulo de Matrícula y Pagos (pasarela simulada).
test('AUD-07 cada operación de un pago queda registrada con usuario, fecha y detalle', async () => {
  const estudiante = await alta('admin/estudiantes', {
    numeroDocumento: 'EST-PAGO-AUD',
    nombres: 'Hijo',
    apellidos: 'Auditoría',
  });
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({
      apoderadoId: cuentaApoderado.apoderadoId,
      estudianteId: estudiante.id,
      parentesco: 'Padre',
    })
    .expect(200);
  await alta('admin/matriculas', {
    estudianteId: estudiante.id,
    seccionId: seccion.id,
    planPago: { montoPension: '350.00', numeroCuotas: 2, diaVencimiento: 10, mesInicio: 3 },
  });
  const { boletas } = (await apoderado.get(`${base}/compromisos-pago`).expect(200)).body.data;
  const { pagoId } = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boletas[0].id }).expect(201)
  ).body.data;
  await apoderado.post(`${base}/pagos/${pagoId}/simular`).send({ resultado: 'PAGADO' }).expect(200);

  for (const [evento, usuario] of [
    ['COMPROMISO_PAGO_EMITIDO', 'admin-auditoria'],
    ['PAGO_INICIADO', 'apoderado-auditoria'],
    ['PAGO_CONFIRMADO', 'apoderado-auditoria'],
  ]) {
    // La consulta devuelve primero lo más reciente: el registro de este pago.
    const [registro] = (await consultar({ tipoEvento: evento })).registros;
    assert.equal(registro.usuario, usuario, evento);
    assert.equal(registro.resultado, 'EXITO', evento);
    assert.ok(registro.fechaHora && registro.requestId, evento);
    assert.ok(Object.keys(registro.detalle).length > 0, evento);
  }
  const [confirmado] = (await consultar({ tipoEvento: 'PAGO_CONFIRMADO' })).registros;
  assert.equal(confirmado.entidadId, pagoId);
  assert.equal(confirmado.detalle.monto, '350.00');
});

// De punta a punta: se usan las rutas reales del módulo de Gestión Académica.
test('AUD-08 un cambio de nota queda registrado con usuario, fecha, valor anterior y nuevo', async () => {
  const curso = await alta('admin/catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  const aula = await alta('admin/catalogos/aulas', { codigo: 'A101' });
  const competencia = await alta('competencias', {
    cursoId: curso.id,
    codigo: 'C1',
    nombre: 'Resuelve problemas de cantidad',
    descripcion: 'Competencia de prueba para la auditoría',
  });
  const regla = await alta('reglas-consolidacion', {
    gradoId: grado.id,
    cursoId: curso.id,
    nombre: 'Regla de prueba',
    version: 1,
    metodo: 'PROMEDIO',
  });
  await alta('admin/bloques', {
    cursoId: curso.id,
    seccionId: seccion.id,
    docenteId: cuentaDocente.docenteId,
    aulaId: aula.id,
    diaSemana: 1,
    horaInicio: '08:00',
    horaFin: '09:00',
  });
  const alumno = await alta('admin/estudiantes', {
    numeroDocumento: 'EST-NOTA-AUD',
    nombres: 'Alumno',
    apellidos: 'Auditoría',
  });
  const matricula = await alta('admin/matriculas', {
    estudianteId: alumno.id,
    seccionId: seccion.id,
  });
  const asignacion = await prisma.cursoSeccionDocente.findFirst({
    where: { cursoId: curso.id, seccionId: seccion.id },
  });
  const bimestre = await prisma.bimestreAcademico.findFirst({
    where: { anioAcademicoId: anio.id, numero: 1 },
  });

  const nota = (
    await docente
      .post(`${base}/calificaciones`)
      .send({
        matriculaId: matricula.id,
        bimestreId: bimestre.id,
        asignacionId: asignacion.id,
        reglaId: regla.id,
        competencias: [{ competenciaId: competencia.id, nivelLogro: 'B' }],
      })
      .expect(201)
  ).body.data;
  await admin
    .put(`${base}/calificaciones/${nota.id}`)
    .send({ competencias: [{ competenciaId: competencia.id, nivelLogro: 'A' }] })
    .expect(200);

  const [creada] = (await consultar({ tipoEvento: 'CALIFICACION_CREADA' })).registros;
  assert.equal(creada.usuario, 'docente-auditoria');
  assert.equal(creada.entidadId, nota.id);
  const [modificada] = (await consultar({ tipoEvento: 'CALIFICACION_MODIFICADA' })).registros;
  assert.equal(modificada.usuario, 'admin-auditoria');
  assert.equal(modificada.entidad, 'Calificacion');
  assert.equal(modificada.entidadId, nota.id);
  assert.ok(modificada.fechaHora && modificada.requestId);
  assert.equal(modificada.detalle.valorAnterior.competencias[0].nivelLogro, 'B');
  assert.equal(modificada.detalle.valorNuevo.competencias[0].nivelLogro, 'A');
  // El filtro "Éxito" incluye los registros de notas, que se guardan como EXITOSO.
  const exitosas = await consultar({ resultado: 'EXITO', tipoEvento: 'CALIFICACION_MODIFICADA' });
  assert.equal(exitosas.total, 1);
});
