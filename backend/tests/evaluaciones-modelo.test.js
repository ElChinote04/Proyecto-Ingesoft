import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';

// Prueba del modelo, no de la API: todavía no existe el servicio de evaluaciones. Comprueba
// que las reglas que no pueden perder una carrera las garantiza la base de datos.
const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
let actorId, matematica, comunicacion, matricula, otraMatricula, bimestre;

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

async function crearDocente(numeroDocumento, identificador) {
  return alta('admin/usuarios', {
    numeroDocumento,
    nombres: 'Docente',
    apellidos: 'Evaluaciones',
    identificador,
    contrasena: 'InicialTemporal123!',
    roles: ['DOCENTE'],
  });
}

// Crea curso, competencia y asignación de un docente a la sección.
async function crearClase(codigo, docenteId, seccionId, aulaId, diaSemana) {
  const curso = await alta('admin/catalogos/cursos', { codigo, nombre: `Curso ${codigo}` });
  const competencia = await alta('competencias', {
    cursoId: curso.id,
    codigo: `${codigo}-C1`,
    nombre: `Competencia de ${codigo}`,
    descripcion: 'Competencia de prueba del modelo de evaluaciones',
  });
  await alta('admin/bloques', {
    cursoId: curso.id,
    seccionId,
    docenteId,
    aulaId,
    diaSemana,
    horaInicio: '08:00',
    horaFin: '09:00',
  });
  const asignacion = await prisma.cursoSeccionDocente.findFirst({
    where: { cursoId: curso.id, seccionId },
  });
  return { curso, competencia, asignacion };
}

const evaluacionDe = (clase, cambios = {}) => ({
  asignacionId: clase.asignacion.id,
  cursoId: clase.curso.id,
  seccionId: clase.asignacion.seccionId,
  bimestreId: bimestre.id,
  competenciaId: clase.competencia.id,
  titulo: 'Práctica calificada 1',
  fecha: new Date('2030-04-15'),
  creadoPorId: actorId,
  modificadoPorId: actorId,
  ...cambios,
});
const crearEvaluacion = (clase, cambios) =>
  prisma.evaluacion.create({ data: evaluacionDe(clase, cambios) });
const crearResultado = (evaluacionId, cambios = {}) =>
  prisma.resultadoEvaluacion.create({
    data: {
      evaluacionId,
      matriculaId: matricula.id,
      nota: '15.50',
      creadoPorId: actorId,
      modificadoPorId: actorId,
      ...cambios,
    },
  });

// Prisma traduce las violaciones de la base a códigos estables; se comprueba el código, no el texto.
const rechaza = (operacion, codigo) =>
  assert.rejects(operacion, (error) => {
    assert.equal(
      error.code,
      codigo,
      `Se esperaba ${codigo} y llegó ${error.code}: ${error.message}`,
    );
    return true;
  });
// Prisma no da un código propio a los CHECK con el adaptador pg (sale P2039); se comprueba el
// SQLSTATE de PostgreSQL y el nombre de la restricción, que sí son estables.
const violaCheck = (operacion, restriccion) =>
  assert.rejects(operacion, (error) => {
    const causa = error.meta?.driverAdapterError?.cause;
    assert.equal(causa?.code, '23514', error.message);
    assert.match(causa.message, new RegExp(`"${restriccion}"`));
    return true;
  });

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: '91000000',
      nombres: 'Administrador',
      apellidos: 'Evaluaciones',
      identificador: 'admin-evaluaciones@prueba.local',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  actorId = (
    await admin
      .post(`${base}/auth/login`)
      .send({ identificador: 'admin-evaluaciones@prueba.local', contrasena: clave })
      .expect(200)
  ).body.data.id;
  const anio = await alta('admin/catalogos/anios', { codigo: '2030' });
  const grado = await alta('admin/catalogos/grados', { nombre: 'Primero' });
  const seccion = await alta('admin/catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  const aula = await alta('admin/catalogos/aulas', { codigo: 'E101' });
  const docente = await crearDocente('21000001', 'docente-evaluaciones@prueba.local');
  matematica = await crearClase('MAT', docente.docenteId, seccion.id, aula.id, 1);
  comunicacion = await crearClase('COM', docente.docenteId, seccion.id, aula.id, 2);
  const alumnos = await Promise.all(
    ['21000002', '21000003'].map((numeroDocumento) =>
      alta('admin/estudiantes', { numeroDocumento, nombres: 'Alumno', apellidos: 'Evaluado' }),
    ),
  );
  [matricula, otraMatricula] = await Promise.all(
    alumnos.map((alumno) =>
      alta('admin/matriculas', { estudianteId: alumno.id, seccionId: seccion.id }),
    ),
  );
  bimestre = await prisma.bimestreAcademico.findFirst({
    where: { anioAcademicoId: anio.id, numero: 1 },
  });
});
after(() => prisma.$disconnect());

