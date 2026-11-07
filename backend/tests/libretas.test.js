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
const docenteNuevo = request.agent(app);
const alumno = request.agent(app);
const alumnoAjeno = request.agent(app);
const apoderado = request.agent(app);
const apoderadoAjeno = request.agent(app);
const apoderadoInactivo = request.agent(app);
const alumnoYApoderado = request.agent(app);
const adminYApoderado = request.agent(app);
const docenteYApoderado = request.agent(app);

const regla = (estrategia, extras) => JSON.stringify({ estrategia, ...extras });
// Niveles de los cuatro bimestres. Cada curso prueba una estrategia distinta de su regla.
const CURSOS = [
  {
    codigo: '10-COM',
    nombre: 'Comunicación',
    metodo: regla('reciente', { minimoEvidencias: 1 }),
    competencias: {
      'COM-1': ['AD', 'B', 'B', 'A'],
      'COM-2': ['A', 'A', 'AD', 'B'],
    },
  },
  {
    codigo: '2-PS',
    nombre: 'Personal Social',
    metodo: regla('frecuencia', { desempate: 'alto', minimoEvidencias: 1 }),
    competencias: {
      'PS-2': ['A', 'A', 'A', 'AD'],
      'PS-1': ['B', 'A', 'B', 'B'],
    },
  },
  {
    codigo: '5-MAT',
    nombre: 'Matemática',
    metodo: regla('prioridad', { minimoEvidencias: 5 }),
    competencias: {
      'MAT-1': ['C', 'B', 'A', 'B'],
      'MAT-2': ['C', 'C', 'B', 'C'],
    },
  },
  {
    codigo: '99-TR',
    nombre: 'Competencias transversales',
    metodo: regla('frecuencia', { desempate: 'reciente', minimoEvidencias: 1 }),
    competencias: {
      'TR-1': ['A', 'A', 'A', 'A'],
      'TR-2': ['B', 'B', 'B', 'B'],
    },
  },
];

let aula, grado, anio, otroAnio, seccionA, seccionB;
let cuentaDocente, cuentaDocenteNuevo, cuentaAlumno, cuentaAjeno, cuentaDoble;
let bimestres, competencias, cursos, matricula, matriculaAjena, matriculaDoble;
let bloques = 0;

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: `DNI-${identificador}`,
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

const vincular = (apoderadoId, estudianteId, activo = true) =>
  admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({ apoderadoId, estudianteId, parentesco: 'Madre', activo })
    .expect(200);

const consultar = async (agente, id = matricula.id) =>
  (await agente.get(`${base}/libretas/${id}`).expect(200)).body.data;

const areaDe = (libreta, codigo) => libreta.areas.find((area) => area.codigo === codigo);
const competenciaDe = (libreta, codigo) =>
  libreta.areas
    .flatMap((area) => area.competencias)
    .find((competencia) => competencia.codigo === codigo);

async function calificarBimestre(indice) {
  const calificaciones = CURSOS.flatMap((curso) =>
    Object.entries(curso.competencias).map(([codigo, niveles]) => ({
      competenciaId: competencias[codigo].id,
      nivelLogro: niveles[indice],
    })),
  );
  await docente
    .put(`${base}/matriculas/${matricula.id}/calificaciones`)
    .send({ bimestreId: bimestres[indice].id, calificaciones })
    .expect(200);
}

