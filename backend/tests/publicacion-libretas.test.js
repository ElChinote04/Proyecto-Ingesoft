import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const apoderado = request.agent(app);
const apoderadoOtro = request.agent(app);
let cuentaDocente, cuentaApoderado, cuentaApoderadoOtro, anio, otroAnio, grado, gradoSinRegla, aula;
let matematica, geografia, competencia, competencia2, bimestre, bimestre2;
let bloques = 0;

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: identificador,
    nombres: identificador,
    apellidos: 'Libreta',
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

async function dictar(cursoId, seccionId) {
  bloques += 1;
  await alta('admin/bloques', {
    cursoId,
    seccionId,
    docenteId: cuentaDocente.docenteId,
    aulaId: aula.id,
    diaSemana: 1 + (bloques % 5),
    horaInicio: `${String(7 + Math.floor(bloques / 5)).padStart(2, '0')}:00`,
    horaFin: `${String(8 + Math.floor(bloques / 5)).padStart(2, '0')}:00`,
  });
}

async function crearAlumno(codigo, seccionId) {
  const alumno = await alta('admin/estudiantes', {
    numeroDocumento: codigo,
    nombres: codigo,
    apellidos: 'Secreto',
  });
  const matricula = await alta('admin/matriculas', { estudianteId: alumno.id, seccionId });
  return { ...alumno, matricula };
}

async function crearSeccion(nombre, { gradoId = grado.id, anioId = anio.id, cursoId } = {}) {
  const seccion = await alta('admin/catalogos/secciones', {
    nombre,
    gradoId,
    anioAcademicoId: anioId,
  });
  if (cursoId !== null) await dictar(cursoId ?? matematica.id, seccion.id);
  return seccion;
}

const estado = async (consulta = '') =>
  (
    await admin
      .get(`${base}/calificaciones/bimestres/${bimestre.id}/publicacion?limite=50${consulta}`)
      .expect(200)
  ).body.data;
const filaDe = async (seccion) => (await estado()).secciones.find((fila) => fila.id === seccion.id);
const publicar = (seccion, agente = admin) =>
  agente.post(
    `${base}/calificaciones/bimestres/${bimestre.id}/secciones/${seccion.id}/publicacion`,
  );
const publicarVarias = (seccionIds, agente = admin) =>
  agente.post(`${base}/calificaciones/bimestres/${bimestre.id}/publicacion`).send({ seccionIds });

const calificar = (matriculaId, calificaciones) =>
  docente
    .put(`${base}/matriculas/${matriculaId}/calificaciones`)
    .send({ bimestreId: bimestre.id, calificaciones });
const notasDe = async (matriculaId) =>
  (
    await docente
      .get(`${base}/matriculas/${matriculaId}/calificaciones?bimestreId=${bimestre.id}`)
      .expect(200)
  ).body.data.cursos[0].competencias;
const registrarEvidencia = async (notaId) =>
  (
    await docente
      .post(`${base}/calificaciones-competencias/${notaId}/evidencias`)
      .field('titulo', 'Evidencia')
      .field('descripcion', 'Sustento de la nota')
      .expect(201)
  ).body.data;

async function completar(matriculaId) {
  await calificar(matriculaId, [
    { competenciaId: competencia.id, nivelLogro: 'A' },
    { competenciaId: competencia2.id, nivelLogro: 'B' },
  ]).expect(200);
  const evidencias = [];
  for (const { calificacionCompetenciaId } of await notasDe(matriculaId))
    evidencias.push(await registrarEvidencia(calificacionCompetenciaId));
  return evidencias;
}

