import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { ESCALA_POR_DEFECTO, calcularLogro, letraDePromedio } from '../src/domain/notaVigesimal.js';
import {
  PDF,
  archivosEnDisco,
  conTriggerQueFalla,
  crearCalificador,
  fechaTexto,
  fecharBimestres,
} from './support/notas.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const docenteAjeno = request.agent(app);
const apoderado = request.agent(app);
const notas = crearCalificador(docente);
let grado, aula, anio, bimestre, bimestres, matematica, arte, competencia, competencia2;
let competenciaArte, seccion, matriculas, cuentaDocente;
let bloques = 0;

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

// Las reglas de usuarios exigen correo, DNI de 8 dígitos y nombres solo con letras.
let documento = 30000000;

async function crearCuenta(nombre, roles, agente) {
  const identificador = `${nombre}@sage.test`;
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: String(++documento),
    nombres: nombre.replace(/[^\p{L}]+/gu, ' ').trim(),
    apellidos: 'Evaluaciones',
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

async function dictar(cursoId, seccionId, docenteId = cuentaDocente.docenteId) {
  bloques += 1;
  await alta('admin/bloques', {
    cursoId,
    seccionId,
    docenteId,
    aulaId: aula.id,
    diaSemana: 1 + (bloques % 5),
    horaInicio: `${String(7 + Math.floor(bloques / 5)).padStart(2, '0')}:00`,
    horaFin: `${String(8 + Math.floor(bloques / 5)).padStart(2, '0')}:00`,
  });
}

async function crearSeccion(nombre, alumnos, cursos = [matematica]) {
  const nueva = await alta('admin/catalogos/secciones', {
    nombre,
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  for (const curso of cursos) await dictar(curso.id, nueva.id);
  const lista = [];
  for (let indice = 0; indice < alumnos; indice += 1) {
    const alumno = await alta('admin/estudiantes', {
      numeroDocumento: String(++documento),
      nombres: 'Alumno',
      apellidos: `Evaluado ${nombre}`,
    });
    lista.push(await alta('admin/matriculas', { estudianteId: alumno.id, seccionId: nueva.id }));
  }
  return { seccion: nueva, matriculas: lista };
}

const clase = (datos = {}) => ({
  seccionId: seccion.id,
  cursoId: matematica.id,
  competenciaId: competencia.id,
  bimestre,
  ...datos,
});
const crearEvaluacion = (datos = {}) =>
  docente.post(`${base}/evaluaciones`).send({
    cursoId: matematica.id,
    seccionId: seccion.id,
    bimestreId: bimestre.id,
    competenciaId: competencia.id,
    titulo: 'Práctica',
    fecha: fechaTexto(bimestre.fechaInicio),
    ...datos,
  });
const rutaEvaluacion = (id) => `${base}/evaluaciones/${id}`;
const ficha = async (matriculaId, agente = docente) =>
  (
    await agente
      .get(`${base}/matriculas/${matriculaId}/calificaciones?bimestreId=${bimestre.id}`)
      .expect(200)
  ).body.data;
const competenciaEnFicha = async (matriculaId, id = competencia.id) =>
  (await ficha(matriculaId)).cursos
    .flatMap(({ competencias }) => competencias)
    .find((item) => item.id === id);
const logroGuardado = (matriculaId, competenciaId = competencia.id) =>
  prisma.calificacionCompetencia.findFirst({
    where: { competenciaId, calificacion: { matriculaId, bimestreId: bimestre.id } },
  });
const eventos = (tipoEvento, entidadId) =>
  prisma.registroAuditoria.findMany({ where: { tipoEvento, entidadId }, orderBy: { id: 'asc' } });
const estadoPublicacion = async (seccionId) =>
  (
    await admin
      .get(`${base}/calificaciones/bimestres/${bimestre.id}/publicacion?limite=50`)
      .expect(200)
  ).body.data.secciones.find(({ id }) => id === seccionId);
const publicar = (seccionId) =>
  admin.post(`${base}/calificaciones/bimestres/${bimestre.id}/secciones/${seccionId}/publicacion`);
const cambiarEscala = (escala, agente = admin) =>
  agente.put(`${base}/escala-calificacion`).send(escala);

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-EVA',
      nombres: 'Administrador',
      apellidos: 'Evaluaciones',
      identificador: 'admin-eva',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-eva', contrasena: clave })
    .expect(200);
  cuentaDocente = await crearCuenta('docente-eva', ['DOCENTE'], docente);
  await crearCuenta('docente-ajeno-eva', ['DOCENTE'], docenteAjeno);
  const cuentaApoderado = await crearCuenta('apoderado-eva', ['APODERADO'], apoderado);

  anio = await alta('admin/catalogos/anios', { codigo: '2045' });
  grado = await alta('admin/catalogos/grados', { nombre: 'Segundo' });
  aula = await alta('admin/catalogos/aulas', { codigo: 'V201' });
  matematica = await alta('admin/catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  arte = await alta('admin/catalogos/cursos', { codigo: 'ART', nombre: 'Arte' });
  const crearCompetencia = (cursoId, codigo) =>
    alta('competencias', { cursoId, codigo, nombre: codigo, descripcion: 'Prueba' });
  competencia = await crearCompetencia(matematica.id, 'MAT-1');
  competencia2 = await crearCompetencia(matematica.id, 'MAT-2');
  competenciaArte = await crearCompetencia(arte.id, 'ART-1');
  // Arte no tiene regla: se califica igual, pero su sección no se publica.
  await alta('reglas-consolidacion', {
    gradoId: grado.id,
    cursoId: matematica.id,
    nombre: 'Regla',
    version: 1,
    metodo: JSON.stringify({ estrategia: 'frecuencia', desempate: 'alto', minimoNotas: 2 }),
  });
  ({ seccion, matriculas } = await crearSeccion('A', 3, [matematica, arte]));
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({
      apoderadoId: cuentaApoderado.apoderadoId,
      estudianteId: (await prisma.matricula.findUnique({ where: { id: matriculas[0].id } }))
        .estudianteId,
      parentesco: 'Padre',
      activo: true,
    })
    .expect(200);
  bimestres = await fecharBimestres(anio.id);
  [bimestre] = bimestres;
});
after(() => prisma.$disconnect());

test('EVA-01 el promedio es ponderado, redondea medio hacia arriba y no rendir cuenta 0', () => {
  const r = (nota, peso = 1, condicion = 'CALIFICADA') => ({ condicion, nota, peso });
  // 17,49 y 17,50 promedian 17,495, que se fija en 17,50 y redondea a 18.
  assert.deepEqual(calcularLogro([r('17.49'), r('17.50')], ESCALA_POR_DEFECTO), {
    promedio: 17.5,
    nivelLogro: 'AD',
    contados: 2,
  });
  assert.equal(calcularLogro([r('17.49')], ESCALA_POR_DEFECTO).nivelLogro, 'A');
  assert.equal(calcularLogro([r('12', 1), r('18', 2)], ESCALA_POR_DEFECTO).promedio, 16);
  // No rindió cuenta 0; justificada no cuenta.
  assert.equal(calcularLogro([r('16'), r(null, 1, 'NO_RINDIO')], ESCALA_POR_DEFECTO).promedio, 8);
  assert.equal(
    calcularLogro([r('16'), r(null, 3, 'JUSTIFICADA')], ESCALA_POR_DEFECTO).promedio,
    16,
  );
  assert.deepEqual(calcularLogro([r(null, 1, 'JUSTIFICADA')], ESCALA_POR_DEFECTO), {
    promedio: null,
    nivelLogro: null,
    contados: 0,
  });
  assert.equal(letraDePromedio('10.50', ESCALA_POR_DEFECTO), 'B');
  assert.equal(letraDePromedio('10.49', ESCALA_POR_DEFECTO), 'C');
});

test('EVA-02 el docente crea evaluaciones de su clase dentro del bimestre', async () => {
  const { body } = await crearEvaluacion().expect(201);
  assert.equal(body.data.peso, 1);
  assert.deepEqual(body.data.avance, { registrados: 0, total: 3 });
  const [creada] = await eventos('EVALUACION_CREADA', body.data.id);
  assert.equal(creada.detalle.valorNuevo.titulo, 'Práctica');

  const rechazo = async (datos, status, codigo) => {
    const respuesta = await crearEvaluacion(datos).expect(status);
    if (codigo) assert.equal(respuesta.body.error.code, codigo);
  };
  await rechazo({ fecha: fechaTexto(bimestres[1].fechaInicio) }, 400, 'INVALID_EVALUATION_DATE');
  await rechazo({ peso: 0 }, 400);
  await rechazo({ peso: 6 }, 400);
  await rechazo({ peso: 1.5 }, 400);
  await rechazo({ competenciaId: competenciaArte.id }, 400, 'INVALID_COMPETENCY_CONTEXT');
  await rechazo({ titulo: '' }, 400);
  await rechazo({ asignacionId: 1 }, 400);
  const ajena = await docenteAjeno
    .post(`${base}/evaluaciones`)
    .send({
      cursoId: matematica.id,
      seccionId: seccion.id,
      bimestreId: bimestre.id,
      competenciaId: competencia.id,
      titulo: 'Ajena',
      fecha: fechaTexto(bimestre.fechaInicio),
    })
    .expect(403);
  assert.equal(ajena.body.error.code, 'FORBIDDEN');

  // Sin fechas en el bimestre no hay evaluaciones.
  await prisma.bimestreAcademico.update({
    where: { id: bimestres[3].id },
    data: { fechaInicio: null, fechaFin: null },
  });
  await rechazo(
    { bimestreId: bimestres[3].id, fecha: fechaTexto(bimestres[3].fechaInicio) },
    409,
    'TERM_WITHOUT_DATES',
  );
  await prisma.bimestreAcademico.update({
    where: { id: bimestres[3].id },
    data: { fechaInicio: bimestres[3].fechaInicio, fechaFin: bimestres[3].fechaFin },
  });

  const lista = (
    await docente
      .get(`${base}/evaluaciones?seccionId=${seccion.id}&bimestreId=${bimestre.id}`)
      .expect(200)
  ).body.data;
  assert.equal(lista.totalAlumnos, 3);
  assert.deepEqual(
    lista.cursos.map(({ codigo }) => codigo),
    ['ART', 'MAT'],
  );
  const mat1 = lista.cursos[1].competencias.find(({ id }) => id === competencia.id);
  assert.equal(mat1.evaluaciones.length, 1);
  await docenteAjeno
    .get(`${base}/evaluaciones?seccionId=${seccion.id}&bimestreId=${bimestre.id}`)
    .expect(403);
  await apoderado
    .get(`${base}/evaluaciones?seccionId=${seccion.id}&bimestreId=${bimestre.id}`)
    .expect(403);
});

test('EVA-03 una nota con su examen calcula promedio y letra; los datos inválidos se rechazan', async () => {
  const evaluacionId = await notas.evaluacion(clase());
  const [m1] = matriculas;
  const { body } = await notas.registrar(evaluacionId, m1.id, { nota: '15.5' }).expect(200);
  assert.deepEqual(body.data.logro, { promedio: 15.5, nivelLogro: 'A' });
  assert.equal(body.data.resultado.condicion, 'CALIFICADA');
  assert.equal(body.data.resultado.archivos.length, 1);

  const enFicha = await competenciaEnFicha(m1.id);
  assert.equal(enFicha.promedio, 15.5);
  assert.equal(enFicha.nivelLogro, 'A');
  assert.equal(enFicha.evaluaciones.find(({ id }) => id === evaluacionId).resultado.nota, 15.5);
  assert.equal((await logroGuardado(m1.id)).promedio.toString(), '15.5');

  const rechazo = async (peticion, codigo) => {
    const respuesta = await peticion.expect(400);
    if (codigo) assert.equal(respuesta.body.error.code, codigo);
  };
  const ruta = `${rutaEvaluacion(evaluacionId)}/resultados/${matriculas[1].id}`;
  await rechazo(
    docente.put(ruta).field('condicion', 'CALIFICADA').field('nota', '14'),
    'FILE_REQUIRED',
  );
  for (const nota of ['20.01', '15.555', 'abc', '-1'])
    await rechazo(notas.registrar(evaluacionId, matriculas[1].id, { nota }), 'INVALID_GRADE');
  await rechazo(
    docente
      .put(ruta)
      .field('condicion', 'CALIFICADA')
      .field('nota', '14')
      .attach('archivos', Buffer.from('no es un pdf'), 'examen.txt'),
    'FILE_TYPE_NOT_ALLOWED',
  );
  await rechazo(
    docente
      .put(ruta)
      .field('condicion', 'CALIFICADA')
      .field('nota', '14')
      .attach('archivos', PDF, '1.pdf')
      .attach('archivos', PDF, '2.pdf')
      .attach('archivos', PDF, '3.pdf')
      .attach('archivos', PDF, '4.pdf'),
    'TOO_MANY_FILES',
  );
  await rechazo(docente.put(ruta).field('condicion', 'APROBADA'));
  // El alumno de otra sección no se califica en esta evaluación.
  const otra = await crearSeccion('Z', 1);
  const fuera = await notas
    .registrar(evaluacionId, otra.matriculas[0].id, { nota: 12 })
    .expect(400);
  assert.equal(fuera.body.error.code, 'INVALID_ENROLLMENT_CONTEXT');
  await request(app)
    .put(`${rutaEvaluacion(evaluacionId)}/resultados/${m1.id}`)
    .field('condicion', 'NO_RINDIO')
    .expect(401);
  const ajeno = crearCalificador(docenteAjeno);
  await ajeno.registrar(evaluacionId, m1.id, { nota: 12 }).expect(403);
  assert.equal(
    await prisma.resultadoEvaluacion.count({ where: { matriculaId: matriculas[1].id } }),
    0,
  );

  // Corregir la nota queda auditado con la letra anterior y la nueva.
  await notas.registrar(evaluacionId, m1.id, { nota: 19 }).expect(200);
  const [registrado] = await eventos('RESULTADO_EVALUACION_REGISTRADO', body.data.resultado.id);
  const [modificado] = await eventos('RESULTADO_EVALUACION_MODIFICADO', body.data.resultado.id);
  assert.ok(registrado);
  assert.equal(modificado.detalle.valorAnterior.nota, 15.5);
  assert.equal(modificado.detalle.valorNuevo.nota, 19);
  assert.deepEqual(modificado.detalle.contexto.logroAnterior, { promedio: 15.5, nivelLogro: 'A' });
  assert.deepEqual(modificado.detalle.contexto.logroNuevo, { promedio: 19, nivelLogro: 'AD' });
});

test('EVA-04 no rendir cuenta 0, justificar no cuenta y quita el examen', async () => {
  const [m1] = matriculas;
  const primera = await notas.evaluacion(clase());
  const segunda = await notas.evaluacion(clase({ nueva: true }));
  await notas.registrar(segunda, m1.id, { condicion: 'NO_RINDIO' }).expect(200);
  assert.deepEqual(
    {
      promedio: (await competenciaEnFicha(m1.id)).promedio,
      letra: (await logroGuardado(m1.id)).nivelLogro,
    },
    { promedio: 9.5, letra: 'C' },
  );
  const sinMotivo = await notas.registrar(segunda, m1.id, { condicion: 'JUSTIFICADA' }).expect(400);
  assert.equal(sinMotivo.body.error.code, 'REASON_REQUIRED');
  await notas.registrar(segunda, m1.id, { condicion: 'NO_RINDIO', nota: 10 }).expect(400);
  await notas
    .registrar(segunda, m1.id, { condicion: 'JUSTIFICADA', motivo: 'Certificado médico' })
    .expect(200);
  assert.equal((await competenciaEnFicha(m1.id)).promedio, 19);

  // Justificar la que tenía nota retira su examen y deja la competencia sin letra.
  const { body } = await notas
    .registrar(primera, m1.id, { condicion: 'JUSTIFICADA', motivo: 'Viaje familiar' })
    .expect(200);
  assert.equal(body.data.logro.nivelLogro, null);
  assert.equal(
    await prisma.archivoResultadoEvaluacion.count({
      where: { resultadoId: body.data.resultado.id, activo: true },
    }),
    0,
  );
  const sinLetra = await logroGuardado(m1.id);
  assert.equal(sinLetra.nivelLogro, null);
  assert.equal(sinLetra.promedio, null);
  await notas.registrar(primera, m1.id, { nota: 16 }).expect(200);
  assert.equal((await logroGuardado(m1.id)).nivelLogro, 'A');

  // Quitar un resultado lo deja pendiente otra vez (la de EVA-02 sigue sin registrar).
  await docente.delete(`${rutaEvaluacion(segunda)}/resultados/${m1.id}`).expect(204);
  assert.equal((await competenciaEnFicha(m1.id)).pendientes, 2);
  await docente.delete(`${rutaEvaluacion(segunda)}/resultados/${m1.id}`).expect(404);
  const pendientes = (await docente.get(`${rutaEvaluacion(segunda)}/pendientes`).expect(200)).body
    .data;
  assert.equal(pendientes.length, 3);
  assert.deepEqual(Object.keys(pendientes[0]).sort(), ['codigo', 'matriculaId', 'nombre']);
});

test('EVA-05 cambiar el peso recalcula la sección; la competencia solo cambia sin resultados', async () => {
  const [m1, m2] = matriculas;
  const examen = await notas.evaluacion(clase({ nueva: true }));
  await notas.registrar(examen, m1.id, { nota: 10 }).expect(200);
  await notas.registrar(examen, m2.id, { nota: 20 }).expect(200);
  const antes = (await logroGuardado(m1.id)).promedio.toString();
  const { body } = await docente.patch(rutaEvaluacion(examen)).send({ peso: 3 }).expect(200);
  assert.equal(body.data.peso, 3);
  assert.notEqual((await logroGuardado(m1.id)).promedio.toString(), antes);
  // Solo cambia el promedio del primero: el segundo tiene una sola nota en la competencia.
  const [modificada] = await eventos('EVALUACION_MODIFICADA', examen);
  assert.equal(modificada.detalle.contexto.letrasRecalculadas, 1);

  const conResultados = await docente
    .patch(rutaEvaluacion(examen))
    .send({ competenciaId: competencia2.id })
    .expect(409);
  assert.equal(conResultados.body.error.code, 'EVALUATION_HAS_RESULTS');
  const vacia = (await crearEvaluacion({ titulo: 'Sin notas' }).expect(201)).body.data;
  await docente
    .patch(rutaEvaluacion(vacia.id))
    .send({ competenciaId: competencia2.id })
    .expect(200);
  await docente
    .patch(rutaEvaluacion(vacia.id))
    .send({ competenciaId: competenciaArte.id })
    .expect(400);
  await docente
    .patch(rutaEvaluacion(vacia.id))
    .send({ fecha: fechaTexto(bimestres[2].fechaFin) })
    .expect(400);
  await docente.patch(rutaEvaluacion(vacia.id)).send({}).expect(400);
  await docenteAjeno.patch(rutaEvaluacion(vacia.id)).send({ peso: 2 }).expect(403);
  await docente.delete(rutaEvaluacion(vacia.id)).expect(204);
});

test('EVA-06 eliminar una evaluación con resultados los da de baja y recalcula', async () => {
  const [, , m3] = matriculas;
  const unica = await notas.evaluacion(clase({ competenciaId: competencia2.id, nueva: true }));
  await notas.registrar(unica, m3.id, { nota: 13 }).expect(200);
  assert.equal((await logroGuardado(m3.id, competencia2.id)).nivelLogro, 'B');
  await docente.delete(rutaEvaluacion(unica)).expect(204);
  assert.equal(
    await prisma.resultadoEvaluacion.count({ where: { evaluacionId: unica, activo: true } }),
    0,
  );
  assert.equal((await logroGuardado(m3.id, competencia2.id)).nivelLogro, null);
  const [baja] = await eventos('EVALUACION_DADA_DE_BAJA', unica);
  assert.equal(baja.detalle.contexto.resultadosDesactivados, 1);
  assert.equal(baja.detalle.contexto.letrasRecalculadas, 1);
  await docente.delete(rutaEvaluacion(unica)).expect(404);
  await docente.patch(rutaEvaluacion(unica)).send({ peso: 2 }).expect(404);
});

test('EVA-07 la publicación exige evaluaciones, resultados, letra, mínimo de notas y regla', async () => {
  const {
    seccion: s,
    matriculas: [alumno],
  } = await crearSeccion('P', 1);
  const datos = (competenciaId, extra = {}) => ({
    seccionId: s.id,
    cursoId: matematica.id,
    competenciaId,
    bimestre,
    ...extra,
  });
  const pendiente = async () => (await estadoPublicacion(s.id)).pendientes[0];
  assert.equal((await pendiente()).sinEvaluaciones, 2);

  const e1 = await notas.evaluacion(datos(competencia.id));
  const e2 = await notas.evaluacion(datos(competencia2.id));
  assert.equal((await pendiente()).resultadosPendientes, 2);
  for (const id of [e1, e2])
    await notas
      .registrar(id, alumno.id, { condicion: 'JUSTIFICADA', motivo: 'Descanso médico' })
      .expect(200);
  assert.equal((await pendiente()).sinLetra, 2);

  await notas.registrar(e1, alumno.id, { nota: 15 }).expect(200);
  await notas.registrar(e2, alumno.id, { nota: 12 }).expect(200);
  // La regla pide dos notas que cuenten por competencia.
  const bajoMinimo = await pendiente();
  assert.equal(bajoMinimo.bajoMinimo, 2);
  assert.equal(bajoMinimo.minimoNotas, 2);
  const incompleta = await publicar(s.id).expect(409);
  assert.equal(incompleta.body.error.code, 'PUBLICATION_INCOMPLETE');

  for (const competenciaId of [competencia.id, competencia2.id]) {
    const otra = await notas.evaluacion(datos(competenciaId, { nueva: true }));
    await notas.registrar(otra, alumno.id, { condicion: 'NO_RINDIO' }).expect(200);
  }
  const lista = await estadoPublicacion(s.id);
  assert.equal(lista.estado, 'LISTA');
  await publicar(s.id).expect(201);
  // La regla vigente queda fija en las notas al publicar.
  const regla = await prisma.reglaConsolidacion.findFirst({ where: { cursoId: matematica.id } });
  const calificaciones = await prisma.calificacion.findMany({
    where: { matriculaId: alumno.id, bimestreId: bimestre.id },
  });
  assert.ok(calificaciones.length);
  assert.ok(calificaciones.every(({ reglaId }) => reglaId === regla.id));

  // Arte no tiene regla: la sección A queda pendiente por eso aunque se califique.
  const arteEnA = (await estadoPublicacion(seccion.id)).pendientes.find(
    ({ curso }) => curso === 'Arte',
  );
  assert.equal(arteEnA.sinRegla, true);
});

test('EVA-08 con la sección publicada no se cambia ninguna evaluación ni nota', async () => {
  const {
    seccion: s,
    matriculas: [alumno],
  } = await prisma.seccion
    .findFirst({ where: { nombre: 'P', anioAcademicoId: anio.id }, include: { matriculas: true } })
    .then((item) => ({ seccion: item, matriculas: item.matriculas }));
  const [evaluacion] = await prisma.evaluacion.findMany({ where: { seccionId: s.id } });
  const intentos = [
    () => crearEvaluacion({ seccionId: s.id }),
    () => docente.patch(rutaEvaluacion(evaluacion.id)).send({ peso: 2 }),
    () => docente.delete(rutaEvaluacion(evaluacion.id)),
    () => notas.registrar(evaluacion.id, alumno.id, { nota: 20 }),
    () => docente.delete(`${rutaEvaluacion(evaluacion.id)}/resultados/${alumno.id}`),
  ];
  for (const intento of intentos) {
    const { body } = await intento().expect(409);
    assert.equal(body.error.code, 'TERM_PUBLISHED');
  }
  assert.equal((await ficha(alumno.id)).bimestre.publicado, true);
});

test('EVA-09 cambiar la escala recalcula lo no publicado y respeta lo publicado', async () => {
  await cambiarEscala({ minimoAD: 15, minimoA: 16, minimoB: 11 }).expect(400);
  const invalida = await cambiarEscala({ minimoAD: 21, minimoA: 14, minimoB: 11 }).expect(400);
  assert.equal(invalida.body.error.code, 'VALIDATION_ERROR');
  const orden = await cambiarEscala({ minimoAD: 18, minimoA: 11, minimoB: 11 }).expect(400);
  assert.equal(orden.body.error.code, 'INVALID_SCALE');
  assert.equal(orden.body.error.details[0].campo, 'minimoB');
  await cambiarEscala({ minimoAD: 18, minimoA: 14, minimoB: 11 }, docente).expect(403);
  assert.equal(
    (await docente.get(`${base}/escala-calificacion`).expect(200)).body.data.minimoAD,
    18,
  );
  await apoderado.get(`${base}/escala-calificacion`).expect(403);

  const publicada = await prisma.calificacionCompetencia.findFirst({
    where: { calificacion: { matricula: { seccion: { nombre: 'P', anioAcademicoId: anio.id } } } },
  });
  const [m1] = matriculas;
  const promedio = (await logroGuardado(m1.id)).promedio.toString();
  const { body } = await cambiarEscala({ minimoAD: 10, minimoA: 8, minimoB: 5 }).expect(200);
  assert.equal(body.data.version, 2);
  assert.ok(body.data.letrasRecalculadas > 0);
  assert.equal(
    (await logroGuardado(m1.id)).nivelLogro,
    letraDePromedio(promedio, { minimoAD: 10, minimoA: 8, minimoB: 5 }),
  );
  const intacta = await prisma.calificacionCompetencia.findUnique({ where: { id: publicada.id } });
  assert.equal(intacta.nivelLogro, publicada.nivelLogro);
  const [auditado] = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'ESCALA_CALIFICACION_MODIFICADA' },
  });
  assert.equal(auditado.detalle.valorAnterior.minimoAD, 18);
  assert.equal(auditado.detalle.contexto.letrasRecalculadas, body.data.letrasRecalculadas);
  // Guardar la misma escala no crea otra versión.
  assert.equal(
    (await cambiarEscala({ minimoAD: 10, minimoA: 8, minimoB: 5 }).expect(200)).body.data.version,
    2,
  );
  await cambiarEscala(ESCALA_POR_DEFECTO).expect(200);
  assert.equal(await prisma.escalaCalificacion.count({ where: { vigenteHasta: null } }), 1);
});

