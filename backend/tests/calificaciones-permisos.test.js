import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const docenteAjeno = request.agent(app);
const apoderado = request.agent(app);
const apoderadoSinHijos = request.agent(app);
let notaHijo, notaOtroAlumno, detalleHijo;

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

// Crea la cuenta y deja hecha la sesión con la contraseña inicial ya cambiada.
let documentoCuenta = 10000000;
async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: String(++documentoCuenta),
    nombres: 'Usuario',
    apellidos: 'Permisos',
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

async function crearAlumnoMatriculado(numeroDocumento, seccionId) {
  const alumno = await alta('admin/estudiantes', {
    numeroDocumento,
    nombres: 'Alumno',
    apellidos: 'Permisos',
  });
  const matricula = await alta('admin/matriculas', { estudianteId: alumno.id, seccionId });
  return { alumno, matricula };
}

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: '90000000',
      nombres: 'Administrador',
      apellidos: 'Permisos',
      identificador: 'admin-permisos@prueba.local',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-permisos@prueba.local', contrasena: clave })
    .expect(200);

  const cuentaDocente = await crearCuenta('docente-permisos@prueba.local', ['DOCENTE'], docente);
  await crearCuenta('docente-ajeno-permisos@prueba.local', ['DOCENTE'], docenteAjeno);
  const cuentaApoderado = await crearCuenta(
    'apoderado-permisos@prueba.local',
    ['APODERADO'],
    apoderado,
  );
  await crearCuenta('apoderado-sin-hijos-permisos@prueba.local', ['APODERADO'], apoderadoSinHijos);

  const anio = await alta('admin/catalogos/anios', { codigo: '2030' });
  const grado = await alta('admin/catalogos/grados', { nombre: 'Primero' });
  const seccion = await alta('admin/catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  const curso = await alta('admin/catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  const aula = await alta('admin/catalogos/aulas', { codigo: 'A101' });
  const competencia = await alta('competencias', {
    cursoId: curso.id,
    codigo: 'C1',
    nombre: 'Resuelve problemas',
    descripcion: 'Competencia de prueba',
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

  const hijo = await crearAlumnoMatriculado('20000001', seccion.id);
  const otroAlumno = await crearAlumnoMatriculado('20000002', seccion.id);
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({
      apoderadoId: cuentaApoderado.apoderadoId,
      estudianteId: hijo.alumno.id,
      parentesco: 'Padre',
      activo: true,
    })
    .expect(200);

  const asignacion = await prisma.cursoSeccionDocente.findFirst({
    where: { cursoId: curso.id, seccionId: seccion.id },
  });
  const bimestre = await prisma.bimestreAcademico.findFirst({
    where: { anioAcademicoId: anio.id, numero: 1 },
  });
  const registrarNota = async (matriculaId, nivelLogro) =>
    (
      await docente
        .post(`${base}/calificaciones`)
        .send({
          matriculaId,
          bimestreId: bimestre.id,
          asignacionId: asignacion.id,
          reglaId: regla.id,
          competencias: [{ competenciaId: competencia.id, nivelLogro }],
        })
        .expect(201)
    ).body.data;
  notaHijo = await registrarNota(hijo.matricula.id, 'AD');
  notaOtroAlumno = await registrarNota(otroAlumno.matricula.id, 'B');
  await prisma.publicacionSeccion.create({
    data: { bimestreId: bimestre.id, seccionId: seccion.id, publicadoPorId: cuentaDocente.id },
  });
  detalleHijo = notaHijo.competencias[0].id;
});
after(() => prisma.$disconnect());

const detalles = `${base}/calificaciones-competencias`;
const notas = `${base}/calificaciones`;

test('CAL-01 sin sesión no se consulta ninguna nota', async () => {
  await request(app).get(detalles).expect(401);
  await request(app).get(`${detalles}/${detalleHijo}`).expect(401);
  await request(app).get(`${notas}/${notaHijo.id}`).expect(401);
});

test('CAL-02 un apoderado sin hijos no ve ninguna nota', async () => {
  await apoderadoSinHijos.get(detalles).expect(403);
  await apoderadoSinHijos.get(`${detalles}/${detalleHijo}`).expect(403);
  await apoderadoSinHijos.get(`${notas}/${notaHijo.id}`).expect(403);
});

test('CAL-03 un apoderado consulta las notas de su hijo solo en la libreta', async () => {
  await apoderado.get(detalles).expect(403);
  await apoderado.get(`${detalles}/${detalleHijo}`).expect(403);
  await apoderado.get(`${notas}/${notaHijo.id}`).expect(403);
  await apoderado.get(`${notas}/${notaOtroAlumno.id}`).expect(403);
});

test('CAL-04 el docente de la clase ve sus notas', async () => {
  const lista = (await docente.get(detalles).expect(200)).body.data;
  assert.equal(lista.length, 2);
  await docente.get(`${detalles}/${detalleHijo}`).expect(200);
  await docente.get(`${notas}/${notaHijo.id}`).expect(200);
});

test('CAL-05 un docente ajeno no ve las notas de otra clase', async () => {
  const lista = (await docenteAjeno.get(detalles).expect(200)).body.data;
  assert.equal(lista.length, 0);
  await docenteAjeno.get(`${detalles}/${detalleHijo}`).expect(403);
  await docenteAjeno.get(`${notas}/${notaHijo.id}`).expect(403);
});

test('CAL-06 el administrador ve todas las notas', async () => {
  const lista = (await admin.get(detalles).expect(200)).body.data;
  assert.equal(lista.length, 2);
  await admin.get(`${detalles}/${detalleHijo}`).expect(200);
  await admin.get(`${notas}/${notaOtroAlumno.id}`).expect(200);
});

test('CAL-07 el apoderado no lista notas fuera de la libreta', async () => {
  await apoderado.get(notas).expect(403);
});

test('CAL-08 una nota que no existe responde 404', async () => {
  await admin.get(`${notas}/999999`).expect(404);
});