let seccionA, seccionB, seccionC, seccionD, seccionE, seccionF, seccionG, seccionVacia;
let seccionOtroAnio, seccionSinRegla, alumnoA, alumnoA2, alumnoB, alumnoC, alumnoD;

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-LIB',
      nombres: 'Administrador',
      apellidos: 'Libreta',
      identificador: 'admin-lib',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-lib', contrasena: clave })
    .expect(200);

  cuentaDocente = await crearCuenta('docente-lib', ['DOCENTE'], docente);
  cuentaApoderado = await crearCuenta('apoderado-lib', ['APODERADO'], apoderado);
  cuentaApoderadoOtro = await crearCuenta('apoderado-otro-lib', ['APODERADO'], apoderadoOtro);

  anio = await alta('admin/catalogos/anios', { codigo: '2037' });
  otroAnio = await alta('admin/catalogos/anios', { codigo: '2038' });
  grado = await alta('admin/catalogos/grados', { nombre: 'Quinto' });
  gradoSinRegla = await alta('admin/catalogos/grados', { nombre: 'Sexto' });
  aula = await alta('admin/catalogos/aulas', { codigo: 'L501' });
  matematica = await alta('admin/catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  geografia = await alta('admin/catalogos/cursos', { codigo: 'GEO', nombre: 'Geografía' });
  competencia = await alta('competencias', {
    cursoId: matematica.id,
    codigo: 'MAT-1',
    nombre: 'Resuelve',
    descripcion: 'Prueba',
  });
  competencia2 = await alta('competencias', {
    cursoId: matematica.id,
    codigo: 'MAT-2',
    nombre: 'Comunica',
    descripcion: 'Prueba',
  });
  await alta('competencias', {
    cursoId: geografia.id,
    codigo: 'GEO-1',
    nombre: 'Ubica',
    descripcion: 'Prueba',
  });
  await alta('reglas-consolidacion', {
    gradoId: grado.id,
    cursoId: matematica.id,
    nombre: 'Regla',
    version: 1,
    metodo: 'frecuencia',
  });

  seccionA = await crearSeccion('A');
  seccionB = await crearSeccion('B');
  seccionC = await crearSeccion('C');
  seccionD = await crearSeccion('D');
  seccionE = await crearSeccion('E');
  seccionF = await crearSeccion('F');
  seccionG = await crearSeccion('G');
  seccionVacia = await crearSeccion('H', { cursoId: null });
  seccionSinRegla = await crearSeccion('A', { gradoId: gradoSinRegla.id, cursoId: geografia.id });
  seccionOtroAnio = await crearSeccion('Z', { anioId: otroAnio.id, cursoId: null });

  alumnoA = await crearAlumno('EST-A', seccionA.id);
  alumnoA2 = await crearAlumno('EST-A2', seccionA.id);
  alumnoB = await crearAlumno('EST-B', seccionB.id);
  alumnoC = await crearAlumno('EST-C', seccionC.id);
  alumnoD = await crearAlumno('EST-D', seccionD.id);
  await crearAlumno('EST-SR', seccionSinRegla.id);

  const vincular = (apoderadoId, estudianteId) =>
    admin
      .put(`${base}/admin/apoderados/estudiantes`)
      .send({ apoderadoId, estudianteId, parentesco: 'Madre', activo: true })
      .expect(200);
  await vincular(cuentaApoderado.apoderadoId, alumnoA.id);
  await vincular(cuentaApoderadoOtro.apoderadoId, alumnoB.id);

  bimestre = await prisma.bimestreAcademico.findFirst({
    where: { anioAcademicoId: anio.id, numero: 1 },
  });
  bimestre2 = await prisma.bimestreAcademico.findFirst({
    where: { anioAcademicoId: anio.id, numero: 2 },
  });
});
after(() => prisma.$disconnect());

test('PUB-01 el docente ya no publica ni consulta el estado', async () => {
  await docente.get(`${base}/calificaciones/bimestres/${bimestre.id}/publicacion`).expect(403);
  await publicar(seccionA, docente).expect(403);
  await publicarVarias([seccionA.id], docente).expect(403);
});

test('PUB-02 con pendientes no publica ni deja rastro', async () => {
  const { body } = await publicar(seccionA).expect(409);
  assert.equal(body.error.code, 'PUBLICATION_INCOMPLETE');
  assert.deepEqual(body.error.details, { totalEsperado: 4, totalCompleto: 0 });
  assert.equal(await prisma.publicacionSeccion.count(), 0);
  assert.equal(
    await prisma.registroAuditoria.count({ where: { tipoEvento: 'NOTA_PUBLICADA' } }),
    0,
  );
});