async function publicarBimestre(indice) {
  const bimestreId = bimestres[indice].id;
  const ficha = await docente
    .get(`${base}/matriculas/${matricula.id}/calificaciones?bimestreId=${bimestreId}`)
    .expect(200);
  for (const curso of ficha.body.data.cursos)
    for (const { calificacionCompetenciaId } of curso.competencias)
      await docente
        .post(`${base}/calificaciones-competencias/${calificacionCompetenciaId}/evidencias`)
        .field('titulo', 'Evidencia')
        .field('descripcion', 'Sustento de la nota')
        .expect(201);
  await admin
    .post(`${base}/calificaciones/bimestres/${bimestreId}/secciones/${seccionA.id}/publicacion`)
    .expect(201);
}

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-LIBRETA',
      nombres: 'Administrador',
      apellidos: 'Libreta',
      identificador: 'admin-libreta',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-libreta', contrasena: clave })
    .expect(200);

  cuentaDocente = await crearCuenta('docente-libreta', ['DOCENTE'], docente);
  cuentaDocenteNuevo = await crearCuenta('docente-nuevo', ['DOCENTE'], docenteNuevo);
  cuentaAlumno = await crearCuenta('alumno-libreta', ['ALUMNO'], alumno);
  cuentaAjeno = await crearCuenta('alumno-ajeno', ['ALUMNO'], alumnoAjeno);
  cuentaDoble = await crearCuenta('alumno-apoderado', ['ALUMNO', 'APODERADO'], alumnoYApoderado);
  const cuentaApoderado = await crearCuenta('apoderado-libreta', ['APODERADO'], apoderado);
  const cuentaApoderadoAjeno = await crearCuenta('apoderado-ajeno', ['APODERADO'], apoderadoAjeno);
  const cuentaInactivo = await crearCuenta('apoderado-baja', ['APODERADO'], apoderadoInactivo);
  const cuentaAdmin = await crearCuenta(
    'admin-apoderado',
    ['ADMINISTRADOR', 'APODERADO'],
    adminYApoderado,
  );
  const cuentaDocenteApoderado = await crearCuenta(
    'docente-apoderado',
    ['DOCENTE', 'APODERADO'],
    docenteYApoderado,
  );

  anio = await alta('admin/catalogos/anios', { codigo: '2041' });
  otroAnio = await alta('admin/catalogos/anios', { codigo: '2042' });
  grado = await alta('admin/catalogos/grados', { nombre: 'Tercero' });
  aula = await alta('admin/catalogos/aulas', { codigo: 'L301' });
  const seccion = (nombre) =>
    alta('admin/catalogos/secciones', { nombre, gradoId: grado.id, anioAcademicoId: anio.id });
  seccionA = await seccion('A');
  seccionB = await seccion('B');

  cursos = {};
  competencias = {};
  for (const { codigo, nombre, metodo, competencias: niveles } of CURSOS) {
    const curso = await alta('admin/catalogos/cursos', { codigo, nombre });
    cursos[codigo] = curso;
    for (const codigoCompetencia of Object.keys(niveles))
      competencias[codigoCompetencia] = await alta('competencias', {
        cursoId: curso.id,
        codigo: codigoCompetencia,
        nombre: codigoCompetencia,
        descripcion: 'Prueba',
      });
    await alta('reglas-consolidacion', {
      gradoId: grado.id,
      cursoId: curso.id,
      nombre: `Regla ${codigo}`,
      version: 1,
      metodo,
    });
    await dictar(curso.id, seccionA.id);
  }
  await dictar(cursos['2-PS'].id, seccionB.id);

  const matricular = (estudianteId, seccionId) =>
    alta('admin/matriculas', { estudianteId, seccionId });
  matricula = await matricular(cuentaAlumno.estudianteId, seccionA.id);
  matriculaAjena = await matricular(cuentaAjeno.estudianteId, seccionB.id);
  matriculaDoble = await matricular(cuentaDoble.estudianteId, seccionB.id);

  await vincular(cuentaApoderado.apoderadoId, cuentaAlumno.estudianteId);
  await vincular(cuentaApoderadoAjeno.apoderadoId, cuentaAjeno.estudianteId);
  await vincular(cuentaInactivo.apoderadoId, cuentaAlumno.estudianteId);
  await vincular(cuentaInactivo.apoderadoId, cuentaAlumno.estudianteId, false);
  await vincular(cuentaDoble.apoderadoId, cuentaAlumno.estudianteId);
  await vincular(cuentaAdmin.apoderadoId, cuentaAlumno.estudianteId);
  await vincular(cuentaDocenteApoderado.apoderadoId, cuentaAlumno.estudianteId);

  bimestres = await prisma.bimestreAcademico.findMany({
    where: { anioAcademicoId: anio.id },
    orderBy: { numero: 'asc' },
  });
  await calificarBimestre(0);
  await calificarBimestre(1);
  await publicarBimestre(0);
});
after(() => prisma.$disconnect());

