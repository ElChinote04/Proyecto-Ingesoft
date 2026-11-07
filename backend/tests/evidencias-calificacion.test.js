import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { backendRoot, env } from '../src/config/env.js';

const base = '/api/v1';
const clave = 'ClaveSegura123!';
const admin = request.agent(app);
const docente = request.agent(app);
const docenteAjeno = request.agent(app);
const docenteNuevo = request.agent(app);
const apoderado = request.agent(app);
let cuentaDocente, cuentaNueva, seccion, aula, curso, matricula, bimestre;
let competencia, competencia2, notaId, nota2Id;

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300, 0x20)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(300, 2),
]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 3)]);

const alta = async (ruta, datos) =>
  (await admin.post(`${base}/${ruta}`).send(datos).expect(201)).body.data;

async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('admin/usuarios', {
    numeroDocumento: identificador,
    nombres: identificador,
    apellidos: 'Evidencia',
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

const rutaEvidencias = (id = notaId) => `${base}/calificaciones-competencias/${id}/evidencias`;
const rutaEvidencia = (id) => `${base}/evidencias-calificaciones/${id}`;
const consultar = (agente = docente) =>
  agente.get(`${base}/matriculas/${matricula.id}/calificaciones?bimestreId=${bimestre.id}`);
const guardar = (nivelLogro, competenciaId = competencia.id, agente = docente) =>
  agente
    .put(`${base}/matriculas/${matricula.id}/calificaciones`)
    .send({ bimestreId: bimestre.id, calificaciones: [{ competenciaId, nivelLogro }] });
const registrar = (titulo = 'Práctica 1', descripcion = 'Resolvió 4 de 5 problemas.') =>
  docente.post(rutaEvidencias()).field('titulo', titulo).field('descripcion', descripcion);

async function archivosEnDisco() {
  try {
    return (await readdir(path.resolve(backendRoot, env.EVIDENCIAS_DIR))).length;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

const publicar = () =>
  prisma.publicacionSeccion.create({
    data: { bimestreId: bimestre.id, seccionId: seccion.id, publicadoPorId: cuentaDocente.id },
  });
const despublicar = () => prisma.publicacionSeccion.deleteMany();

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: 'ADMIN-EVID',
      nombres: 'Administrador',
      apellidos: 'Evidencia',
      identificador: 'admin-evid',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-evid', contrasena: clave })
    .expect(200);

  cuentaDocente = await crearCuenta('docente-evid', ['DOCENTE'], docente);
  await crearCuenta('docente-ajeno-evid', ['DOCENTE'], docenteAjeno);
  cuentaNueva = await crearCuenta('docente-nuevo-evid', ['DOCENTE'], docenteNuevo);
  const cuentaApoderado = await crearCuenta('apoderado-evid', ['APODERADO'], apoderado);

  const anio = await alta('admin/catalogos/anios', { codigo: '2036' });
  const grado = await alta('admin/catalogos/grados', { nombre: 'Quinto' });
  seccion = await alta('admin/catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  aula = await alta('admin/catalogos/aulas', { codigo: 'E501' });
  curso = await alta('admin/catalogos/cursos', { codigo: 'MAT', nombre: 'Matemática' });
  competencia = await alta('competencias', {
    cursoId: curso.id,
    codigo: 'MAT-1',
    nombre: 'Resuelve problemas',
    descripcion: 'Prueba',
  });
  competencia2 = await alta('competencias', {
    cursoId: curso.id,
    codigo: 'MAT-2',
    nombre: 'Comunica ideas',
    descripcion: 'Prueba',
  });
  await alta('reglas-consolidacion', {
    gradoId: grado.id,
    cursoId: curso.id,
    nombre: 'Regla',
    version: 1,
    metodo: 'frecuencia',
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
    numeroDocumento: 'DNI-EVID',
    nombres: 'Lucía',
    apellidos: 'Evidencia',
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

  await guardar('A').expect(200);
  await guardar('B', competencia2.id).expect(200);
  const ficha = (await consultar().expect(200)).body.data;
  [notaId, nota2Id] = ficha.cursos[0].competencias.map((item) => item.calificacionCompetenciaId);
});
after(() => prisma.$disconnect());

test('EVC-01 registra solo con descripción, audita y fija el nivel en el servidor', async () => {
  const { body } = await registrar().expect(201);
  assert.equal(body.data.titulo, 'Práctica 1');
  assert.equal(body.data.nivelLogroRegistrado, 'A');
  assert.deepEqual(body.data.archivos, []);
  const [evento] = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'EVIDENCIA_CALIFICACION_REGISTRADA', entidadId: body.data.id },
  });
  assert.equal(evento.entidad, 'EvidenciaCalificacion');
  assert.equal(evento.detalle.valorNuevo.titulo, 'Práctica 1');
});

test('EVC-02 registra con PDF y JPG y descarga el mismo contenido', async () => {
  const antes = await archivosEnDisco();
  const { body } = await docente
    .post(rutaEvidencias())
    .field('titulo', 'Examen')
    .attach('archivos', PDF, 'práctica final.pdf')
    .attach('archivos', JPG, 'foto.jpg')
    .expect(201);
  assert.equal(await archivosEnDisco(), antes + 2);
  const [pdf, jpg] = body.data.archivos;
  assert.equal(pdf.nombre, 'práctica final.pdf');
  assert.equal(pdf.tipoMime, 'application/pdf');
  assert.equal(jpg.tipoMime, 'image/jpeg');
  const descarga = await docente
    .get(`${rutaEvidencia(body.data.id)}/archivos/${pdf.id}`)
    .buffer(true)
    .parse((respuesta, listo) => {
      const partes = [];
      respuesta.on('data', (parte) => partes.push(parte));
      respuesta.on('end', () => listo(null, Buffer.concat(partes)));
    })
    .expect(200);
  assert.ok(descarga.body.equals(PDF));
  assert.match(descarga.headers['content-disposition'], /^attachment/);
  assert.equal(descarga.headers['x-content-type-options'], 'nosniff');
});

test('EVC-03 expone alumno, curso y competencia, y nunca el nombre en disco', async () => {
  const { body } = await docente.get(rutaEvidencias()).expect(200);
  assert.equal(body.data.contexto.alumno.nombre, 'Lucía Evidencia');
  assert.equal(body.data.contexto.curso.nombre, 'Matemática');
  assert.equal(body.data.contexto.competencia.codigo, 'MAT-1');
  assert.equal(body.data.contexto.bimestre.id, bimestre.id);
  assert.equal(JSON.stringify(body).includes('nombreAlmacenado'), false);
  await admin.get(rutaEvidencias()).expect(200);
});

test('EVC-04 rechaza una evidencia sin descripción ni archivos', async () => {
  const { body } = await docente
    .post(rutaEvidencias())
    .field('titulo', 'Vacía')
    .field('descripcion', '   ')
    .expect(400);
  assert.equal(body.error.code, 'EVIDENCE_EMPTY');
});

test('EVC-05 rechaza campo extra y título demasiado largo', async () => {
  await registrar().field('docenteId', '1').expect(400);
  await registrar('x'.repeat(121)).expect(400);
  await docente.post(rutaEvidencias()).field('descripcion', 'Sin título').expect(400);
  await docente.post(rutaEvidencias(999999)).field('titulo', 'T').expect(404);
});

test('EVC-06 rechaza un ejecutable renombrado sin dejar archivo', async () => {
  const antes = await archivosEnDisco();
  const { body } = await docente
    .post(rutaEvidencias())
    .field('titulo', 'Falsa')
    .attach('archivos', EXE, 'tarea.pdf')
    .expect(400);
  assert.equal(body.error.code, 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(await archivosEnDisco(), antes);
});

test('EVC-07 rechaza más de 5 MB y un cuarto archivo', async () => {
  const grande = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
  const pesado = await docente
    .post(rutaEvidencias())
    .field('titulo', 'Pesada')
    .attach('archivos', grande, 'grande.pdf')
    .expect(400);
  assert.equal(pesado.body.error.code, 'FILE_TOO_LARGE');
  const muchos = await docente
    .post(rutaEvidencias())
    .field('titulo', 'Muchos')
    .attach('archivos', PDF, '1.pdf')
    .attach('archivos', PDF, '2.pdf')
    .attach('archivos', PDF, '3.pdf')
    .attach('archivos', PDF, '4.pdf')
    .expect(400);
  assert.equal(muchos.body.error.code, 'TOO_MANY_FILES');
});

test('EVC-08 sin sesión ninguna ruta responde', async () => {
  const anonimo = request(app);
  await anonimo.get(rutaEvidencias()).expect(401);
  await anonimo.post(rutaEvidencias()).field('titulo', 'T').expect(401);
  await anonimo.patch(rutaEvidencia(1)).send({ titulo: 'T' }).expect(401);
  await anonimo.delete(rutaEvidencia(1)).expect(401);
  await anonimo.post(`${rutaEvidencia(1)}/archivos`).expect(401);
  await anonimo.get(`${rutaEvidencia(1)}/archivos/1`).expect(401);
  await anonimo.delete(`${rutaEvidencia(1)}/archivos/1`).expect(401);
});

test('EVC-09 otro docente y el apoderado no consultan ni descargan', async () => {
  const { evidencias } = (await docente.get(rutaEvidencias()).expect(200)).body.data;
  const conArchivo = evidencias.find(({ archivos }) => archivos.length);
  const descarga = `${rutaEvidencia(conArchivo.id)}/archivos/${conArchivo.archivos[0].id}`;
  for (const agente of [docenteAjeno, apoderado]) {
    await agente.get(rutaEvidencias()).expect(403);
    await agente.get(descarga).expect(403);
  }
  await docenteAjeno
    .post(rutaEvidencias())
    .field('titulo', 'T')
    .field('descripcion', 'D')
    .expect(403);
  await docenteAjeno.patch(rutaEvidencia(conArchivo.id)).send({ titulo: 'T' }).expect(403);
  await docenteAjeno.delete(rutaEvidencia(conArchivo.id)).expect(403);
  await apoderado.post(rutaEvidencias()).field('titulo', 'T').expect(403);
});

test('EVC-10 con la sección publicada el docente solo consulta y descarga', async () => {
  const { evidencias } = (await docente.get(rutaEvidencias()).expect(200)).body.data;
  const evidencia = evidencias.find(({ archivos }) => archivos.length);
  const archivo = `${rutaEvidencia(evidencia.id)}/archivos/${evidencia.archivos[0].id}`;
  await publicar();
  try {
    const intentos = [
      () => registrar(),
      () => docente.patch(rutaEvidencia(evidencia.id)).send({ titulo: 'Otro' }),
      () => docente.delete(rutaEvidencia(evidencia.id)),
      () =>
        docente.post(`${rutaEvidencia(evidencia.id)}/archivos`).attach('archivos', PNG, 'a.png'),
      () => docente.delete(archivo),
    ];
    for (const intento of intentos) {
      const { body } = await intento().expect(409);
      assert.equal(body.error.code, 'TERM_PUBLISHED');
    }
    const consulta = await docente.get(rutaEvidencias()).expect(200);
    assert.equal(consulta.body.data.publicado, true);
    await docente.get(archivo).expect(200);
  } finally {
    await despublicar();
  }
});

test('EVC-11 con la sección publicada el administrador da de baja solo con motivo', async () => {
  const { id } = (await registrar('Para el administrador').expect(201)).body.data;
  await publicar();
  try {
    const sinMotivo = await admin.delete(rutaEvidencia(id)).expect(400);
    assert.equal(sinMotivo.body.error.code, 'CORRECTION_REASON_REQUIRED');
    await admin.delete(rutaEvidencia(id)).send({ motivo: 'Archivo de otro alumno' }).expect(200);
    const [evento] = await prisma.registroAuditoria.findMany({
      where: { tipoEvento: 'EVIDENCIA_CALIFICACION_DADA_DE_BAJA', entidadId: id },
    });
    assert.equal(evento.detalle.motivo, 'Archivo de otro alumno');
  } finally {
    await despublicar();
  }
});

test('EVC-12 cambiar la nota conserva el nivel registrado y el vínculo', async () => {
  const { id } = (await registrar('Antes del cambio').expect(201)).body.data;
  await guardar('C').expect(200);
  const { body } = await docente.get(rutaEvidencias()).expect(200);
  assert.equal(body.data.contexto.nivelActual, 'C');
  const evidencia = body.data.evidencias.find((item) => item.id === id);
  assert.equal(evidencia.nivelLogroRegistrado, 'A');
  await docente.patch(rutaEvidencia(id)).send({ titulo: 'Editada' }).expect(200);
  const editada = await prisma.evidenciaCalificacion.findUnique({ where: { id } });
  assert.equal(editada.nivelLogroRegistrado, 'A');
  await guardar('A').expect(200);
});

test('EVC-13 la baja conserva el archivo, lo excluye del contador y sigue en la lista', async () => {
  const totalDe = async () =>
    (await consultar().expect(200)).body.data.cursos[0].competencias[0].totalEvidencias;
  const { id } = (
    await docente
      .post(rutaEvidencias())
      .field('titulo', 'Se dará de baja')
      .attach('archivos', PNG, 'baja.png')
      .expect(201)
  ).body.data;
  const antes = await totalDe();
  const enDisco = await archivosEnDisco();
  await docente.delete(rutaEvidencia(id)).expect(200);
  assert.equal(await totalDe(), antes - 1);
  assert.equal(await archivosEnDisco(), enDisco);
  const { evidencias } = (await docente.get(rutaEvidencias()).expect(200)).body.data;
  assert.equal(evidencias.find((item) => item.id === id).activo, false);
  assert.equal(evidencias.at(-1).activo, false);
  assert.equal(evidencias[0].activo, true);
});

test('EVC-14 una evidencia inactiva no se edita, pero se descarga', async () => {
  const { evidencias } = (await docente.get(rutaEvidencias()).expect(200)).body.data;
  const inactiva = evidencias.find(({ activo, archivos }) => !activo && archivos.length);
  const { body } = await docente
    .patch(rutaEvidencia(inactiva.id))
    .send({ titulo: 'Otro' })
    .expect(409);
  assert.equal(body.error.code, 'EVIDENCE_INACTIVE');
  await docente.delete(rutaEvidencia(inactiva.id)).expect(409);
  await docente
    .get(`${rutaEvidencia(inactiva.id)}/archivos/${inactiva.archivos[0].id}`)
    .expect(200);
});

test('EVC-15 no se puede quitar el único contenido restante', async () => {
  const conArchivo = (
    await docente
      .post(rutaEvidencias())
      .field('titulo', 'Solo archivo')
      .attach('archivos', PDF, 'unico.pdf')
      .expect(201)
  ).body.data;
  const quitar = await docente
    .delete(`${rutaEvidencia(conArchivo.id)}/archivos/${conArchivo.archivos[0].id}`)
    .expect(400);
  assert.equal(quitar.body.error.code, 'EVIDENCE_EMPTY');
  const vaciar = await docente
    .patch(rutaEvidencia(conArchivo.id))
    .send({ descripcion: 'Ahora con texto' })
    .expect(200);
  assert.equal(vaciar.body.data.descripcion, 'Ahora con texto');
  await docente
    .delete(`${rutaEvidencia(conArchivo.id)}/archivos/${conArchivo.archivos[0].id}`)
    .expect(200);
  const sinNada = await docente
    .patch(rutaEvidencia(conArchivo.id))
    .send({ descripcion: null })
    .expect(400);
  assert.equal(sinNada.body.error.code, 'EVIDENCE_EMPTY');
  await docente
    .get(`${rutaEvidencia(conArchivo.id)}/archivos/${conArchivo.archivos[0].id}`)
    .expect(404);
});

test('EVC-16 si falla la transacción no queda fila ni archivo', async () => {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fallar_evidencia() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'fallo de prueba'; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER fallar_evidencia BEFORE INSERT ON "EvidenciaCalificacion"
    FOR EACH ROW EXECUTE FUNCTION fallar_evidencia()`);
  const filas = await prisma.evidenciaCalificacion.count();
  const enDisco = await archivosEnDisco();
  try {
    await docente
      .post(rutaEvidencias())
      .field('titulo', 'Fallará')
      .attach('archivos', PDF, 'fallo.pdf')
      .expect(500);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER fallar_evidencia ON "EvidenciaCalificacion"');
    await prisma.$executeRawUnsafe('DROP FUNCTION fallar_evidencia');
  }
  assert.equal(await prisma.evidenciaCalificacion.count(), filas);
  assert.equal(await archivosEnDisco(), enDisco);
});

test('EVC-17 dos subidas simultáneas no superan tres archivos activos', async () => {
  const { id } = (
    await docente
      .post(rutaEvidencias())
      .field('titulo', 'Concurrente')
      .attach('archivos', PDF, 'base.pdf')
      .expect(201)
  ).body.data;
  const enDisco = await archivosEnDisco();
  const subir = () =>
    docente
      .post(`${rutaEvidencia(id)}/archivos`)
      .attach('archivos', PDF, 'a.pdf')
      .attach('archivos', PNG, 'b.png');
  const respuestas = await Promise.all([subir(), subir()]);
  assert.deepEqual(respuestas.map(({ status }) => status).sort(), [201, 400]);
  const activos = await prisma.archivoEvidenciaCalificacion.count({
    where: { evidenciaId: id, activo: true },
  });
  assert.equal(activos, 3);
  assert.equal(await archivosEnDisco(), enDisco + 2);
  const lleno = await docente
    .post(`${rutaEvidencia(id)}/archivos`)
    .attach('archivos', PDF, 'c.pdf')
    .expect(400);
  assert.equal(lleno.body.error.code, 'TOO_MANY_FILES');
  await docente.post(`${rutaEvidencia(id)}/archivos`).expect(400);
});

test('EVC-19 la ficha indica la nota, sus evidencias y si está publicada', async () => {
  const { body } = await consultar().expect(200);
  assert.equal(body.data.bimestre.publicado, false);
  const [primera, segunda] = body.data.cursos[0].competencias;
  assert.equal(primera.calificacionCompetenciaId, notaId);
  assert.ok(primera.totalEvidencias > 0);
  assert.equal(segunda.calificacionCompetenciaId, nota2Id);
  assert.equal(segunda.totalEvidencias, 0);
});

test('EVC-20 regresión: la evidencia del plan académico se crea y se audita', async () => {
  const asignacion = await prisma.cursoSeccionDocente.findFirst({
    where: { cursoId: curso.id, seccionId: seccion.id },
  });
  const plan = await prisma.planAcademico.create({
    data: {
      bimestreId: bimestre.id,
      asignacionId: asignacion.id,
      titulo: 'Plan',
      objetivo: 'Objetivo',
      fechaInicio: new Date('2036-03-01'),
      creadoPorId: cuentaDocente.id,
      modificadoPorId: cuentaDocente.id,
    },
  });
  const { body } = await docente
    .post(`${base}/evidencias-pedagogicas`)
    .send({
      docenteId: cuentaDocente.docenteId,
      planId: plan.id,
      descripcionAvance: 'Avance del plan',
      archivos: ['informe.pdf'],
    })
    .expect(201);
  const [evento] = await prisma.registroAuditoria.findMany({
    where: { tipoEvento: 'EVIDENCIA_CREADA', entidadId: body.data.id },
  });
  assert.equal(evento.entidad, 'EvidenciaPedagogica');
  assert.equal(evento.resultado, 'EXITO');
  assert.equal(evento.detalle.valorNuevo.descripcionAvance, 'Avance del plan');
});

// Al final: deja el curso en manos de otro docente.
test('EVC-18 tras cambiar de docente, el nuevo accede y el anterior no', async () => {
  const anterior = await prisma.cursoSeccionDocente.findFirst({
    where: { cursoId: curso.id, seccionId: seccion.id, docenteId: cuentaDocente.docenteId },
  });
  await alta('admin/bloques', {
    cursoId: curso.id,
    seccionId: seccion.id,
    docenteId: cuentaNueva.docenteId,
    aulaId: aula.id,
    diaSemana: 2,
    horaInicio: '08:00',
    horaFin: '09:00',
  });
  await prisma.cursoSeccionDocente.update({
    where: { id: anterior.id },
    data: { activo: false },
  });

  await docente.get(rutaEvidencias()).expect(403);
  await docente.post(rutaEvidencias()).field('titulo', 'T').field('descripcion', 'D').expect(403);

  const ficha = (await consultar(docenteNuevo).expect(200)).body.data;
  const [heredada] = ficha.cursos[0].competencias;
  assert.equal(heredada.calificacionCompetenciaId, notaId);
  assert.equal(heredada.nivelLogro, 'A');
  await docenteNuevo.get(rutaEvidencias()).expect(200);
  await docenteNuevo
    .post(rutaEvidencias())
    .field('titulo', 'Del docente nuevo')
    .field('descripcion', 'Continúa el sustento')
    .expect(201);

  await guardar('AD', competencia.id, docenteNuevo).expect(200);
  const nota = await prisma.calificacionCompetencia.findUnique({ where: { id: notaId } });
  assert.equal(nota.nivelLogro, 'AD');
  assert.equal(await prisma.calificacion.count({ where: { matriculaId: matricula.id } }), 1);
});
