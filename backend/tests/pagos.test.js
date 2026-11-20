// US-006 (emisión del compromiso de pago), US-007A (historial de boletas) y
// US-007B (pago de una boleta mediante la pasarela).
// Se ejecuta con la pasarela simulada: no sale a la red ni requiere llaves.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/logging/logger.js';
import { simulada, RESULTADO } from '../src/integrations/pasarelaPagos.js';
import { AppError } from '../src/errors/AppError.js';

const base = '/api/v1';
const claveInicial = 'InicialTemporal123!';
const clave = 'PersonalSegura123!';
const admin = request.agent(app);
const apoderado = request.agent(app);
const otroApoderado = request.agent(app);

let cuentaApoderado, cuentaOtro, estudiante, otroEstudiante, anio, grado, seccion;
let matricula, matriculaAjena;

const alta = async (ruta, datos, estado = 201) =>
  (await admin.post(`${base}/admin/${ruta}`).send(datos).expect(estado)).body.data;

let documentoCuenta = 10000000;
async function crearCuenta(identificador, roles, agente) {
  const cuenta = await alta('usuarios', {
    identificador,
    numeroDocumento: String(++documentoCuenta),
    nombres: 'Usuario',
    apellidos: 'Prueba',
    contrasena: claveInicial,
    roles,
  });
  await agente.post(`${base}/auth/login`).send({ identificador, contrasena: claveInicial });
  await agente
    .put(`${base}/auth/contrasena`)
    .send({ contrasenaActual: claveInicial, nuevaContrasena: clave })
    .expect(200);
  await agente.post(`${base}/auth/login`).send({ identificador, contrasena: clave }).expect(200);
  return cuenta;
}

const planBase = {
  montoPension: '350.00',
  numeroCuotas: 10,
  diaVencimiento: 10,
  mesInicio: 3,
  concepto: 'Pensión',
};

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: '90000000',
      nombres: 'Administrador',
      apellidos: 'Pagos',
      identificador: 'admin-pagos@prueba.local',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-pagos@prueba.local', contrasena: clave })
    .expect(200);

  cuentaApoderado = await crearCuenta('apoderado-pagos@prueba.local', ['APODERADO'], apoderado);
  cuentaOtro = await crearCuenta('apoderado-ajeno@prueba.local', ['APODERADO'], otroApoderado);

  estudiante = await alta('estudiantes', {
    numeroDocumento: '20000001',
    nombres: 'Hijo',
    apellidos: 'Delapoderado',
  });
  otroEstudiante = await alta('estudiantes', {
    numeroDocumento: '20000002',
    nombres: 'Ajeno',
    apellidos: 'Estudiante',
  });
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({
      apoderadoId: cuentaApoderado.apoderadoId,
      estudianteId: estudiante.id,
      parentesco: 'Padre',
    })
    .expect(200);
  await admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({
      apoderadoId: cuentaOtro.apoderadoId,
      estudianteId: otroEstudiante.id,
      parentesco: 'Madre',
    })
    .expect(200);

  // Año futuro para que las boletas nazcan todas al día y la prueba de
  // morosidad no dependa de la fecha en que se ejecute la suite.
  anio = await alta('catalogos/anios', { codigo: '2030' });
  grado = await alta('catalogos/grados', { nombre: 'Primero' });
  seccion = await alta('catalogos/secciones', {
    nombre: 'A',
    gradoId: grado.id,
    anioAcademicoId: anio.id,
  });
  matricula = await alta('matriculas', {
    estudianteId: estudiante.id,
    seccionId: seccion.id,
    planPago: planBase,
  });
  matriculaAjena = await alta('matriculas', {
    estudianteId: otroEstudiante.id,
    seccionId: seccion.id,
  });
});

after(async () => {
  simulada.reiniciar();
  await prisma.$disconnect();
  await new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
});

// ------------------------------------------------------------------- US-006
test('US-006: matricular con plan emite el cronograma completo en la misma transacción', async () => {
  const plan = await prisma.planPago.findUnique({
    where: { matriculaId: matricula.id },
    include: { boletas: { orderBy: { numeroCuota: 'asc' } } },
  });
  assert.ok(plan, 'la matrícula debe tener su plan de pago');
  assert.equal(plan.boletas.length, 10);
  assert.equal(plan.boletas[0].periodo, '2030-03');
  assert.equal(plan.boletas[9].periodo, '2030-12');
  assert.equal(Number(plan.boletas[0].monto), 350);
  assert.ok(plan.boletas.every((b) => b.estado === 'PENDIENTE'));
});