test('LIB-01 el alumno consulta su libreta con logros por competencia y periodo', async () => {
  const libreta = await consultar(alumno);
  assert.deepEqual(
    libreta.periodos.map(({ numero, publicado }) => [numero, publicado]),
    [
      [1, true],
      [2, false],
      [3, false],
      [4, false],
    ],
  );
  assert.equal(libreta.matricula.anioAcademico, '2041');
  assert.equal(libreta.matricula.grado, 'Tercero');
  assert.equal(libreta.matricula.seccion, 'A');
  assert.equal(libreta.estudiante.apellidosNombres, 'Libreta, alumno-libreta');
  assert.equal(libreta.areas.length, 4);
  assert.equal(competenciaDe(libreta, 'MAT-1').logros[1], 'C');
});

test('LIB-02 el apoderado vinculado consulta la libreta de su hijo', async () => {
  const libreta = await consultar(apoderado);
  assert.equal(competenciaDe(libreta, 'COM-1').logros[1], 'AD');
});

test('LIB-03 otro alumno y otro apoderado no consultan esa libreta', async () => {
  for (const agente of [alumnoAjeno, apoderadoAjeno]) {
    const { body } = await agente.get(`${base}/libretas/${matricula.id}`).expect(403);
    assert.equal(body.error.code, 'STUDENT_FORBIDDEN');
  }
});

test('LIB-04 un apoderado con el vínculo inactivo no consulta la libreta', async () => {
  await apoderadoInactivo.get(`${base}/libretas/${matricula.id}`).expect(403);
  assert.deepEqual((await apoderadoInactivo.get(`${base}/libretas`).expect(200)).body.data, []);
});

test('LIB-05 administrador y docente, incluso el del curso, no consultan libretas', async () => {
  for (const agente of [admin, docente]) {
    await agente.get(`${base}/libretas`).expect(403);
    const { body } = await agente.get(`${base}/libretas/${matricula.id}`).expect(403);
    assert.equal(body.error.code, 'FORBIDDEN');
  }
});

test('LIB-06 sin sesión responde 401', async () => {
  await request(app).get(`${base}/libretas`).expect(401);
  await request(app).get(`${base}/libretas/${matricula.id}`).expect(401);
});

test('LIB-07 un id inválido responde 400 y una matrícula inexistente 404', async () => {
  await alumno.get(`${base}/libretas/abc`).expect(400);
  await alumno.get(`${base}/libretas/0`).expect(400);
  const { body } = await alumno.get(`${base}/libretas/999999`).expect(404);
  assert.equal(body.error.code, 'ENROLLMENT_NOT_FOUND');
});

test('LIB-08 quien es alumno y apoderado consulta su libreta y la de su hijo', async () => {
  assert.equal((await consultar(alumnoYApoderado, matriculaDoble.id)).matricula.seccion, 'B');
  assert.equal((await consultar(alumnoYApoderado)).matricula.seccion, 'A');
  await alumnoYApoderado.get(`${base}/libretas/${matriculaAjena.id}`).expect(403);
});

test('LIB-09 un administrador que es apoderado solo ve lo publicado de su hijo', async () => {
  const libreta = await consultar(adminYApoderado);
  assert.equal(competenciaDe(libreta, 'PS-1').logros[1], 'B');
  assert.equal(competenciaDe(libreta, 'PS-1').logros[2], null);
  await adminYApoderado.get(`${base}/libretas/${matriculaAjena.id}`).expect(403);
});

test('LIB-10 una nota de un bimestre sin publicar no sale del servidor', async () => {
  const libreta = await consultar(alumno);
  const logros = libreta.areas.flatMap((area) => area.competencias.map((item) => item.logros));
  assert.equal(logros.length, 8);
  assert.ok(logros.every((logro) => logro[1] !== null && logro[2] === null));
});

test('LIB-12 sin todos los bimestres publicados no hay notas anuales', async () => {
  const libreta = await consultar(alumno);
  assert.equal(libreta.anualCompleta, false);
  assert.ok(libreta.areas.every(({ calificacionFinal }) => calificacionFinal === null));
  assert.ok(
    libreta.areas
      .flatMap((area) => area.competencias)
      .every(({ calificacionAnual }) => calificacionAnual === null),
  );
});