test('PUB-03 el estado separa pendientes, pagina y no expone alumnos', async () => {
  await calificar(alumnoA.matricula.id, [
    { competenciaId: competencia.id, nivelLogro: 'A' },
    { competenciaId: competencia2.id, nivelLogro: 'B' },
  ]).expect(200);
  const fila = await filaDe(seccionA);
  assert.equal(fila.estado, 'CON_PENDIENTES');
  assert.equal(fila.nombre, 'Quinto A');
  assert.deepEqual(fila.pendientes, [
    {
      curso: 'Matemática',
      docente: 'docente-lib Libreta',
      sinNota: 2,
      sinEvidencia: 2,
      sinRegla: false,
    },
  ]);
  const consulta = await estado();
  assert.equal(JSON.stringify(consulta).includes('Secreto'), false);
  assert.equal(consulta.paginacion.total, 9);
  assert.equal((await filaDe(seccionVacia)).estado, 'SIN_DATOS');
  assert.equal(
    consulta.secciones.some(({ id }) => id === seccionOtroAnio.id),
    false,
  );

  const ruta = `${base}/calificaciones/bimestres/${bimestre.id}/publicacion`;
  const pagina2 = (await admin.get(`${ruta}?limite=10&pagina=2`).expect(200)).body.data;
  assert.equal(pagina2.secciones.length, 0);
  await admin.get(`${ruta}?limite=7`).expect(400);
  await admin.get(`${base}/calificaciones/bimestres/999999/publicacion`).expect(404);
  const vacia = await publicar(seccionVacia).expect(404);
  assert.equal(vacia.body.error.code, 'GRADES_NOT_FOUND');
});

test('PUB-04 una evidencia inactiva no cuenta como completa', async () => {
  const [primera] = await notasDe(alumnoA.matricula.id);
  const evidencia = await registrarEvidencia(primera.calificacionCompetenciaId);
  assert.equal((await filaDe(seccionA)).totalCompleto, 1);
  await docente.delete(`${base}/evidencias-calificaciones/${evidencia.id}`).expect(200);
  assert.equal((await filaDe(seccionA)).totalCompleto, 0);
});

test('PUB-05 no se exige una matrícula ni una competencia inactiva', async () => {
  assert.equal((await filaDe(seccionA)).totalEsperado, 4);
  await prisma.matricula.update({
    where: { id: alumnoA2.matricula.id },
    data: { activo: false },
  });
  assert.equal((await filaDe(seccionA)).totalEsperado, 2);
  await prisma.competencia.update({ where: { id: competencia2.id }, data: { activo: false } });
  assert.equal((await filaDe(seccionA)).totalEsperado, 1);
  await prisma.competencia.update({ where: { id: competencia2.id }, data: { activo: true } });
});

test('PUB-06 una sección completa se publica una sola vez y su libreta se ve', async () => {
  const antes = await apoderado.get(`${base}/calificaciones`).expect(200);
  assert.equal(antes.body.data.length, 0);
  for (const { calificacionCompetenciaId } of await notasDe(alumnoA.matricula.id))
    await registrarEvidencia(calificacionCompetenciaId);
  assert.equal((await filaDe(seccionA)).estado, 'LISTA');

  const { body } = await publicar(seccionA).expect(201);
  assert.equal(body.data.yaPublicado, false);
  const fila = await filaDe(seccionA);
  assert.equal(fila.estado, 'PUBLICADA');
  assert.ok(fila.publicadoEn);

  const libreta = await apoderado.get(`${base}/calificaciones`).expect(200);
  assert.equal(libreta.body.data[0].competencias.length, 2);

  const repetida = await publicar(seccionA).expect(200);
  assert.equal(repetida.body.data.yaPublicado, true);
  const eventos = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'NOTA_PUBLICADA' },
  });
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].entidad, 'PublicacionSeccion');
  assert.deepEqual(eventos[0].detalle.valorNuevo, {
    bimestreId: bimestre.id,
    seccionId: seccionA.id,
  });
});

test('PUB-07 una sección con pendientes no impide publicar otra', async () => {
  assert.equal((await filaDe(seccionB)).estado, 'CON_PENDIENTES');
  assert.equal((await filaDe(seccionA)).estado, 'PUBLICADA');
});

test('PUB-08 otra sección no ve notas hasta publicarse la suya', async () => {
  await calificar(alumnoB.matricula.id, [
    { competenciaId: competencia.id, nivelLogro: 'C' },
  ]).expect(200);
  const libreta = await apoderadoOtro.get(`${base}/calificaciones`).expect(200);
  assert.equal(libreta.body.data.length, 0);
});