test('US-006: la emisión queda auditada', async () => {
  const registro = await prisma.registroAuditoria.findFirst({
    where: { tipoEvento: 'COMPROMISO_PAGO_EMITIDO' },
  });
  assert.ok(registro, 'debe existir el registro de auditoría de la emisión');
});

test('US-006: solo el administrador emite compromisos y no se duplican', async () => {
  await apoderado
    .post(`${base}/matriculas/${matriculaAjena.id}/plan-pago`)
    .send(planBase)
    .expect(403);
  await admin.post(`${base}/matriculas/${matriculaAjena.id}/plan-pago`).send(planBase).expect(201);
  const repetido = await admin
    .post(`${base}/matriculas/${matriculaAjena.id}/plan-pago`)
    .send(planBase)
    .expect(409);
  assert.equal(repetido.body.error.code, 'PLAN_DUPLICADO');
  await admin.post(`${base}/matriculas/999999/plan-pago`).send(planBase).expect(404);
});

test('US-006: el plan rechaza datos fuera de rango y campos no declarados', async () => {
  const invalidos = [
    { ...planBase, numeroCuotas: 13 },
    { ...planBase, diaVencimiento: 31 },
    { ...planBase, montoPension: '350.999' },
    { ...planBase, mesInicio: 0 },
    { ...planBase, estado: 'PAGADA' }, // campo no declarado: el esquema es estricto
  ];
  for (const cuerpo of invalidos)
    await admin.post(`${base}/matriculas/${matricula.id}/plan-pago`).send(cuerpo).expect(400);
});

// ------------------------------------------------------------------ US-007A
test('US-007A: el apoderado ve el historial de su hijo, ordenado y con estado', async () => {
  const respuesta = await apoderado.get(`${base}/compromisos-pago?limite=100`).expect(200);
  const { boletas, total } = respuesta.body.data;
  assert.equal(total, 10);
  assert.equal(boletas[0].periodo, '2030-12', 'más reciente primero');
  for (const boleta of boletas) {
    assert.equal(boleta.estudiante.id, estudiante.id);
    assert.ok(['PENDIENTE', 'PAGADA', 'MOROSA'].includes(boleta.estado));
    assert.equal(boleta.monto, '350.00');
    assert.equal('planPagoId' in boleta, false, 'no se exponen claves internas');
  }
});

test('US-007A: un apoderado no ve las boletas de otros estudiantes', async () => {
  const ajenas = await otroApoderado.get(`${base}/compromisos-pago?limite=100`).expect(200);
  assert.ok(ajenas.body.data.boletas.every((b) => b.estudiante.id === otroEstudiante.id));
  await apoderado.get(`${base}/compromisos-pago?estudianteId=${otroEstudiante.id}`).expect(403);
});

test('US-007A: sin boletas devuelve una lista vacía, no un error', async () => {
  const sinHijos = request.agent(app);
  await crearCuenta('apoderado-sin-hijos@prueba.local', ['APODERADO'], sinHijos);
  const respuesta = await sinHijos.get(`${base}/compromisos-pago`).expect(200);
  assert.deepEqual(respuesta.body.data.boletas, []);
  assert.equal(respuesta.body.data.total, 0);
});

test('US-007A: la morosidad se calcula sobre la fecha de vencimiento', async () => {
  const boleta = await prisma.compromisoPago.findFirst({
    where: { planPago: { matriculaId: matricula.id } },
    orderBy: { numeroCuota: 'asc' },
  });
  await prisma.compromisoPago.update({
    where: { id: boleta.id },
    data: { fechaVencimiento: new Date('2020-01-10T00:00:00Z') },
  });
  const respuesta = await apoderado.get(`${base}/compromisos-pago?estado=MOROSA`).expect(200);
  assert.equal(respuesta.body.data.total, 1);
  assert.equal(respuesta.body.data.boletas[0].id, boleta.id);
  assert.equal(respuesta.body.data.boletas[0].estado, 'MOROSA');
});

test('US-007A: el historial exige sesión', async () => {
  await request(app).get(`${base}/compromisos-pago`).expect(401);
});

// ------------------------------------------------------------------ US-007B
async function boletaPendiente() {
  const boleta = await prisma.compromisoPago.findFirst({
    where: { planPago: { matriculaId: matricula.id }, estado: 'PENDIENTE' },
    orderBy: { numeroCuota: 'desc' },
  });
  return boleta;
}

// Sin async a propósito: debe devolver el Test de supertest para poder
// encadenar .expect(). Con async devolvería una Promise, que no lo tiene.
const notificar = (cuerpo, firma) =>
  request(app)
    .post(`${base}/pagos/notificaciones`)
    .set('x-sage-firma', firma ?? simulada.firmar(JSON.stringify(cuerpo)))
    .set('Content-Type', 'application/json')
    .send(cuerpo);