test('EVA-10 guardados simultáneos no pierden notas ni dejan una letra con la escala vieja', async () => {
  const [, m2] = matriculas;
  const a = await notas.evaluacion(clase({ competenciaId: competencia2.id, nueva: true }));
  const b = await notas.evaluacion(clase({ competenciaId: competencia2.id, nueva: true }));
  const respuestas = await Promise.all([
    notas.registrar(a, m2.id, { nota: 20 }),
    notas.registrar(b, m2.id, { nota: 10 }),
  ]);
  assert.deepEqual(
    respuestas.map(({ status }) => status),
    [200, 200],
  );
  assert.equal((await logroGuardado(m2.id, competencia2.id)).promedio.toString(), '15');

  const escala = { minimoAD: 19, minimoA: 17, minimoB: 15 };
  const [cambio, nota] = await Promise.all([
    cambiarEscala(escala),
    notas.registrar(a, m2.id, { nota: 14 }),
  ]);
  assert.equal(cambio.status, 200);
  assert.equal(nota.status, 200);
  const final = await logroGuardado(m2.id, competencia2.id);
  assert.equal(final.promedio.toString(), '12');
  assert.equal(final.nivelLogro, letraDePromedio('12', escala));
  await cambiarEscala(ESCALA_POR_DEFECTO).expect(200);
});