test('PUB-09 una sección de otro año no se publica', async () => {
  const { body } = await publicar(seccionOtroAnio).expect(400);
  assert.equal(body.error.code, 'INVALID_TERM_CONTEXT');
  await publicar({ id: 999999 }).expect(404);
});

test('PUB-10 antes de publicar el docente cambia nota y evidencia cuantas veces quiera', async () => {
  const matriculaId = alumnoB.matricula.id;
  for (const nivelLogro of ['A', 'B', 'AD'])
    await calificar(matriculaId, [{ competenciaId: competencia.id, nivelLogro }]).expect(200);
  const [nota] = await notasDe(matriculaId);
  assert.equal(nota.nivelLogro, 'AD');
  const evidencia = await registrarEvidencia(nota.calificacionCompetenciaId);
  for (const titulo of ['Uno', 'Dos'])
    await docente
      .patch(`${base}/evidencias-calificaciones/${evidencia.id}`)
      .send({ titulo })
      .expect(200);
});

test('PUB-11 con la sección publicada las rutas de docente no cambian notas', async () => {
  const matriculaId = alumnoA.matricula.id;
  const [nota] = await notasDe(matriculaId);
  const detalle = await prisma.calificacionCompetencia.findUnique({
    where: { id: nota.calificacionCompetenciaId },
    include: { calificacion: true },
  });
  const { calificacion } = detalle;
  const intentos = [
    () => calificar(matriculaId, [{ competenciaId: competencia.id, nivelLogro: 'C' }]),
    () =>
      docente.post(`${base}/calificaciones`).send({
        matriculaId,
        bimestreId: bimestre.id,
        asignacionId: calificacion.asignacionId,
        reglaId: calificacion.reglaId,
        competencias: [{ competenciaId: competencia.id, nivelLogro: 'C' }],
      }),
    () =>
      docente.post(`${base}/calificaciones-competencias`).send({
        calificacionId: calificacion.id,
        competenciaId: competencia.id,
        nivelLogro: 'C',
      }),
  ];
  for (const intento of intentos) {
    const { body } = await intento().expect(409);
    assert.equal(body.error.code, 'TERM_PUBLISHED');
  }
  const [despues] = await notasDe(matriculaId);
  assert.equal(despues.nivelLogro, nota.nivelLogro);
  const ficha = await docente
    .get(`${base}/matriculas/${matriculaId}/calificaciones?bimestreId=${bimestre.id}`)
    .expect(200);
  assert.equal(ficha.body.data.bimestre.publicado, true);
});

test('PUB-12 el bloqueo es por bimestre y sección', async () => {
  await calificar(alumnoB.matricula.id, [
    { competenciaId: competencia.id, nivelLogro: 'B' },
  ]).expect(200);
  await docente
    .put(`${base}/matriculas/${alumnoA.matricula.id}/calificaciones`)
    .send({
      bimestreId: bimestre2.id,
      calificaciones: [{ competenciaId: competencia.id, nivelLogro: 'B' }],
    })
    .expect(200);
});

test('PUB-13 tras publicar el administrador necesita motivo', async () => {
  const [nota] = await notasDe(alumnoA.matricula.id);
  const detalle = `${base}/calificaciones-competencias/${nota.calificacionCompetenciaId}`;
  const { calificacionId } = await prisma.calificacionCompetencia.findUnique({
    where: { id: nota.calificacionCompetenciaId },
  });
  const calificacion = `${base}/calificaciones/${calificacionId}`;
  const cambio = { competencias: [{ competenciaId: competencia.id, nivelLogro: 'C' }] };
  const intentos = [
    () => admin.put(detalle).send({ nivelLogro: 'C' }),
    () => admin.delete(detalle),
    () => admin.put(calificacion).send(cambio),
    () => admin.delete(calificacion),
  ];
  for (const intento of intentos) {
    const { body } = await intento().expect(400);
    assert.equal(body.error.code, 'CORRECTION_REASON_REQUIRED');
  }
  await admin.put(detalle).send({ nivelLogro: 'C', motivo: 'no' }).expect(400);
});