test('US-007B: el pago se inicia, deja la boleta intacta y devuelve la URL del proveedor', async () => {
  const boleta = await boletaPendiente();
  const respuesta = await apoderado
    .post(`${base}/pagos`)
    .send({ compromisoPagoId: boleta.id })
    .expect(201);
  const { pagoId, estado, urlCheckout, monto } = respuesta.body.data;
  assert.equal(estado, 'PROCESANDO');
  assert.equal(monto, '350.00');
  assert.ok(urlCheckout.includes('simulado='));

  const guardada = await prisma.compromisoPago.findUnique({ where: { id: boleta.id } });
  assert.equal(guardada.estado, 'PENDIENTE', 'la boleta no cambia hasta que la pasarela confirme');
  assert.equal(guardada.pagadaEn, null);

  const consulta = await apoderado.get(`${base}/pagos/${pagoId}`).expect(200);
  assert.equal(consulta.body.data.estado, 'PROCESANDO');
});

test('US-007B: no se permiten dos pagos en curso sobre la misma boleta', async () => {
  const boleta = await prisma.compromisoPago.findFirst({
    where: { planPago: { matriculaId: matricula.id }, pagos: { some: { estado: 'PROCESANDO' } } },
  });
  const repetido = await apoderado
    .post(`${base}/pagos`)
    .send({ compromisoPagoId: boleta.id })
    .expect(409);
  assert.equal(repetido.body.error.code, 'PAGO_EN_CURSO');
});

test('US-007B: un apoderado no puede pagar la boleta de otro estudiante', async () => {
  const ajena = await prisma.compromisoPago.findFirst({
    where: { planPago: { matriculaId: matriculaAjena.id } },
  });
  await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: ajena.id }).expect(403);
  await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: 999999 }).expect(404);
  await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: 1, extra: 'x' }).expect(400);
});

test('US-007B: la notificación con firma inválida se rechaza y no cambia nada', async () => {
  const pago = await prisma.pago.findFirst({ where: { estado: 'PROCESANDO' } });
  const cuerpo = { referencia: pago.referencia, idExterno: pago.referenciaExterna, tipo: 'pago' };
  await notificar(cuerpo, 'firma-falsa').expect(401);
  const sinCambios = await prisma.pago.findUnique({ where: { id: pago.id } });
  assert.equal(sinCambios.estado, 'PROCESANDO');
});

test('QAS008: la pasarela confirma y la boleta pasa a PAGADA una sola vez', async () => {
  const pago = await prisma.pago.findFirst({ where: { estado: 'PROCESANDO' } });
  simulada.marcar(pago.referenciaExterna, RESULTADO.PAGADO);
  const cuerpo = { referencia: pago.referencia, idExterno: pago.referenciaExterna, tipo: 'pago' };

  const primera = await notificar(cuerpo).expect(200);
  assert.equal(primera.body.data.aplicado, true);

  const confirmado = await prisma.pago.findUnique({ where: { id: pago.id } });
  assert.equal(confirmado.estado, 'CONFIRMADO');
  assert.ok(confirmado.confirmadoEn);
  const boleta = await prisma.compromisoPago.findUnique({
    where: { id: pago.compromisoPagoId },
  });
  assert.equal(boleta.estado, 'PAGADA');
  assert.ok(boleta.pagadaEn);

  // Reenvío del mismo evento: el proveedor reintenta mientras no recibe acuse.
  const segunda = await notificar(cuerpo).expect(200);
  assert.equal(segunda.body.data.aplicado, false);
  assert.equal(segunda.body.data.motivo, 'YA_CONFIRMADO');

  const pagos = await prisma.pago.count({
    where: { compromisoPagoId: pago.compromisoPagoId, estado: 'CONFIRMADO' },
  });
  assert.equal(pagos, 1, 'un solo pago confirmado por boleta');
  const auditoria = await prisma.registroAuditoria.count({
    where: { tipoEvento: 'PAGO_CONFIRMADO', entidadId: pago.id },
  });
  assert.equal(auditoria, 1, 'la confirmación se audita una sola vez');
});

test('US-007B: no se puede volver a pagar una boleta ya pagada', async () => {
  const pagada = await prisma.compromisoPago.findFirst({ where: { estado: 'PAGADA' } });
  const respuesta = await apoderado
    .post(`${base}/pagos`)
    .send({ compromisoPagoId: pagada.id })
    .expect(409);
  assert.equal(respuesta.body.error.code, 'BOLETA_YA_PAGADA');
});