test('EVA-11 si la transacción falla no queda resultado ni archivo en disco', async () => {
  const [, , m3] = matriculas;
  const evaluacionId = await notas.evaluacion(clase());
  const enDisco = await archivosEnDisco();
  await conTriggerQueFalla('ArchivoResultadoEvaluacion', () =>
    notas.registrar(evaluacionId, m3.id, { nota: 17 }).expect(500),
  );
  assert.equal(await archivosEnDisco(), enDisco);
  assert.equal(
    await prisma.resultadoEvaluacion.count({ where: { evaluacionId, matriculaId: m3.id } }),
    0,
  );
});

test('EVA-12 el examen lo descargan el docente de la clase y el administrador, no la familia', async () => {
  const [m1] = matriculas;
  const evaluacionId = await notas.evaluacion(clase());
  const { body } = await notas.registrar(evaluacionId, m1.id, { nota: 16 }).expect(200);
  const [archivo] = body.data.resultado.archivos;
  const ruta = `${rutaEvaluacion(evaluacionId)}/resultados/${m1.id}/archivos/${archivo.id}`;
  const descarga = await docente.get(ruta).expect(200);
  assert.match(descarga.headers['content-type'], /^application\/pdf/);
  await admin.get(ruta).expect(200);
  await docenteAjeno.get(ruta).expect(403);
  await apoderado.get(ruta).expect(403);
  await docente
    .get(`${rutaEvaluacion(evaluacionId)}/resultados/${m1.id}/archivos/999999`)
    .expect(404);
  // La familia no ve la ficha con notas 0–20; solo la libreta publicada.
  await apoderado
    .get(`${base}/matriculas/${m1.id}/calificaciones?bimestreId=${bimestre.id}`)
    .expect(403);
});