test('PUB-14 con motivo la corrección se aplica y queda en la auditoría', async () => {
  const [nota, nota2] = await notasDe(alumnoA.matricula.id);
  const id = nota.calificacionCompetenciaId;
  const motivo = 'Error de digitación';
  await admin
    .put(`${base}/calificaciones-competencias/${id}`)
    .send({ nivelLogro: 'AD', motivo })
    .expect(200);
  const corregida = await prisma.calificacionCompetencia.findUnique({ where: { id } });
  assert.equal(corregida.nivelLogro, 'AD');
  const [evento] = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'CALIFICACION_COMPETENCIA_MODIFICADA', entidadId: id },
  });
  assert.equal(evento.detalle.motivo, motivo);

  await admin
    .put(`${base}/calificaciones/${corregida.calificacionId}`)
    .send({ competencias: [{ competenciaId: competencia.id, nivelLogro: 'A' }], motivo })
    .expect(200);
  await admin
    .delete(`${base}/calificaciones-competencias/${nota2.calificacionCompetenciaId}`)
    .send({ motivo })
    .expect(200);
  const [baja] = await prisma.registroAuditoria.findMany({
    where: {
      tipoEvento: 'CALIFICACION_COMPETENCIA_DESACTIVADA',
      entidadId: nota2.calificacionCompetenciaId,
    },
  });
  assert.equal(baja.detalle.motivo, motivo);
});

test('PUB-15 antes de publicar el administrador corrige sin motivo', async () => {
  const [nota] = await notasDe(alumnoB.matricula.id);
  await admin
    .put(`${base}/calificaciones-competencias/${nota.calificacionCompetenciaId}`)
    .send({ nivelLogro: 'A' })
    .expect(200);
});

test('PUB-16 publicar y dar de baja a la vez nunca deja una sección incompleta', async () => {
  let evidencias = await completar(alumnoC.matricula.id);
  for (let intento = 0; intento < 8; intento += 1) {
    const [publicacion, baja] = await Promise.all([
      publicar(seccionC),
      docente.delete(`${base}/evidencias-calificaciones/${evidencias[0].id}`),
    ]);
    const publicada = await prisma.publicacionSeccion.count({
      where: { bimestreId: bimestre.id, seccionId: seccionC.id },
    });
    const activa = await prisma.evidenciaCalificacion.findUnique({
      where: { id: evidencias[0].id },
    });
    if (publicada) {
      assert.equal(publicacion.status, 201);
      assert.equal(baja.status, 409);
      assert.equal(activa.activo, true);
      return;
    }
    assert.equal(publicacion.status, 409);
    assert.equal(baja.status, 200);
    assert.equal(activa.activo, false);
    const [nota] = await notasDe(alumnoC.matricula.id);
    evidencias = [await registrarEvidencia(nota.calificacionCompetenciaId)];
  }
});

test('PUB-17 dos publicaciones simultáneas dejan una sola fila', async () => {
  await completar(alumnoD.matricula.id);
  const respuestas = await Promise.all([publicar(seccionD), publicar(seccionD)]);
  assert.deepEqual(respuestas.map(({ status }) => status).sort(), [200, 201]);
  assert.equal(
    await prisma.publicacionSeccion.count({
      where: { bimestreId: bimestre.id, seccionId: seccionD.id },
    }),
    1,
  );
});