test('US-007B: un pago rechazado deja la boleta en su estado anterior', async () => {
  const boleta = await boletaPendiente();
  const inicio = await apoderado
    .post(`${base}/pagos`)
    .send({ compromisoPagoId: boleta.id })
    .expect(201);
  const pago = await prisma.pago.findUnique({ where: { id: inicio.body.data.pagoId } });
  simulada.marcar(pago.referenciaExterna, RESULTADO.RECHAZADO);
  await notificar({
    referencia: pago.referencia,
    idExterno: pago.referenciaExterna,
    tipo: 'pago',
  }).expect(200);

  const tras = await prisma.pago.findUnique({ where: { id: pago.id } });
  assert.equal(tras.estado, 'RECHAZADO');
  assert.ok(tras.motivoRechazo);
  const sinCambios = await prisma.compromisoPago.findUnique({ where: { id: boleta.id } });
  assert.equal(sinCambios.estado, 'PENDIENTE');

  // Tras el rechazo el apoderado puede volver a intentarlo.
  await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boleta.id }).expect(201);
});

test('US-007B: una notificación con referencia desconocida responde 200 sin aplicar nada', async () => {
  const respuesta = await notificar({
    referencia: 'sage_inexistente',
    idExterno: 'sim_x',
    tipo: 'pago',
  }).expect(200);
  assert.equal(respuesta.body.data.aplicado, false);
  assert.equal(respuesta.body.data.motivo, 'REFERENCIA_DESCONOCIDA');
});

test('US-007B: solo quien inició el pago puede consultarlo', async () => {
  const pago = await prisma.pago.findFirst({ orderBy: { id: 'asc' } });
  await otroApoderado.get(`${base}/pagos/${pago.id}`).expect(403);
  await admin.get(`${base}/pagos/${pago.id}`).expect(200);
  await request(app).get(`${base}/pagos/${pago.id}`).expect(401);
});

test('la respuesta no expone campos internos del pago', async () => {
  const pago = await prisma.pago.findFirst({ where: { estado: 'CONFIRMADO' } });
  const respuesta = await admin.get(`${base}/pagos/${pago.id}`).expect(200);
  assert.equal('referenciaExterna' in respuesta.body.data, false);
  assert.equal('iniciadoPorId' in respuesta.body.data, false);
});

// ---------------------------------------------- US-007B: intento abandonado
// Una boleta PENDIENTE sin ningún pago en curso: el índice parcial impide
// iniciar otro mientras quede uno vivo, así que cada caso necesita la suya.
const boletaLibre = () =>
  prisma.compromisoPago.findFirst({
    where: {
      planPago: { matriculaId: matricula.id },
      estado: 'PENDIENTE',
      pagos: { none: { estado: { in: ['INICIADO', 'PROCESANDO'] } } },
    },
    orderBy: { numeroCuota: 'desc' },
  });

test('US-007B: cancelar un intento abandonado libera la boleta para pagarla de nuevo', async () => {
  const boleta = await boletaLibre();
  const primero = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boleta.id }).expect(201)
  ).body.data;

  const cancelado = await apoderado.delete(`${base}/pagos/${primero.pagoId}`).expect(200);
  assert.equal(cancelado.body.data.estado, 'CANCELADO');

  const guardada = await prisma.compromisoPago.findUnique({ where: { id: boleta.id } });
  assert.equal(guardada.estado, 'PENDIENTE', 'cancelar el intento no toca la boleta');

  // El motivo de existir del endpoint: sin él habría que esperar a que la
  // pasarela expire la sesión por su cuenta.
  const segundo = await apoderado
    .post(`${base}/pagos`)
    .send({ compromisoPagoId: boleta.id })
    .expect(201);
  assert.equal(segundo.body.data.estado, 'PROCESANDO');
  await apoderado.delete(`${base}/pagos/${segundo.body.data.pagoId}`).expect(200);
});

test('US-007B: cancelar es idempotente y no revive un intento ya cerrado', async () => {
  const pago = await prisma.pago.findFirst({ where: { estado: 'CANCELADO' } });
  const repetido = await apoderado.delete(`${base}/pagos/${pago.id}`).expect(200);
  assert.equal(repetido.body.data.yaCerrado, true);
  assert.equal(repetido.body.data.estado, 'CANCELADO');
});