test('LIB-11 regresión: cada periodo muestra su propio nivel y no un consolidado', async () => {
  await publicarBimestre(1);
  const { logros } = competenciaDe(await consultar(alumno), 'PS-1');
  assert.equal(logros[1], 'B');
  assert.equal(logros[2], 'A');
});

test('LIB-13 con todos publicados, la nota anual sigue la estrategia de la regla', async () => {
  await calificarBimestre(2);
  await publicarBimestre(2);
  await calificarBimestre(3);
  await publicarBimestre(3);
  const libreta = await consultar(alumno);
  assert.equal(libreta.anualCompleta, true);
  const anual = (codigo) => competenciaDe(libreta, codigo).calificacionAnual;
  assert.equal(anual('PS-1'), 'B');
  assert.equal(anual('COM-1'), 'A');
  assert.equal(anual('COM-2'), 'B');
  assert.equal(anual('MAT-1'), 'A');
});

test('LIB-14 un mínimo mayor a 4 no impide la nota anual', async () => {
  const libreta = await consultar(alumno);
  assert.equal(competenciaDe(libreta, 'MAT-2').calificacionAnual, 'B');
});

test('LIB-15 cambiar la regla después de publicar no altera la nota anual', async () => {
  await alta('reglas-consolidacion', {
    gradoId: grado.id,
    cursoId: cursos['2-PS'].id,
    nombre: 'Regla nueva',
    version: 2,
    metodo: regla('prioridad', { minimoEvidencias: 1 }),
  });
  assert.equal(competenciaDe(await consultar(alumno), 'PS-1').calificacionAnual, 'B');
});

test('LIB-16 la final del área aplica la estrategia sobre las notas anuales', async () => {
  const libreta = await consultar(alumno);
  assert.equal(areaDe(libreta, '2-PS').calificacionFinal, 'A', 'empate con desempate alto');
  assert.equal(areaDe(libreta, '5-MAT').calificacionFinal, 'A', 'prioridad');
  assert.equal(areaDe(libreta, '10-COM').calificacionFinal, 'B', 'reciente, empate al más bajo');
});

test('LIB-18 las áreas se ordenan por código de curso y las competencias por el suyo', async () => {
  const libreta = await consultar(alumno);
  assert.deepEqual(
    libreta.areas.map(({ codigo }) => codigo),
    ['2-PS', '5-MAT', '10-COM', '99-TR'],
  );
  assert.deepEqual(
    areaDe(libreta, '2-PS').competencias.map(({ codigo }) => codigo),
    ['PS-1', 'PS-2'],
  );
});

test('LIB-19 reasignar un curso no duplica el área', async () => {
  await dictar(cursos['2-PS'].id, seccionA.id, cuentaDocenteNuevo.docenteId);
  const libreta = await consultar(alumno);
  assert.equal(libreta.areas.filter(({ codigo }) => codigo === '2-PS').length, 1);
});

test('LIB-17 y LIB-20 competencias inactivas y competencias sin nota', async () => {
  await prisma.competencia.update({
    where: { id: competencias['MAT-2'].id },
    data: { activo: false },
  });
  const nueva = await alta('competencias', {
    cursoId: cursos['2-PS'].id,
    codigo: 'PS-3',
    nombre: 'PS-3',
    descripcion: 'Sin notas',
  });
  const libreta = await consultar(alumno);
  assert.equal(competenciaDe(libreta, 'MAT-2').logros[1], 'C');
  assert.deepEqual(competenciaDe(libreta, 'PS-3').logros, { 1: null, 2: null, 3: null, 4: null });
  assert.equal(competenciaDe(libreta, 'PS-3').calificacionAnual, null);
  assert.equal(areaDe(libreta, '2-PS').calificacionFinal, null);

  await prisma.competencia.update({ where: { id: nueva.id }, data: { activo: false } });
  await prisma.competencia.update({
    where: { id: competencias['MAT-2'].id },
    data: { activo: true },
  });
});

test('LIB-29 las competencias transversales salen como un área más, al final', async () => {
  const libreta = await consultar(alumno);
  const transversal = libreta.areas.at(-1);
  assert.equal(transversal.nombre, 'Competencias transversales');
  assert.deepEqual(
    transversal.competencias.map(({ calificacionAnual }) => calificacionAnual),
    ['A', 'B'],
  );
  assert.equal(transversal.calificacionFinal, 'B', 'desempate reciente pasa al más bajo');
});

