import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { backendRoot, env } from '../src/config/env.js';
import { hoyEnLima, listarSemanas, totalSemanas } from '../src/domain/semanasBimestre.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const docenteAjeno = request.agent(app);
const docenteNuevo = request.agent(app);
const apoderado = request.agent(app);
const apoderadoAjeno = request.agent(app);
let cuentaDocente, cuentaAjena, cuentaNueva, anio, seccion, aula, curso, cursoAjeno;
let asignacion, asignacionAjena, bimestre, bimestre2, matricula, plan;

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300, 0x20)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(300, 2),
]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 3)]);
const DIA = 24 * 60 * 60 * 1000;
const hoy = () => new Date(`${hoyEnLima()}T00:00:00.000Z`);
const diaRelativo = (dias) => new Date(hoy().getTime() + dias * DIA).toISOString().slice(0, 10);

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

// Las reglas de usuarios exigen correo, DNI de 8 dígitos y nombres solo con letras.
let documentoCuenta = 30000000;
async function crearCuenta(nombre, roles, agente) {
  const identificador = `${nombre}@sage.test`;
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: String(++documentoCuenta),
    nombres: nombre.replace(/[^\p{L}]+/gu, ' ').trim(),
    apellidos: 'Plan',
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

async function dictar(cursoId, docenteId, diaSemana) {
  await alta('admin/bloques', {
    cursoId,
    seccionId: seccion.id,
    docenteId,
    aulaId: aula.id,
    diaSemana,
    horaInicio: '08:00',
    horaFin: '09:00',
  });
  return prisma.cursoSeccionDocente.findFirst({
    where: { cursoId, seccionId: seccion.id, docenteId },
  });
}

async function archivosEnDisco() {
  try {
    return (await readdir(path.resolve(backendRoot, env.EVIDENCIAS_DIR))).length;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

const rutaActividad = (id) => `${base}/evidencias-pedagogicas/${id}`;
// Alta multipart, como la envía el frontend: datos y archivos en una sola petición.
function registrar(agente = docente, campos = {}, archivos = []) {
  const datos = {
    planId: plan.id,
    numeroSemana: 1,
    tipo: 'EXPOSICION',
    titulo: 'Exposición de fracciones',
    ...campos,
  };
  let peticion = agente.post(`${base}/evidencias-pedagogicas`);
  for (const [campo, valor] of Object.entries(datos))
    peticion = peticion.field(campo, typeof valor === 'string' ? valor : JSON.stringify(valor));
  for (const [contenido, nombre] of archivos)
    peticion = peticion.attach('archivos', contenido, nombre);
  return peticion;
}
const eventos = (tipoEvento, entidadId) =>
  prisma.registroAuditoria.findMany({
    where: { tipoEvento, entidad: 'EvidenciaPedagogica', entidadId },
    orderBy: { id: 'asc' },
  });

async function conTriggerQueFalla(tabla, operacion) {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fallar_prueba() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'fallo de prueba'; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER fallar_prueba BEFORE INSERT ON "${tabla}"
    FOR EACH ROW EXECUTE FUNCTION fallar_prueba()`);
  try {
    await operacion();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER fallar_prueba ON "${tabla}"`);
    await prisma.$executeRawUnsafe('DROP FUNCTION fallar_prueba');
  }
}

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: '39999999',
      nombres: 'Administrador',
      apellidos: 'Plan',
      identificador: 'admin-plan@sage.test',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-plan@sage.test', contrasena: clave })
    .expect(200);

  cuentaDocente = await crearCuenta('docente-plan', ['DOCENTE'], docente);
  cuentaAjena = await crearCuenta('docente-ajeno-plan', ['DOCENTE'], docenteAjeno);
  cuentaNueva = await crearCuenta('docente-nuevo-plan', ['DOCENTE'], docenteNuevo);
  const cuentaApoderado = await crearCuenta('apoderado-plan', ['APODERADO'], apoderado);
  await crearCuenta('apoderado-ajeno-plan', ['APODERADO'], apoderadoAjeno);

  anio = await alta('admin/catalogos/anios', { codigo: '2037' });
  const grado = await alta('admin/catalogos/grados', { nombre: 'Sexto' });
  seccion = await alta('admin/catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  aula = await alta('admin/catalogos/aulas', { codigo: 'P601' });
  curso = await alta('admin/catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  cursoAjeno = await alta('admin/catalogos/cursos', { codigo: 'ART', nombre: 'Arte' });
  asignacion = await dictar(curso.id, cuentaDocente.docenteId, 1);
  asignacionAjena = await dictar(cursoAjeno.id, cuentaAjena.docenteId, 2);
  const alumno = await alta('admin/estudiantes', {
    numeroDocumento: '39000001',
    nombres: 'Lucía',
    apellidos: 'Plan',
  });
  matricula = await alta('admin/matriculas', { estudianteId: alumno.id, seccionId: seccion.id });
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({
      apoderadoId: cuentaApoderado.apoderadoId,
      estudianteId: alumno.id,
      parentesco: 'Madre',
      activo: true,
    })
    .expect(200);
  [bimestre, bimestre2] = await prisma.bimestreAcademico.findMany({
    where: { anioAcademicoId: anio.id, numero: { in: [1, 2] } },
    orderBy: { numero: 'asc' },
  });
});
after(() => prisma.$disconnect());

test('EVP-01 las semanas del bimestre se cuentan desde su inicio y la última se recorta', () => {
  // 9 semanas y 3 días → 10 semanas; la última va del día 64 al 66.
  const largo = { fechaInicio: '2026-03-02', fechaFin: '2026-05-06' };
  assert.equal(totalSemanas(largo), 10);
  const semanas = listarSemanas(largo);
  assert.deepEqual(semanas[0], { numero: 1, desde: '2026-03-02', hasta: '2026-03-08' });
  assert.deepEqual(semanas[4], { numero: 5, desde: '2026-03-30', hasta: '2026-04-05' });
  assert.deepEqual(semanas.at(-1), { numero: 10, desde: '2026-05-04', hasta: '2026-05-06' });
  assert.equal(totalSemanas({ fechaInicio: '2026-07-01', fechaFin: '2026-07-01' }), 1);
  assert.equal(totalSemanas({ fechaInicio: '2026-03-01', fechaFin: null }), null);
  assert.deepEqual(listarSemanas({ fechaInicio: null, fechaFin: null }), []);
});

test('EVP-02 el administrador fija las fechas del bimestre; las inválidas se rechazan', async () => {
  const sinFechas = await docente
    .post(`${base}/planes-academicos`)
    .send({ asignacionId: asignacion.id, bimestreId: bimestre.id, titulo: 'P', objetivo: 'O' })
    .expect(409);
  assert.equal(sinFechas.body.error.code, 'TERM_WITHOUT_DATES');

  const fechas = { fechaInicio: diaRelativo(-14), fechaFin: diaRelativo(55) };
  const { body } = await admin.patch(`${base}/bimestres/${bimestre.id}`).send(fechas).expect(200);
  assert.deepEqual(
    {
      fechaInicio: body.data.fechaInicio,
      fechaFin: body.data.fechaFin,
      semanas: body.data.semanas,
    },
    { ...fechas, semanas: 10 },
  );
  const [auditado] = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'BIMESTRE_FECHAS_MODIFICADAS', entidadId: bimestre.id },
  });
  assert.equal(auditado.detalle.valorAnterior.fechaInicio, null);
  assert.equal(auditado.detalle.valorNuevo.fechaFin, fechas.fechaFin);

  const ruta = `${base}/bimestres/${bimestre2.id}`;
  const enviar = (datos, agente = admin) => agente.patch(ruta).send(datos);
  await enviar({ fechaInicio: diaRelativo(80), fechaFin: diaRelativo(70) }).expect(400);
  await enviar({ fechaInicio: '2037-02-30', fechaFin: '2037-03-10' }).expect(400);
  await enviar({ fechaInicio: diaRelativo(60), fechaFin: diaRelativo(90), activo: false }).expect(
    400,
  );
  await enviar({ fechaInicio: diaRelativo(60), fechaFin: diaRelativo(90) }, docente).expect(403);
  const solape = await enviar({ fechaInicio: diaRelativo(50), fechaFin: diaRelativo(90) }).expect(
    409,
  );
  assert.equal(solape.body.error.code, 'TERM_OVERLAP');
  // El II bimestre no puede ir antes que el I.
  const orden = await enviar({ fechaInicio: diaRelativo(-60), fechaFin: diaRelativo(-30) }).expect(
    409,
  );
  assert.equal(orden.body.error.code, 'TERM_ORDER');
  await enviar({ fechaInicio: diaRelativo(60), fechaFin: diaRelativo(120) }).expect(200);
});