test('US-007B: no se cancela un pago que la pasarela ya cobró; se confirma', async () => {
  const boleta = await boletaLibre();
  const pago = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boleta.id }).expect(201)
  ).body.data;

  // El apoderado pagó y pulsa «cancelar» antes de que llegue la notificación.
  const guardado = await prisma.pago.findUnique({ where: { id: pago.pagoId } });
  simulada.marcar(guardado.referenciaExterna, RESULTADO.PAGADO);

  const respuesta = await apoderado.delete(`${base}/pagos/${pago.pagoId}`).expect(409);
  assert.equal(respuesta.body.error.code, 'PAGO_CONFIRMADO');

  const despues = await prisma.pago.findUnique({ where: { id: pago.pagoId } });
  assert.equal(despues.estado, 'CONFIRMADO', 'el cobro real manda sobre la intención de cancelar');
  const pagada = await prisma.compromisoPago.findUnique({ where: { id: boleta.id } });
  assert.equal(pagada.estado, 'PAGADA');
});

test('US-007B: solo quien inició el pago puede cancelarlo', async () => {
  const boleta = await boletaLibre();
  const pago = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boleta.id }).expect(201)
  ).body.data;
  await otroApoderado.delete(`${base}/pagos/${pago.pagoId}`).expect(403);
  await request(app).delete(`${base}/pagos/${pago.pagoId}`).expect(401);
  await apoderado.delete(`${base}/pagos/999999`).expect(404);
  await apoderado.delete(`${base}/pagos/abc`).expect(400);
  await apoderado.delete(`${base}/pagos/${pago.pagoId}`).expect(200);
});

// ------------------------------------------- US-007A/B: estados en el listado
test('US-007A: el filtro PENDIENTE no incluye las boletas ya vencidas', async () => {
  const todas = (await apoderado.get(`${base}/compromisos-pago?limite=100`).expect(200)).body.data;
  assert.ok(
    todas.boletas.some((b) => b.estado === 'MOROSA'),
    'la suite deja una boleta morosa',
  );
  const pendientes = (
    await apoderado.get(`${base}/compromisos-pago?estado=PENDIENTE&limite=100`).expect(200)
  ).body.data;
  assert.ok(pendientes.total > 0);
  assert.ok(pendientes.boletas.every((b) => b.estado === 'PENDIENTE'));
  await apoderado.get(`${base}/compromisos-pago?estado=VENCIDA`).expect(400);
});

test('US-007B: el historial indica el pago en curso solo a quien puede abrirlo', async () => {
  const boleta = await boletaLibre();
  const pago = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boleta.id }).expect(201)
  ).body.data;
  const buscar = async (agente) =>
    (await agente.get(`${base}/compromisos-pago?limite=100`).expect(200)).body.data.boletas.find(
      (b) => b.id === boleta.id,
    );

  assert.equal((await buscar(apoderado)).pagoEnCursoId, pago.pagoId);
  assert.equal((await buscar(admin)).pagoEnCursoId, pago.pagoId);

  await apoderado.delete(`${base}/pagos/${pago.pagoId}`).expect(200);
  assert.equal((await buscar(apoderado)).pagoEnCursoId, null);
});

test('US-007B: si la pasarela falla al crear el pago, la boleta no queda bloqueada', async () => {
  const boleta = await boletaLibre();
  const original = simulada.crearIntento;
  simulada.crearIntento = async () => {
    throw new AppError(503, 'PASARELA_NO_DISPONIBLE', 'La pasarela no está disponible.');
  };
  try {
    const fallo = await apoderado
      .post(`${base}/pagos`)
      .send({ compromisoPagoId: boleta.id })
      .expect(503);
    assert.equal(fallo.body.error.code, 'PASARELA_NO_DISPONIBLE');
  } finally {
    simulada.crearIntento = original;
  }
  const cerrado = await prisma.pago.findFirst({
    where: { compromisoPagoId: boleta.id },
    orderBy: { id: 'desc' },
  });
  assert.equal(cerrado.estado, 'RECHAZADO');
  const intacta = await prisma.compromisoPago.findUnique({ where: { id: boleta.id } });
  assert.equal(intacta.estado, 'PENDIENTE');

  const reintento = await apoderado
    .post(`${base}/pagos`)
    .send({ compromisoPagoId: boleta.id })
    .expect(201);
  await apoderado.delete(`${base}/pagos/${reintento.body.data.pagoId}`).expect(200);
});