test('LIB-23 la respuesta no expone docente, regla ni credenciales', async () => {
  const libreta = await consultar(apoderado);
  const texto = JSON.stringify(libreta);
  assert.doesNotMatch(texto, /docente-libreta|hashContrasena|metodo|regla|DNI-docente/i);
  assert.equal(libreta.estudiante.dni, 'DNI-ALUMNO-LIBRETA');
  assert.equal(texto.match(/DNI-/g).length, 1);
});

test('LIB-24 la institución sale de la configuración y sin valor es null', async () => {
  const anterior = env.INSTITUCION_UGEL;
  env.INSTITUCION_UGEL = 'UGEL 03';
  const { institucion } = await consultar(alumno);
  env.INSTITUCION_UGEL = anterior;
  assert.equal(institucion.ugel, 'UGEL 03');
  assert.equal(institucion.nombre, null);
  assert.deepEqual(Object.keys(institucion), ['nombre', 'dre', 'ugel', 'codigoModular', 'nivel']);
});

test('LIB-26 una boleta vencida no impide consultar la libreta', async () => {
  await prisma.planPago.create({
    data: {
      matriculaId: matricula.id,
      montoPension: 100,
      numeroCuotas: 1,
      diaVencimiento: 1,
      mesInicio: 1,
      boletas: {
        create: {
          numeroCuota: 1,
          concepto: 'Pensión',
          periodo: '2020-01',
          monto: 100,
          fechaVencimiento: new Date('2020-01-01'),
        },
      },
    },
  });
  await apoderado.get(`${base}/libretas/${matricula.id}`).expect(200);
});

test('LIB-22 una matrícula inactiva se lista y muestra lo publicado', async () => {
  await prisma.matricula.update({ where: { id: matricula.id }, data: { activo: false } });
  const libreta = await consultar(alumno);
  assert.equal(libreta.matricula.activa, false);
  assert.equal(competenciaDe(libreta, 'PS-1').logros[1], 'B');
  const [{ matriculas }] = (await alumno.get(`${base}/libretas`).expect(200)).body.data;
  assert.equal(matriculas[0].activa, false);
  await prisma.matricula.update({ where: { id: matricula.id }, data: { activo: true } });
});

test('LIB-25 la lista trae solo estudiantes autorizados, con el año más reciente primero', async () => {
  const seccionNueva = await alta('admin/catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: otroAnio.id,
  });
  await alta('admin/matriculas', {
    estudianteId: cuentaAlumno.estudianteId,
    seccionId: seccionNueva.id,
  });
  const lista = (await apoderado.get(`${base}/libretas`).expect(200)).body.data;
  assert.deepEqual(
    lista.map(({ id }) => id),
    [cuentaAlumno.estudianteId],
  );
  assert.deepEqual(
    lista[0].matriculas.map(({ anioAcademico }) => anioAcademico),
    ['2042', '2041'],
  );
  assert.equal(lista[0].matriculas[1].seccion, 'Tercero A');
  const doble = (await alumnoYApoderado.get(`${base}/libretas`).expect(200)).body.data;
  assert.equal(doble.length, 2);
});

test('LIB-21 al activar otro año, la libreta anterior sigue disponible', async () => {
  await admin.put(`${base}/admin/anios/${otroAnio.id}/activacion`).send({}).expect(200);
  const libreta = await consultar(alumno);
  assert.equal(libreta.matricula.anioAcademico, '2041');
  assert.equal(libreta.anualCompleta, true);
});

test('LIB-27 alumno y apoderado no consultan notas fuera de la libreta', async () => {
  const nota = await prisma.calificacion.findFirst({ where: { matriculaId: matricula.id } });
  for (const agente of [alumno, apoderado]) {
    await agente.get(`${base}/calificaciones`).expect(403);
    await agente.get(`${base}/calificaciones/${nota.id}`).expect(403);
  }
});

test('LIB-28 un docente que también es apoderado sigue consultando como docente', async () => {
  const { body } = await docenteYApoderado.get(`${base}/calificaciones`).expect(200);
  assert.deepEqual(body.data, []);
});