test('EVP-03 cada rol ve solo sus clases en /asignaciones', async () => {
  const propias = (await docente.get(`${base}/asignaciones`).expect(200)).body.data;
  assert.deepEqual(
    propias.map(({ id, curso: c }) => [id, c.nombre]),
    [[asignacion.id, 'Matemática']],
  );
  assert.doesNotMatch(JSON.stringify(propias), /docente|persona|numeroDocumento/i);
  const todas = (await admin.get(`${base}/asignaciones?seccionId=${seccion.id}`).expect(200)).body
    .data;
  assert.equal(todas.length, 2);
  const familia = (
    await apoderado.get(`${base}/asignaciones?matriculaId=${matricula.id}`).expect(200)
  ).body.data;
  assert.deepEqual(
    familia.map(({ curso: c }) => c.nombre),
    ['Arte', 'Matemática'],
  );
  await apoderado.get(`${base}/asignaciones`).expect(400);
  await apoderadoAjeno.get(`${base}/asignaciones?matriculaId=${matricula.id}`).expect(403);
  await docente.get(`${base}/asignaciones?extra=1`).expect(400);
});

test('EVP-04 dos altas simultáneas del plan de una clase dejan un solo plan', async () => {
  const datos = { asignacionId: asignacion.id, bimestreId: bimestre.id, objetivo: 'Fracciones' };
  const respuestas = await Promise.all([
    docente.post(`${base}/planes-academicos`).send({ ...datos, titulo: 'Plan A' }),
    admin.post(`${base}/planes-academicos`).send({ ...datos, titulo: 'Plan B' }),
  ]);
  assert.deepEqual(respuestas.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(
    await prisma.planAcademico.count({
      where: { cursoId: curso.id, bimestreId: bimestre.id, activo: true },
    }),
    1,
  );
  plan = respuestas.find(({ status }) => status === 201).body.data;
  // Sin fecha propia, el plan empieza con el bimestre.
  assert.equal(plan.fechaInicio, diaRelativo(-14));

  // Un docente no crea planes para la clase de otro, y la familia no entra a planes.
  await docente
    .post(`${base}/planes-academicos`)
    .send({ ...datos, asignacionId: asignacionAjena.id, titulo: 'Ajeno' })
    .expect(403);
  await apoderado.get(`${base}/planes-academicos`).expect(403);
  await docenteAjeno.get(`${base}/planes-academicos/${plan.id}`).expect(403);
  assert.deepEqual((await docenteAjeno.get(`${base}/planes-academicos`).expect(200)).body.data, []);
});

test('EVP-05 el plan trae todas las semanas del bimestre, también las vacías', async () => {
  const { body } = await docente.get(`${base}/planes-academicos/${plan.id}`).expect(200);
  assert.equal(body.data.bimestre.semanas, 10);
  assert.equal(body.data.bimestre.cerrado, false);
  assert.equal(body.data.puedeEditar, true);
  assert.equal(body.data.semanas.length, 10);
  assert.deepEqual(body.data.semanas[0], {
    numero: 1,
    desde: diaRelativo(-14),
    hasta: diaRelativo(-8),
    evidencias: [],
  });
  assert.doesNotMatch(JSON.stringify(body), /numeroDocumento|hashContrasena|persona/);
});

test('EVP-06 registra datos, enlaces y archivos en una sola petición, y se descarga igual', async () => {
  const enDisco = await archivosEnDisco();
  const { body } = await registrar(
    docente,
    {
      numeroSemana: 3,
      descripcion: 'Con material concreto',
      enlaces: ['https://example.org/guia'],
    },
    [
      [PDF, 'guía.pdf'],
      [PNG, 'pizarra.png'],
    ],
  ).expect(201);
  const actividad = body.data;
  assert.equal(actividad.estado, 'PLANIFICADA');
  assert.equal(actividad.fechaRealizacion, null);
  assert.deepEqual(actividad.enlaces, ['https://example.org/guia']);
  assert.deepEqual(
    actividad.archivos.map(({ nombre }) => nombre),
    ['guía.pdf', 'pizarra.png'],
  );
  assert.equal(await archivosEnDisco(), enDisco + 2);
  const descarga = await docente
    .get(`${rutaActividad(actividad.id)}/archivos/${actividad.archivos[0].id}`)
    .buffer(true)
    .parse((res, fin) => {
      const partes = [];
      res.on('data', (parte) => partes.push(parte));
      res.on('end', () => fin(null, Buffer.concat(partes)));
    })
    .expect(200);
  assert.ok(Buffer.from(descarga.body).equals(PDF));
  // Se descarga como adjunto con el nombre original, nunca con el nombre en disco.
  assert.match(descarga.headers['content-disposition'], /^attachment; filename="gu.a.pdf"/);
  assert.doesNotMatch(JSON.stringify(body), /nombreAlmacenado/);
  const [registro] = await eventos('EVIDENCIA_PEDAGOGICA_REGISTRADA', actividad.id);
  assert.equal(registro.usuarioId, cuentaDocente.id);
  assert.deepEqual(registro.detalle.valorNuevo.archivos, ['guía.pdf', 'pizarra.png']);

  const semana3 = (await docente.get(`${base}/planes-academicos/${plan.id}`).expect(200)).body.data
    .semanas[2];
  assert.deepEqual(
    semana3.evidencias.map(({ titulo, totalArchivos, totalEnlaces }) => [
      titulo,
      totalArchivos,
      totalEnlaces,
    ]),
    [['Exposición de fracciones', 2, 1]],
  );
});

test('EVP-07 «ya se realizó» crea la actividad realizada con la fecha de hoy', async () => {
  const { body } = await registrar(
    docente,
    { numeroSemana: 2, tipo: 'EJERCICIO', realizada: 'true' },
    [[PDF, 'ficha.pdf']],
  ).expect(201);
  assert.equal(body.data.estado, 'REALIZADA');
  assert.equal(body.data.fechaRealizacion, hoyEnLima());
});

test('EVP-08 si falla la transacción del alta no queda fila ni archivo', async () => {
  const filas = await prisma.evidenciaPedagogica.count();
  const enDisco = await archivosEnDisco();
  await conTriggerQueFalla('EvidenciaPedagogica', () =>
    registrar(docente, {}, [[PDF, 'fallo.pdf']]).expect(500),
  );
  assert.equal(await prisma.evidenciaPedagogica.count(), filas);
  assert.equal(await archivosEnDisco(), enDisco);
});

test('EVP-09 marcar como realizada y adjuntar va en un PATCH; un fallo no aplica nada', async () => {
  const { id } = (await registrar(docente, { numeroSemana: 4 }).expect(201)).body.data;
  const enDisco = await archivosEnDisco();
  await conTriggerQueFalla('ArchivoEvidenciaPedagogica', () =>
    docente
      .patch(rutaActividad(id))
      .field('estado', 'REALIZADA')
      .field('titulo', 'No debe quedar')
      .attach('archivos', PDF, 'fallo.pdf')
      .expect(500),
  );
  const intacta = await prisma.evidenciaPedagogica.findUnique({ where: { id } });
  assert.equal(intacta.estado, 'PLANIFICADA');
  assert.equal(intacta.titulo, 'Exposición de fracciones');
  assert.equal(await archivosEnDisco(), enDisco);

  const { body } = await docente
    .patch(rutaActividad(id))
    .field('estado', 'REALIZADA')
    .field('descripcion', 'Se hizo en grupos')
    .attach('archivos', PNG, 'evidencia.png')
    .expect(200);
  assert.equal(body.data.estado, 'REALIZADA');
  assert.equal(body.data.descripcion, 'Se hizo en grupos');
  assert.equal(body.data.archivos.length, 1);
  assert.equal((await eventos('EVIDENCIA_PEDAGOGICA_REALIZADA', id)).length, 1);
  // Ya realizada, volver a marcarla no cambia la fecha ni vuelve a contarla como realizada.
  await docente.patch(rutaActividad(id)).send({ estado: 'REALIZADA' }).expect(200);
  assert.equal((await eventos('EVIDENCIA_PEDAGOGICA_REALIZADA', id)).length, 1);
  await docente.patch(rutaActividad(id)).send({ estado: 'PLANIFICADA' }).expect(400);
});

test('EVP-10 datos inválidos se rechazan sin dejar nada', async () => {
  const enDisco = await archivosEnDisco();
  const filas = await prisma.evidenciaPedagogica.count();
  const rechazo = async (peticion, codigo) => {
    const { body } = await peticion.expect(400);
    if (codigo) assert.equal(body.error.code, codigo);
  };
  await rechazo(registrar(docente, { numeroSemana: 0 }));
  await rechazo(registrar(docente, { numeroSemana: 11 }), 'INVALID_WEEK');
  await rechazo(registrar(docente, { tipo: 'EXAMEN' }));
  await rechazo(registrar(docente, { titulo: '' }));
  await rechazo(registrar(docente, { docenteId: String(cuentaDocente.docenteId) }));
  await rechazo(registrar(docente, { estadoRevision: 'VALIDADA' }));
  await rechazo(registrar(docente, { enlaces: ['http://example.org'] }));
  await rechazo(registrar(docente, { enlaces: ['https://a.org/1', 'https://a.org/1'] }));
  await rechazo(
    registrar(docente, { enlaces: [1, 2, 3, 4, 5, 6].map((n) => `https://a.org/${n}`) }),
  );
  await rechazo(registrar(docente, {}, [[EXE, 'virus.pdf']]), 'FILE_TYPE_NOT_ALLOWED');
  await rechazo(
    registrar(docente, {}, [
      [PDF, '1.pdf'],
      [PDF, '2.pdf'],
      [PDF, '3.pdf'],
      [PDF, '4.pdf'],
    ]),
    'TOO_MANY_FILES',
  );
  const grande = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
  await rechazo(registrar(docente, {}, [[grande, 'grande.pdf']]), 'FILE_TOO_LARGE');
  await docente.patch(rutaActividad(999999)).send({ titulo: 'X' }).expect(404);
  assert.equal(await prisma.evidenciaPedagogica.count(), filas);
  assert.equal(await archivosEnDisco(), enDisco);
});

test('EVP-11 solo el docente vigente de la clase escribe; la familia nunca', async () => {
  const { id } = (await registrar(docente, { numeroSemana: 5 }).expect(201)).body.data;
  await registrar(docenteAjeno).expect(403);
  await docenteAjeno.patch(rutaActividad(id)).send({ titulo: 'Ajeno' }).expect(403);
  await docenteAjeno.get(rutaActividad(id)).expect(403);
  await docenteAjeno.delete(rutaActividad(id)).expect(403);
  await registrar(apoderado).expect(403);
  await apoderado.patch(rutaActividad(id)).send({ titulo: 'Familia' }).expect(403);
  await apoderado.delete(rutaActividad(id)).expect(403);
  await request(app).get(rutaActividad(id)).expect(401);
});

test('EVP-12 dos subidas simultáneas no superan tres archivos activos', async () => {
  const { id } = (await registrar(docente, { numeroSemana: 5 }, [[PDF, 'base.pdf']]).expect(201))
    .body.data;
  const enDisco = await archivosEnDisco();
  const subir = () =>
    docente
      .patch(rutaActividad(id))
      .attach('archivos', PDF, 'a.pdf')
      .attach('archivos', PNG, 'b.png');
  const respuestas = await Promise.all([subir(), subir()]);
  assert.deepEqual(respuestas.map(({ status }) => status).sort(), [200, 400]);
  assert.equal(
    await prisma.archivoEvidenciaPedagogica.count({ where: { evidenciaId: id, activo: true } }),
    3,
  );
  assert.equal(await archivosEnDisco(), enDisco + 2);
});

test('EVP-13 la coordinación revisa solo lo realizado; lo validado queda fijo para el docente', async () => {
  const planificada = (await registrar(docente, { numeroSemana: 6 }).expect(201)).body.data;
  const realizada = (await registrar(docente, { numeroSemana: 6, realizada: 'true' }).expect(201))
    .body.data;
  const observar = (await registrar(docente, { numeroSemana: 7, realizada: 'true' }).expect(201))
    .body.data;
  const revision = (id) => `${rutaActividad(id)}/revision`;

  const noRealizada = await admin
    .put(revision(planificada.id))
    .send({ estadoRevision: 'VALIDADA' })
    .expect(409);
  assert.equal(noRealizada.body.error.code, 'EVIDENCE_NOT_DONE');
  await admin.put(revision(realizada.id)).send({ estadoRevision: 'OBSERVADA' }).expect(400);
  await docente.put(revision(realizada.id)).send({ estadoRevision: 'VALIDADA' }).expect(403);

  const validada = await admin
    .put(revision(realizada.id))
    .send({ estadoRevision: 'VALIDADA' })
    .expect(200);
  assert.equal(validada.body.data.estadoRevision, 'VALIDADA');
  const fija = await docente
    .patch(rutaActividad(realizada.id))
    .send({ titulo: 'Cambio' })
    .expect(409);
  assert.equal(fija.body.error.code, 'EVIDENCE_VALIDATED');
  await docente.delete(rutaActividad(realizada.id)).expect(409);
  await admin
    .patch(rutaActividad(realizada.id))
    .send({ titulo: 'Corregido por admin' })
    .expect(200);

  await admin
    .put(revision(observar.id))
    .send({ estadoRevision: 'OBSERVADA', observacionesRevision: 'Falta adjuntar la ficha.' })
    .expect(200);
  const vista = (await docente.get(rutaActividad(observar.id)).expect(200)).body.data;
  assert.equal(vista.estadoRevision, 'OBSERVADA');
  assert.equal(vista.observacionesRevision, 'Falta adjuntar la ficha.');
  const [revisado] = await eventos('EVIDENCIA_PEDAGOGICA_REVISADA', observar.id);
  assert.equal(revisado.detalle.valorNuevo.estadoRevision, 'OBSERVADA');
  // Editar una observada no la devuelve a pendiente: la vuelve a revisar la coordinación.
  await docente.patch(rutaActividad(observar.id)).send({ titulo: 'Con ficha' }).expect(200);
  const tras = await prisma.evidenciaPedagogica.findUnique({ where: { id: observar.id } });
  assert.equal(tras.estadoRevision, 'OBSERVADA');
});

test('EVP-14 la familia ve solo lo realizado y no observado, sin datos de revisión', async () => {
  const consulta = `${base}/evidencias-pedagogicas?matriculaId=${matricula.id}&cursoId=${curso.id}&bimestreId=${bimestre.id}`;
  const { body } = await apoderado.get(consulta).expect(200);
  assert.equal(body.data.semanas.length, 10);
  assert.equal(body.data.curso.nombre, 'Matemática');
  const visibles = body.data.semanas.flatMap(({ evidencias }) => evidencias);
  assert.ok(visibles.length > 0);
  const enBase = await prisma.evidenciaPedagogica.findMany({
    where: { id: { in: visibles.map(({ id }) => id) } },
  });
  assert.ok(
    enBase.every((item) => item.estado === 'REALIZADA' && item.estadoRevision !== 'OBSERVADA'),
  );
  assert.doesNotMatch(JSON.stringify(body), /estadoRevision|observaciones|revisor|docente/i);
  const oculta = await prisma.evidenciaPedagogica.findFirst({
    where: { planId: plan.id, estado: 'PLANIFICADA', activo: true },
  });
  await apoderado.get(rutaActividad(oculta.id)).expect(403);
  const detalle = (await apoderado.get(rutaActividad(visibles[0].id)).expect(200)).body.data;
  assert.deepEqual(Object.keys(detalle).sort(), [
    'archivos',
    'descripcion',
    'enlaces',
    'fechaRealizacion',
    'id',
    'numeroSemana',
    'tipo',
    'titulo',
  ]);
  await apoderadoAjeno.get(consulta).expect(403);
  await apoderado.get(`${base}/evidencias-pedagogicas?matriculaId=${matricula.id}`).expect(400);
  // Otro curso de la misma sección sin plan: semanas vacías, no error.
  const sinPlan = await apoderado
    .get(consulta.replace(`cursoId=${curso.id}`, `cursoId=${cursoAjeno.id}`))
    .expect(200);
  assert.ok(sinPlan.body.data.semanas.every(({ evidencias }) => evidencias.length === 0));
});

test('EVP-15 acortar el bimestre sin dejar fuera actividades; si las deja, 409', async () => {
  // Hay actividades hasta la semana 7: 6 semanas no alcanzan.
  const corto = await admin
    .patch(`${base}/bimestres/${bimestre.id}`)
    .send({ fechaInicio: diaRelativo(-14), fechaFin: diaRelativo(27) })
    .expect(409);
  assert.equal(corto.body.error.code, 'TERM_HAS_LATER_WEEKS');
  assert.ok(corto.body.error.details.some(({ semana }) => semana === 7));
  await admin
    .patch(`${base}/bimestres/${bimestre.id}`)
    .send({ fechaInicio: diaRelativo(-14), fechaFin: diaRelativo(40) })
    .expect(200);
});

test('EVP-16 pasado el fin del bimestre el docente lee; el administrador corrige con motivo', async () => {
  const { id } = (await registrar(docente, { numeroSemana: 2 }).expect(201)).body.data;
  await prisma.bimestreAcademico.update({
    where: { id: bimestre.id },
    data: {
      fechaInicio: new Date(hoy().getTime() - 70 * DIA),
      fechaFin: new Date(hoy().getTime() - DIA),
    },
  });
  try {
    const plano = (await docente.get(`${base}/planes-academicos/${plan.id}`).expect(200)).body.data;
    assert.equal(plano.bimestre.cerrado, true);
    assert.equal(plano.puedeEditar, false);
    const cerrado = await docente.patch(rutaActividad(id)).send({ titulo: 'Tarde' }).expect(409);
    assert.equal(cerrado.body.error.code, 'TERM_CLOSED');
    await registrar(docente).expect(409);
    await docente.delete(rutaActividad(id)).expect(409);
    const sinMotivo = await admin.patch(rutaActividad(id)).send({ titulo: 'Tarde' }).expect(400);
    assert.equal(sinMotivo.body.error.code, 'REASON_REQUIRED');
    await admin
      .patch(rutaActividad(id))
      .send({ titulo: 'Corrección', motivo: 'El docente lo pidió por escrito.' })
      .expect(200);
    const [modificado] = await eventos('EVIDENCIA_PEDAGOGICA_MODIFICADA', id);
    assert.equal(modificado.detalle.motivo, 'El docente lo pidió por escrito.');
    const crearCerrado = await docente
      .post(`${base}/planes-academicos`)
      .send({ asignacionId: asignacion.id, bimestreId: bimestre.id, titulo: 'T', objetivo: 'O' })
      .expect(409);
    assert.ok(['TERM_CLOSED', 'PLAN_EXISTS'].includes(crearCerrado.body.error.code));
  } finally {
    await prisma.bimestreAcademico.update({
      where: { id: bimestre.id },
      data: {
        fechaInicio: new Date(`${diaRelativo(-14)}T00:00:00Z`),
        fechaFin: new Date(`${diaRelativo(40)}T00:00:00Z`),
      },
    });
  }
});

test('EVP-17 la base de datos rechaza estados incoherentes aunque se salte el servicio', async () => {
  const datos = {
    planId: plan.id,
    numeroSemana: 1,
    tipo: 'OTRO',
    titulo: 'Directo',
    creadoPorId: cuentaDocente.id,
    modificadoPorId: cuentaDocente.id,
  };
  const violaCheck = (operacion, restriccion) =>
    assert.rejects(operacion, (error) => {
      const causa = error.meta?.driverAdapterError?.cause;
      assert.equal(causa?.code, '23514', error.message);
      assert.match(causa.message, new RegExp(`"${restriccion}"`));
      return true;
    });
  const crear = (cambios) => prisma.evidenciaPedagogica.create({ data: { ...datos, ...cambios } });
  await violaCheck(crear({ numeroSemana: 0 }), 'EvidenciaPedagogica_semana_positiva');
  await violaCheck(crear({ estado: 'REALIZADA' }), 'EvidenciaPedagogica_fecha_realizacion');
  await violaCheck(
    crear({ fechaRealizacion: new Date() }),
    'EvidenciaPedagogica_fecha_realizacion',
  );
  await violaCheck(crear({ estadoRevision: 'VALIDADA' }), 'EvidenciaPedagogica_revision_realizada');
  await violaCheck(
    crear({ estado: 'REALIZADA', fechaRealizacion: new Date(), estadoRevision: 'OBSERVADA' }),
    'EvidenciaPedagogica_observacion',
  );
  await violaCheck(
    crear({ enlaces: [1, 2, 3, 4, 5, 6].map((n) => `https://a.org/${n}`) }),
    'EvidenciaPedagogica_max_enlaces',
  );
  await assert.rejects(
    prisma.planAcademico.create({
      data: {
        bimestreId: bimestre.id,
        asignacionId: asignacion.id,
        cursoId: curso.id,
        seccionId: seccion.id,
        titulo: 'Duplicado',
        objetivo: 'O',
        fechaInicio: new Date(),
        creadoPorId: cuentaDocente.id,
        modificadoPorId: cuentaDocente.id,
      },
    }),
    (error) => error.code === 'P2002',
  );
  // La asignación de Arte no puede declararse como clase de Matemática.
  await assert.rejects(
    prisma.planAcademico.create({
      data: {
        bimestreId: bimestre2.id,
        asignacionId: asignacionAjena.id,
        cursoId: curso.id,
        seccionId: seccion.id,
        titulo: 'Incoherente',
        objetivo: 'O',
        fechaInicio: new Date(),
        creadoPorId: cuentaDocente.id,
        modificadoPorId: cuentaDocente.id,
      },
    }),
    (error) => error.code === 'P2003',
  );
});

test('EVP-18 tras cambiar de docente, el nuevo gestiona el plan y el anterior no', async () => {
  await dictar(curso.id, cuentaNueva.docenteId, 3);
  await prisma.cursoSeccionDocente.update({
    where: { id: asignacion.id },
    data: { activo: false },
  });
  try {
    await docente.get(`${base}/planes-academicos/${plan.id}`).expect(403);
    await registrar(docente).expect(403);
    await docenteNuevo.get(`${base}/planes-academicos/${plan.id}`).expect(200);
    await registrar(docenteNuevo, { titulo: 'Del docente nuevo' }).expect(201);
    await docenteNuevo
      .patch(`${base}/planes-academicos/${plan.id}`)
      .send({ objetivo: 'Continúa el plan' })
      .expect(200);
  } finally {
    await prisma.cursoSeccionDocente.update({
      where: { id: asignacion.id },
      data: { activo: true },
    });
  }
});

test('EVP-19 desactivar el plan desactiva sus actividades y lo audita', async () => {
  await docente.delete(`${base}/planes-academicos/${plan.id}`).expect(403);
  const activas = await prisma.evidenciaPedagogica.count({
    where: { planId: plan.id, activo: true },
  });
  await admin.delete(`${base}/planes-academicos/${plan.id}`).expect(200);
  assert.equal(
    await prisma.evidenciaPedagogica.count({ where: { planId: plan.id, activo: true } }),
    0,
  );
  const [registro] = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'PLAN_ACADEMICO_DESACTIVADO', entidadId: plan.id },
  });
  assert.equal(registro.detalle.contexto.actividadesDesactivadas, activas);
  await docente.get(`${base}/planes-academicos/${plan.id}`).expect(404);
});