test('QAS008: dos notificaciones simultáneas confirman y auditan una sola vez', async () => {
  const boleta = await boletaLibre();
  const inicio = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boleta.id }).expect(201)
  ).body.data;
  const pago = await prisma.pago.findUnique({ where: { id: inicio.pagoId } });
  simulada.marcar(pago.referenciaExterna, RESULTADO.PAGADO);
  const cuerpo = { referencia: pago.referencia, idExterno: pago.referenciaExterna, tipo: 'pago' };

  const respuestas = await Promise.all([notificar(cuerpo), notificar(cuerpo)]);
  assert.ok(respuestas.every((r) => r.status === 200));
  assert.equal(respuestas.filter((r) => r.body.data.aplicado).length, 1);

  const auditoria = await prisma.registroAuditoria.count({
    where: { tipoEvento: 'PAGO_CONFIRMADO', entidadId: pago.id },
  });
  assert.equal(auditoria, 1);
});

// ------------------------------------------------------------------- US-009
// supertest no acumula cuerpos binarios por defecto: este parser los junta en un Buffer.
const comoBuffer = (res, cb) => {
  const partes = [];
  res.on('data', (parte) => partes.push(parte));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

const descargar = (agente, boletaId) =>
  agente.get(`${base}/compromisos-pago/${boletaId}/comprobante`).buffer(true).parse(comoBuffer);

test('US-009: toda boleta pagada tiene un comprobante y el historial muestra su número', async () => {
  const pagadas = await prisma.compromisoPago.findMany({
    where: { estado: 'PAGADA' },
    include: { comprobantes: { where: { anuladoEn: null } } },
  });
  assert.ok(pagadas.length > 0, 'las pruebas anteriores dejan boletas pagadas');
  assert.ok(
    pagadas.every((b) => b.comprobantes.length === 1),
    'ninguna boleta pagada queda sin comprobante',
  );

  const respuesta = await apoderado.get(`${base}/compromisos-pago?estado=PAGADA`).expect(200);
  for (const boleta of respuesta.body.data.boletas)
    assert.match(boleta.comprobante, /^B001-\d{8}$/);
  const pendientes = await apoderado.get(`${base}/compromisos-pago?estado=PENDIENTE`).expect(200);
  assert.ok(pendientes.body.data.boletas.every((b) => b.comprobante === null));
});

test('US-009: el apoderado descarga el comprobante en PDF', async () => {
  const pagada = await prisma.compromisoPago.findFirst({
    where: { estado: 'PAGADA', planPago: { matriculaId: matricula.id } },
    include: { comprobantes: { where: { anuladoEn: null } } },
  });
  const respuesta = await descargar(apoderado, pagada.id).expect(200);
  assert.equal(respuesta.headers['content-type'], 'application/pdf');
  const numero = `B001-${String(pagada.comprobantes[0].id).padStart(8, '0')}`;
  assert.match(respuesta.headers['content-disposition'], new RegExp(`comprobante-${numero}\\.pdf`));
  assert.equal(respuesta.body.subarray(0, 5).toString(), '%PDF-');
  assert.ok(respuesta.body.length > 1000);
});

test('US-009: el administrador también puede descargarlo', async () => {
  const pagada = await prisma.compromisoPago.findFirst({ where: { estado: 'PAGADA' } });
  const respuesta = await descargar(admin, pagada.id).expect(200);
  assert.equal(respuesta.body.subarray(0, 5).toString(), '%PDF-');
});

test('US-009: otro apoderado no puede descargar un comprobante ajeno', async () => {
  const pagada = await prisma.compromisoPago.findFirst({
    where: { estado: 'PAGADA', planPago: { matriculaId: matricula.id } },
  });
  const respuesta = await otroApoderado
    .get(`${base}/compromisos-pago/${pagada.id}/comprobante`)
    .expect(403);
  assert.equal(respuesta.body.error.code, 'FORBIDDEN');
  await request(app).get(`${base}/compromisos-pago/${pagada.id}/comprobante`).expect(401);
});

test('US-009: una boleta sin pagar no tiene comprobante', async () => {
  const pendiente = await prisma.compromisoPago.findFirst({
    where: { estado: 'PENDIENTE', planPago: { matriculaId: matricula.id } },
  });
  const respuesta = await apoderado
    .get(`${base}/compromisos-pago/${pendiente.id}/comprobante`)
    .expect(409);
  assert.equal(respuesta.body.error.code, 'BOLETA_NO_PAGADA');
  await apoderado.get(`${base}/compromisos-pago/999999/comprobante`).expect(404);
  await apoderado.get(`${base}/compromisos-pago/abc/comprobante`).expect(400);
});

test('US-009: las notificaciones repetidas no emiten un segundo comprobante', async () => {
  // Una boleta fraccionada (US-010) no tiene comprobante propio: lo tiene cada cuota.
  const pagadas = await prisma.compromisoPago.count({
    where: { estado: 'PAGADA', fracciones: { none: {} } },
  });
  const comprobantes = await prisma.comprobante.count();
  assert.equal(comprobantes, pagadas, 'exactamente un comprobante por boleta pagada');
});

// ------------------------------------------------------------------- US-010
async function pagarBoleta(boletaId) {
  const { pagoId } = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boletaId }).expect(201)
  ).body.data;
  const pago = await prisma.pago.findUnique({ where: { id: pagoId } });
  simulada.marcar(pago.referenciaExterna, RESULTADO.PAGADO);
  await notificar({
    referencia: pago.referencia,
    idExterno: pago.referenciaExterna,
    tipo: 'pago',
  }).expect(200);
}