test('EVM-01 una evaluación válida nace en BORRADOR, con peso 1, y acepta notas de 0 a 20', async () => {
  const evaluacion = await crearEvaluacion(matematica);
  assert.equal(evaluacion.estado, 'BORRADOR');
  assert.equal(evaluacion.peso.toString(), '1');
  assert.equal(evaluacion.activo, true);
  const minima = await crearResultado(evaluacion.id, { nota: '0' });
  const maxima = await crearResultado(evaluacion.id, {
    matriculaId: otraMatricula.id,
    nota: '20.00',
    comentario: 'Excelente trabajo',
  });
  assert.equal(minima.nota.toString(), '0');
  assert.equal(minima.comentario, null);
  assert.equal(maxima.nota.toString(), '20');
  assert.equal(maxima.comentario, 'Excelente trabajo');
  const ponderada = await crearEvaluacion(matematica, { peso: '0.5', estado: 'REGISTRADA' });
  assert.equal(ponderada.peso.toString(), '0.5');
  // Los decimales se guardan con dos cifras: 13.456 se redondea, no se trunca a entero.
  const decimal = await crearResultado(ponderada.id, { nota: '13.456' });
  assert.equal(decimal.nota.toString(), '13.46');
});

test('EVM-02 la base rechaza notas fuera de 0 a 20', async () => {
  const evaluacion = await crearEvaluacion(matematica);
  await violaCheck(
    crearResultado(evaluacion.id, { nota: '20.01' }),
    'ResultadoEvaluacion_nota_rango',
  );
  await violaCheck(
    crearResultado(evaluacion.id, { nota: '-0.01' }),
    'ResultadoEvaluacion_nota_rango',
  );
  assert.equal(
    await prisma.resultadoEvaluacion.count({ where: { evaluacionId: evaluacion.id } }),
    0,
  );
});

test('EVM-03 la base rechaza un peso cero o negativo', async () => {
  await violaCheck(crearEvaluacion(matematica, { peso: '0' }), 'Evaluacion_peso_positivo');
  await violaCheck(crearEvaluacion(matematica, { peso: '-1' }), 'Evaluacion_peso_positivo');
});

test('EVM-04 un alumno tiene un solo resultado activo por evaluación', async () => {
  const evaluacion = await crearEvaluacion(matematica);
  const primero = await crearResultado(evaluacion.id);
  await rechaza(crearResultado(evaluacion.id, { nota: '11' }), 'P2002');
  // Dado de baja, el resultado se conserva y el alumno puede recibir otra nota.
  await prisma.resultadoEvaluacion.update({ where: { id: primero.id }, data: { activo: false } });
  const segundo = await crearResultado(evaluacion.id, { nota: '11' });
  const filas = await prisma.resultadoEvaluacion.findMany({
    where: { evaluacionId: evaluacion.id, matriculaId: matricula.id },
    orderBy: { id: 'asc' },
  });
  assert.deepEqual(
    filas.map(({ id, activo }) => [id, activo]),
    [
      [primero.id, false],
      [segundo.id, true],
    ],
  );
  // Reactivar el antiguo con otro activo choca con el índice parcial.
  await rechaza(
    prisma.resultadoEvaluacion.update({ where: { id: primero.id }, data: { activo: true } }),
    'P2002',
  );
});

test('EVM-05 la asignación debe ser del mismo curso y sección que la evaluación', async () => {
  // Asignación de Matemática declarada como evaluación de Comunicación.
  await rechaza(
    crearEvaluacion(matematica, {
      cursoId: comunicacion.curso.id,
      competenciaId: comunicacion.competencia.id,
    }),
    'P2003',
  );
  const otraSeccion = await prisma.seccion.create({
    data: {
      nombre: 'B',
      gradoId: (await prisma.seccion.findUnique({ where: { id: matematica.asignacion.seccionId } }))
        .gradoId,
      anioAcademicoId: bimestre.anioAcademicoId,
    },
  });
  await rechaza(crearEvaluacion(matematica, { seccionId: otraSeccion.id }), 'P2003');
});

test('EVM-06 la competencia debe ser del curso evaluado', async () => {
  await rechaza(
    crearEvaluacion(matematica, { competenciaId: comunicacion.competencia.id }),
    'P2003',
  );
});

test('EVM-07 el comentario no supera 500 caracteres', async () => {
  const evaluacion = await crearEvaluacion(comunicacion);
  await rechaza(crearResultado(evaluacion.id, { comentario: 'x'.repeat(501) }), 'P2000');
  const limite = await crearResultado(evaluacion.id, { comentario: 'x'.repeat(500) });
  assert.equal(limite.comentario.length, 500);
});