test('EVA-13 las rutas que escribían la letra a mano ya no existen', async () => {
  await docente
    .put(`${base}/matriculas/${matriculas[0].id}/calificaciones`)
    .send({ bimestreId: bimestre.id, calificaciones: [] })
    .expect(404);
  await docente.post(`${base}/calificaciones`).send({}).expect(404);
  await docente.post(`${base}/calificaciones-competencias`).send({}).expect(404);
  await admin.put(`${base}/calificaciones-competencias/1`).send({}).expect(404);
  await docente.get(`${base}/calificaciones-competencias/1/evidencias`).expect(404);
});

test('EVA-14 la migración conserva lo publicado y borra lo demás', async () => {
  const migracion = await readFile(
    new URL(
      '../prisma/migrations/20261122120000_evaluaciones_nota_vigesimal/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const borrados = migracion.match(/DELETE FROM[\s\S]*?;/g);
  assert.equal(borrados.length, 2);
  const publicadas = await prisma.calificacionCompetencia.count({
    where: { calificacion: { matricula: { seccion: { nombre: 'P' } } } },
  });
  assert.ok(publicadas > 0);
  for (const sentencia of borrados) await prisma.$executeRawUnsafe(sentencia);
  assert.equal(await prisma.calificacionCompetencia.count(), publicadas);
  assert.equal(await prisma.calificacion.count({ where: { competencias: { none: {} } } }), 0);
});