const fraccionar = (agente, boletaId, datos, estado) =>
  agente.post(`${base}/compromisos-pago/${boletaId}/fracciones`).send(datos).expect(estado);

let boletaFraccionada;

// Una boleta original pendiente: las fracciones también son boletas pendientes
// del mismo plan, así que boletaLibre podría devolver una.
const boletaEntera = () =>
  prisma.compromisoPago.findFirst({
    where: {
      planPago: { matriculaId: matricula.id },
      estado: 'PENDIENTE',
      boletaOrigenId: null,
      pagos: { none: { estado: { in: ['INICIADO', 'PROCESANDO'] } } },
    },
    orderBy: { numeroCuota: 'desc' },
  });

test('US-010: el administrador fracciona una boleta pendiente y queda PARCIAL', async () => {
  boletaFraccionada = await boletaEntera();
  const respuesta = await fraccionar(
    admin,
    boletaFraccionada.id,
    { numeroCuotas: 2, montoCuota: '175.00', fechaPrimerVencimiento: '2030-06-10' },
    201,
  );
  const { estado, fracciones } = respuesta.body.data;
  assert.equal(estado, 'PARCIAL');
  assert.deepEqual(
    fracciones.map((f) => [f.numeroFraccion, f.monto, f.fechaVencimiento]),
    [
      [1, '175.00', '2030-06-10'],
      [2, '175.00', '2030-07-10'],
    ],
  );

  const guardada = await prisma.compromisoPago.findUnique({
    where: { id: boletaFraccionada.id },
    include: { fracciones: true },
  });
  assert.equal(guardada.estado, 'PARCIAL');
  assert.equal(guardada.fracciones.length, 2);
  assert.ok(guardada.fracciones.every((f) => f.estado === 'PENDIENTE'));
  const auditoria = await prisma.registroAuditoria.count({
    where: { tipoEvento: 'BOLETA_FRACCIONADA', entidadId: boletaFraccionada.id },
  });
  assert.equal(auditoria, 1);
});

test('US-010: la boleta fraccionada ya no se paga entera ni se vuelve a fraccionar', async () => {
  const pagoEntero = await apoderado
    .post(`${base}/pagos`)
    .send({ compromisoPagoId: boletaFraccionada.id })
    .expect(409);
  assert.equal(pagoEntero.body.error.code, 'BOLETA_FRACCIONADA');

  const datos = { numeroCuotas: 2, montoCuota: '175.00', fechaPrimerVencimiento: '2030-06-10' };
  const otraVez = await fraccionar(admin, boletaFraccionada.id, datos, 409);
  assert.equal(otraVez.body.error.code, 'BOLETA_NO_PENDIENTE');

  const parte = await prisma.compromisoPago.findFirst({
    where: { boletaOrigenId: boletaFraccionada.id },
  });
  const deParte = await fraccionar(admin, parte.id, datos, 409);
  assert.equal(deParte.body.error.code, 'BOLETA_ES_FRACCION');
});

test('US-010: solo el administrador fracciona y la suma no puede exceder el total', async () => {
  const boleta = await boletaEntera();
  // 2 cuotas de 200 ya suman 400: la tercera excedería los 350 de la boleta.
  const datos = { numeroCuotas: 3, montoCuota: '200.00', fechaPrimerVencimiento: '2030-06-10' };
  await fraccionar(apoderado, boleta.id, datos, 403);
  const excede = await fraccionar(admin, boleta.id, datos, 400);
  assert.equal(excede.body.error.code, 'FRACCIONES_EXCEDEN_TOTAL');
  await fraccionar(admin, boleta.id, { ...datos, numeroCuotas: 7 }, 400);
  await fraccionar(admin, boleta.id, { ...datos, extra: true }, 400);
  await fraccionar(admin, 999999, { ...datos, numeroCuotas: 2, montoCuota: '175.00' }, 404);
  const intacta = await prisma.compromisoPago.findUnique({ where: { id: boleta.id } });
  assert.equal(intacta.estado, 'PENDIENTE', 'un intento rechazado no cambia la boleta');
});