test('PUB-18 la migración conserva lo publicado por bimestre completo', async () => {
  const migracion = await readFile(
    new URL(
      '../prisma/migrations/20261106120000_evidencias_calificacion/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const insercion = migracion.match(/INSERT INTO "PublicacionSeccion"[\s\S]*?;/)[0];
  await prisma.registroAuditoria.create({
    data: {
      usuarioId: cuentaDocente.id,
      tipoEvento: 'NOTA_PUBLICADA',
      entidad: 'BimestreAcademico',
      entidadId: bimestre2.id,
      detalle: {},
    },
  });
  const publicadas = await prisma.$executeRawUnsafe(insercion);
  assert.equal(publicadas, 9);
  const filas = await prisma.publicacionSeccion.findMany({ where: { bimestreId: bimestre2.id } });
  assert.equal(
    filas.some(({ seccionId }) => seccionId === seccionOtroAnio.id),
    false,
  );
  await prisma.publicacionSeccion.deleteMany({ where: { bimestreId: bimestre2.id } });
});

test('PUB-19 la masiva publica lo listo y detalla lo omitido', async () => {
  const alumnoE = await crearAlumno('EST-E', seccionE.id);
  const alumnoF = await crearAlumno('EST-F', seccionF.id);
  await crearAlumno('EST-G', seccionG.id);
  await completar(alumnoE.matricula.id);
  await completar(alumnoF.matricula.id);
  const { seccionesListas, resumen } = await estado();
  assert.deepEqual(
    seccionesListas.map(({ nombre }) => nombre),
    ['Quinto E', 'Quinto F'],
  );
  assert.equal(resumen.listas, 2);

  const { body } = await publicarVarias([
    seccionF.id,
    seccionG.id,
    seccionA.id,
    seccionVacia.id,
    seccionOtroAnio.id,
    999999,
  ]).expect(200);
  assert.deepEqual(body.data.publicadas, [{ id: seccionF.id, nombre: 'Quinto F' }]);
  assert.deepEqual(
    body.data.omitidas.map(({ id, razon }) => [id, razon]),
    [
      [seccionG.id, 'CON_PENDIENTES'],
      [seccionA.id, 'YA_PUBLICADA'],
      [seccionVacia.id, 'SIN_DATOS'],
      [seccionOtroAnio.id, 'OTRO_ANIO_ACADEMICO'],
      [999999, 'NO_ENCONTRADA'],
    ],
  );
});

test('PUB-20 la masiva solo publica lo que se le envía', async () => {
  assert.equal((await filaDe(seccionE)).estado, 'LISTA');
  await publicarVarias([seccionG.id]).expect(200);
  assert.equal((await filaDe(seccionE)).estado, 'LISTA');
});

test('PUB-21 la masiva registra un evento por sección y repetirla no duplica', async () => {
  const eventosDe = () =>
    prisma.registroAuditoria.findMany({
      where: {
        tipoEvento: 'NOTA_PUBLICADA',
        detalle: { path: ['contexto', 'masiva'], equals: true },
      },
    });
  const previos = (await eventosDe()).length;
  const { body } = await publicarVarias([seccionE.id]).expect(200);
  assert.equal(body.data.publicadas.length, 1);
  assert.equal((await eventosDe()).length, previos + 1);
  const repetida = await publicarVarias([seccionE.id]).expect(200);
  assert.deepEqual(repetida.body.data.publicadas, []);
  assert.equal(repetida.body.data.omitidas[0].razon, 'YA_PUBLICADA');
  assert.equal((await eventosDe()).length, previos + 1);
});

test('PUB-22 la masiva valida el cuerpo', async () => {
  await publicarVarias([]).expect(400);
  await publicarVarias([seccionA.id, seccionA.id]).expect(400);
  await admin
    .post(`${base}/calificaciones/bimestres/${bimestre.id}/publicacion`)
    .send({ seccionIds: [seccionA.id], todas: true })
    .expect(400);
  await publicarVarias([seccionA.id], request(app)).expect(401);
});

test('PUB-23 un curso sin regla se señala y solo afecta a sus secciones', async () => {
  const fila = await filaDe(seccionSinRegla);
  assert.equal(fila.estado, 'CON_PENDIENTES');
  assert.equal(fila.pendientes[0].sinRegla, true);
  assert.equal(fila.pendientes[0].curso, 'Geografía');
  assert.equal((await filaDe(seccionE)).estado, 'PUBLICADA');
});

test('PUB-24 reasignar un curso no exige dos veces la misma competencia', async () => {
  const otraCuenta = await crearCuenta('docente-otro-lib', ['DOCENTE'], request.agent(app));
  const antes = await filaDe(seccionB);
  await alta('admin/bloques', {
    cursoId: matematica.id,
    seccionId: seccionB.id,
    docenteId: otraCuenta.docenteId,
    aulaId: aula.id,
    diaSemana: 5,
    horaInicio: '18:00',
    horaFin: '19:00',
  });
  const despues = await filaDe(seccionB);
  assert.equal(despues.totalEsperado, antes.totalEsperado);
  assert.equal(despues.pendientes.length, 1);
  assert.equal(despues.pendientes[0].docente, 'docente-lib Libreta, docente-otro-lib Libreta');
});
