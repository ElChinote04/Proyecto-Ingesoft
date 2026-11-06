import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { consolidar } from '../src/services/calificacionesAlumno.service.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const docenteAjeno = request.agent(app);
const apoderado = request.agent(app);
let seccion, alumno, matricula, bimestre, bimestreOtroAnio, matematica, comunicacion, arte;
let competenciaMat, competenciaMat2, competenciaArte, competenciaAjena;

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: identificador,
    nombres: identificador,
    apellidos: 'Notas',
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

const consultar = (agente = docente, bimestreId = bimestre.id) =>
  agente.get(`${base}/matriculas/${matricula.id}/calificaciones?bimestreId=${bimestreId}`);
const guardar = (calificaciones, agente = docente, bimestreId = bimestre.id) =>
  agente
    .put(`${base}/matriculas/${matricula.id}/calificaciones`)
    .send({ bimestreId, calificaciones });

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-NOTAS',
      nombres: 'Administrador',
      apellidos: 'Notas',
      identificador: 'admin-notas',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-notas', contrasena: clave })
    .expect(200);

  const cuentaDocente = await crearCuenta('docente-notas', ['DOCENTE'], docente);
  const cuentaAjena = await crearCuenta('docente-ajeno-notas', ['DOCENTE'], docenteAjeno);
  const cuentaApoderado = await crearCuenta('apoderado-notas', ['APODERADO'], apoderado);

  const anio = await alta('admin/catalogos/anios', { codigo: '2033' });
  const otroAnio = await alta('admin/catalogos/anios', { codigo: '2034' });
  const grado = await alta('admin/catalogos/grados', { nombre: 'Cuarto' });
  seccion = await alta('admin/catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  const aula = await alta('admin/catalogos/aulas', { codigo: 'A401' });
  matematica = await alta('admin/catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  arte = await alta('admin/catalogos/cursos', { codigo: 'ART', nombre: 'Arte' });
  comunicacion = await alta('admin/catalogos/cursos', { codigo: 'COM', nombre: 'Comunicación' });

  const competencia = (cursoId, codigo) =>
    alta('competencias', { cursoId, codigo, nombre: codigo, descripcion: 'Prueba' });
  competenciaMat = await competencia(matematica.id, 'MAT-1');
  competenciaMat2 = await competencia(matematica.id, 'MAT-2');
  competenciaArte = await competencia(arte.id, 'ART-1');
  competenciaAjena = await competencia(comunicacion.id, 'COM-1');
  await alta('reglas-consolidacion', {
    gradoId: grado.id,
    cursoId: matematica.id,
    nombre: 'Regla',
    version: 1,
    metodo: 'frecuencia',
  });

  // Dos cursos propios y uno de otro docente en el mismo salón. Ningún bloque tiene sesiones.
  const bloque = (cursoId, docenteId, diaSemana) =>
    alta('admin/bloques', {
      cursoId,
      seccionId: seccion.id,
      docenteId,
      aulaId: aula.id,
      diaSemana,
      horaInicio: '08:00',
      horaFin: '09:00',
    });
  await bloque(matematica.id, cuentaDocente.docenteId, 1);
  await bloque(arte.id, cuentaDocente.docenteId, 2);
  await bloque(comunicacion.id, cuentaAjena.docenteId, 3);

  alumno = await alta('admin/estudiantes', {
    numeroDocumento: 'DNI-SECRETO',
    nombres: 'Lucía',
    apellidos: 'Notas',
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

  bimestre = await prisma.bimestreAcademico.findFirst({
    where: { anioAcademicoId: anio.id, numero: 1 },
  });
  bimestreOtroAnio = await prisma.bimestreAcademico.findFirst({
    where: { anioAcademicoId: otroAnio.id, numero: 1 },
  });
});
after(() => prisma.$disconnect());

test('US-018 consolida las estrategias reciente, frecuencia y prioridad', () => {
  const niveles = (valores) => valores.map((nivelLogro) => ({ nivelLogro }));

  assert.equal(
    consolidar(
      niveles(['C', 'B', 'A']),
      JSON.stringify({ estrategia: 'reciente', minimoEvidencias: 3 }),
    ),
    'A',
  );
  assert.equal(
    consolidar(
      niveles(['C', 'B', 'B']),
      JSON.stringify({ estrategia: 'frecuencia', minimoEvidencias: 3 }),
    ),
    'B',
  );
  assert.equal(
    consolidar(
      niveles(['C', 'B', 'AD']),
      JSON.stringify({ estrategia: 'prioridad', minimoEvidencias: 3 }),
    ),
    'AD',
  );
});

test('CAA-01 un docente sin sesiones generadas ve sus salones', async () => {
  const sesiones = await docente.get(`${base}/sesiones`).expect(200);
  assert.equal(sesiones.body.data.length, 0);
  const salones = await docente.get(`${base}/secciones`).expect(200);
  assert.deepEqual(salones.body.data, [
    {
      id: seccion.id,
      nombre: 'Cuarto A',
      anioAcademicoId: seccion.anioAcademicoId,
      anioAcademico: '2033',
    },
  ]);
});

test('CAA-02 solo el rol docente consulta salones', async () => {
  await request(app).get(`${base}/secciones`).expect(401);
  await admin.get(`${base}/secciones`).expect(403);
  await apoderado.get(`${base}/secciones`).expect(403);
});

test('CAA-03 la lista de alumnos trae solo lo que muestra la pantalla', async () => {
  const respuesta = await docente.get(`${base}/secciones/${seccion.id}/alumnos`).expect(200);
  assert.deepEqual(respuesta.body.data, [
    { matriculaId: matricula.id, codigo: alumno.codigoEstudiante, nombre: 'Lucía Notas' },
  ]);
  assert.doesNotMatch(JSON.stringify(respuesta.body), /DNI-SECRETO|numeroDocumento|nivelLogro/);
});

test('CAA-04 un salón ajeno o un id inválido no devuelve alumnos', async () => {
  const otra = await alta('admin/catalogos/secciones', {
    nombre: 'Z',
    gradoId: seccion.gradoId,
    anioAcademicoId: seccion.anioAcademicoId,
  });
  await docente.get(`${base}/secciones/${otra.id}/alumnos`).expect(403);
  await docente.get(`${base}/secciones/abc/alumnos`).expect(400);
});

test('CAA-05 la ficha agrupa solo los cursos del docente y avisa los que no tienen regla', async () => {
  const { cursos, bimestre: periodo } = (await consultar().expect(200)).body.data;
  assert.equal(periodo.id, bimestre.id);
  assert.deepEqual(
    cursos.map(({ nombre }) => nombre),
    ['Arte', 'Matemática'],
  );
  assert.equal(cursos[0].regla, null);
  assert.ok(cursos[1].regla);
  assert.deepEqual(
    cursos[1].competencias.map(({ codigo, nivelLogro }) => [codigo, nivelLogro]),
    [
      ['MAT-1', null],
      ['MAT-2', null],
    ],
  );
});

test('CAA-06 la ficha rechaza bimestre ausente o de otro año', async () => {
  await docente.get(`${base}/matriculas/${matricula.id}/calificaciones`).expect(400);
  await consultar(docente, bimestreOtroAnio.id).expect(400);
  await docente
    .get(`${base}/matriculas/999999/calificaciones?bimestreId=${bimestre.id}`)
    .expect(404);
});

test('CAA-07 guarda varias competencias de una vez y el apoderado las ve', async () => {
  const respuesta = await guardar([
    { competenciaId: competenciaMat.id, nivelLogro: 'B' },
    { competenciaId: competenciaMat2.id, nivelLogro: 'A' },
  ]).expect(200);
  assert.equal(respuesta.body.data.total, 2);

  const ficha = (await consultar().expect(200)).body.data;
  assert.deepEqual(
    ficha.cursos[1].competencias.map(({ nivelLogro }) => nivelLogro),
    ['B', 'A'],
  );
  // Aquí solo importa la visibilidad: publicar de verdad se prueba en publicacion-libretas.
  const publicacion = await prisma.publicacionSeccion.create({
    data: { bimestreId: bimestre.id, seccionId: seccion.id, publicadoPorId: 1 },
  });
  const libreta = await apoderado
    .get(`${base}/calificaciones?estudianteId=${alumno.id}`)
    .expect(200);
  assert.deepEqual(libreta.body.data[0].competencias.map(({ nivelLogro }) => nivelLogro).sort(), [
    'A',
    'B',
  ]);
  await prisma.publicacionSeccion.delete({ where: { id: publicacion.id } });
});

test('CAA-08 sobrescribir una nota conserva el valor anterior en la auditoría', async () => {
  const { resultados } = (
    await guardar([{ competenciaId: competenciaMat.id, nivelLogro: 'AD' }]).expect(200)
  ).body.data;
  const registros = await prisma.registroAuditoria.findMany({
    where: { entidad: 'Calificacion', entidadId: resultados[0].calificacionId },
    orderBy: { id: 'desc' },
  });
  assert.equal(registros[0].tipoEvento, 'NOTA_MODIFICADA');
  assert.ok(registros[0].detalle.valorAnterior);
  assert.deepEqual(registros[0].detalle.valorAnterior, {
    competenciaId: competenciaMat.id,
    nivelLogro: 'B',
  });
  assert.equal(registros[0].detalle.valorNuevo.nivelLogro, 'AD');
});

test('CAA-09 un nivel inválido, una lista vacía o repetida se rechazan', async () => {
  await guardar([{ competenciaId: competenciaMat.id, nivelLogro: 'Z' }]).expect(400);
  await guardar([]).expect(400);
  await guardar([
    { competenciaId: competenciaMat.id, nivelLogro: 'A' },
    { competenciaId: competenciaMat.id, nivelLogro: 'B' },
  ]).expect(400);
});

test('CAA-10 no se califica un curso de otro docente ni uno sin regla', async () => {
  const ajena = await guardar([{ competenciaId: competenciaAjena.id, nivelLogro: 'A' }]).expect(
    400,
  );
  assert.equal(ajena.body.error.code, 'INVALID_COMPETENCY_CONTEXT');
  const sinRegla = await guardar([{ competenciaId: competenciaArte.id, nivelLogro: 'A' }]).expect(
    404,
  );
  assert.equal(sinRegla.body.error.code, 'RULE_NOT_FOUND');
});

test('CAA-11 si una competencia falla no se guarda ninguna', async () => {
  await guardar([
    { competenciaId: competenciaMat2.id, nivelLogro: 'C' },
    { competenciaId: competenciaAjena.id, nivelLogro: 'A' },
  ]).expect(400);
  const ficha = (await consultar().expect(200)).body.data;
  assert.equal(ficha.cursos[1].competencias[1].nivelLogro, 'A');
});

test('CAA-12 solo un docente del salón puede guardar', async () => {
  await guardar([{ competenciaId: competenciaMat.id, nivelLogro: 'C' }], apoderado).expect(403);
  await guardar([{ competenciaId: competenciaMat.id, nivelLogro: 'C' }], docenteAjeno).expect(400);
});

test('CAA-13 las rutas por competencia ya no existen y plan-pago sigue accesible', async () => {
  await docente.get(`${base}/calificaciones/contexto`).expect(400);
  await docente.post(`${base}/calificaciones/competencias/bulk`).send({}).expect(404);
  // Administrador: si /matriculas exigiera el rol docente, aquí respondería 403.
  await admin.post(`${base}/matriculas/${matricula.id}/plan-pago`).send({}).expect(400);
});