test('US-010: sigue PARCIAL hasta pagar la última cuota y cada cuota tiene comprobante', async () => {
  const partes = await prisma.compromisoPago.findMany({
    where: { boletaOrigenId: boletaFraccionada.id },
    orderBy: { numeroFraccion: 'asc' },
  });

  await pagarBoleta(partes[0].id);
  let original = await prisma.compromisoPago.findUnique({ where: { id: boletaFraccionada.id } });
  assert.equal(original.estado, 'PARCIAL', 'RF139: parcial mientras no se complete el total');

  const historial = await apoderado.get(`${base}/compromisos-pago?estado=PARCIAL`).expect(200);
  const fila = historial.body.data.boletas.find((b) => b.id === boletaFraccionada.id);
  assert.equal(fila.montoPagado, '175.00');
  const parteListada = (
    await apoderado.get(`${base}/compromisos-pago?limite=100`).expect(200)
  ).body.data.boletas.find((b) => b.id === partes[0].id);
  assert.equal(parteListada.boletaOrigenId, boletaFraccionada.id);
  assert.equal(parteListada.numeroFraccion, 1);
  assert.equal(parteListada.totalFracciones, 2);
  assert.match(parteListada.comprobante, /^B001-\d{8}$/);

  await pagarBoleta(partes[1].id);
  original = await prisma.compromisoPago.findUnique({ where: { id: boletaFraccionada.id } });
  assert.equal(original.estado, 'PAGADA');
  assert.ok(original.pagadaEn);

  const sinPropio = await apoderado
    .get(`${base}/compromisos-pago/${boletaFraccionada.id}/comprobante`)
    .expect(409);
  assert.equal(sinPropio.body.error.code, 'BOLETA_FRACCIONADA');
  await descargar(apoderado, partes[1].id).expect(200);
});

test('US-010: no se fracciona una boleta con un pago en curso', async () => {
  const boleta = await boletaEntera();
  const { pagoId } = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: boleta.id }).expect(201)
  ).body.data;
  const datos = { numeroCuotas: 2, montoCuota: '175.00', fechaPrimerVencimiento: '2030-06-10' };
  const respuesta = await fraccionar(admin, boleta.id, datos, 409);
  assert.equal(respuesta.body.error.code, 'PAGO_EN_CURSO');
  const intacta = await prisma.compromisoPago.findUnique({ where: { id: boleta.id } });
  assert.equal(intacta.estado, 'PENDIENTE');
  await apoderado.delete(`${base}/pagos/${pagoId}`).expect(200);
});

test('US-010 con US-012: el reporte cuenta las cuotas y no la boleta original', async () => {
  const original = await prisma.compromisoPago.findUnique({ where: { id: boletaFraccionada.id } });
  const dia = original.fechaVencimiento.toISOString().slice(0, 10);
  const { totales } = (
    await admin.get(`${base}/reportes/pagos?desde=${dia}&hasta=${dia}`).expect(200)
  ).body.data;
  const esperadas = await prisma.compromisoPago.findMany({
    where: {
      estado: { in: ['PENDIENTE', 'PAGADA'] },
      fracciones: { none: {} },
      fechaVencimiento: original.fechaVencimiento,
    },
  });
  assert.ok(!esperadas.some((b) => b.id === original.id));
  assert.equal(totales.boletas, esperadas.length, 'la boleta fraccionada no se suma');
});

test('US-010 con US-013: anular el pago de una cuota devuelve la original a PARCIAL', async () => {
  const ultima = await prisma.compromisoPago.findFirst({
    where: { boletaOrigenId: boletaFraccionada.id },
    orderBy: { numeroFraccion: 'desc' },
  });
  const pago = await prisma.pago.findFirst({
    where: { compromisoPagoId: ultima.id, estado: 'CONFIRMADO' },
  });
  await admin
    .put(`${base}/pagos/${pago.id}/anulacion`)
    .send({ motivo: 'Pago registrado por error en la cuota' })
    .expect(200);
  const original = await prisma.compromisoPago.findUnique({ where: { id: boletaFraccionada.id } });
  assert.equal(original.estado, 'PARCIAL');
  assert.equal(original.pagadaEn, null);
  const cuota = await prisma.compromisoPago.findUnique({ where: { id: ultima.id } });
  assert.equal(cuota.estado, 'PENDIENTE');

  // Al volver a pagarla, la original se completa otra vez.
  await pagarBoleta(ultima.id);
  const completa = await prisma.compromisoPago.findUnique({ where: { id: boletaFraccionada.id } });
  assert.equal(completa.estado, 'PAGADA');
});
