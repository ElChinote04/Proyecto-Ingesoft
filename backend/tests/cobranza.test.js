// US-008 (morosidad por estudiante), US-012 (reporte de pagos por periodo),
// US-013 (anulación de un pago) y US-011 (aviso de vencimiento en el portal).
// Se ejecuta con la pasarela simulada: no sale a la red ni requiere llaves.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/logging/logger.js';
import { simulada, RESULTADO } from '../src/integrations/pasarelaPagos.js';
import { inicioDelDia } from '../src/domain/cronograma.js';
import { agruparMorosos, calcularReporte } from '../src/domain/cobranza.js';

const base = '/api/v1';
const claveInicial = 'InicialTemporal123!';
const clave = 'PersonalSegura123!';
const admin = request.agent(app);
const apoderado = request.agent(app);
const otroApoderado = request.agent(app);

let cuentaAdmin, cuentaApoderado, cuentaOtro;
let estudianteMoroso, estudianteAlDia, estudianteAjeno;
let anio2020, anio2030, primero, segundo, seccion2020A, seccion2020B, seccion2030A;
let matriculaMorosa, matriculaAlDia, matriculaAjena;

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

const plan = (montoPension, numeroCuotas) => ({
  montoPension,
  numeroCuotas,
  diaVencimiento: 10,
  mesInicio: 3,
  concepto: 'Pensión',
});

const vincular = (apoderadoId, estudianteId, parentesco) =>
  admin
    .put(`${base}/admin/apoderados/estudiantes`)
    .send({ apoderadoId, estudianteId, parentesco })
    .expect(200);

// Sin async a propósito: devuelve el Test de supertest para poder encadenar .expect().
const notificar = (cuerpo) =>
  request(app)
    .post(`${base}/pagos/notificaciones`)
    .set('x-sage-firma', simulada.firmar(JSON.stringify(cuerpo)))
    .set('Content-Type', 'application/json')
    .send(cuerpo);

/** Recorre el pago completo: el apoderado lo inicia y la pasarela lo confirma. */
async function pagar(agente, boletaId) {
  const { pagoId } = (
    await agente.post(`${base}/pagos`).send({ compromisoPagoId: boletaId }).expect(201)
  ).body.data;
  const pago = await prisma.pago.findUnique({ where: { id: pagoId } });
  simulada.marcar(pago.referenciaExterna, RESULTADO.PAGADO);
  const cuerpo = { referencia: pago.referencia, idExterno: pago.referenciaExterna, tipo: 'pago' };
  await notificar(cuerpo).expect(200);
  return pago;
}

const boletasDe = (matriculaId) =>
  prisma.compromisoPago.findMany({
    where: { planPago: { matriculaId } },
    orderBy: { numeroCuota: 'asc' },
  });

const morosidad = async (consulta = '') =>
  (await admin.get(`${base}/reportes/pagos/morosidad${consulta}`).expect(200)).body.data;

const reporte = async (consulta) =>
  (await admin.get(`${base}/reportes/pagos?${consulta}`).expect(200)).body.data;

const sumarDias = (dias) => new Date(inicioDelDia().getTime() + dias * 24 * 60 * 60 * 1000);

before(async () => {
  await request(app)
    .post(`${base}/instalacion`)
    .send({
      numeroDocumento: '90000000',
      nombres: 'Administrador',
      apellidos: 'Cobranza',
      identificador: 'admin-cobranza@prueba.local',
      contrasena: clave,
      claveInstalacion: env.INITIAL_SETUP_KEY,
    })
    .expect(201);
  await admin
    .post(`${base}/auth/login`)
    .send({ identificador: 'admin-cobranza@prueba.local', contrasena: clave })
    .expect(200);
  cuentaAdmin = await prisma.usuario.findUnique({
    where: { identificador: 'admin-cobranza@prueba.local' },
  });

  cuentaApoderado = await crearCuenta('apoderado-cobranza@prueba.local', ['APODERADO'], apoderado);
  cuentaOtro = await crearCuenta('apoderado-otro@prueba.local', ['APODERADO'], otroApoderado);

  estudianteMoroso = await alta('estudiantes', {
    numeroDocumento: '20000001',
    nombres: 'Mario',
    apellidos: 'Moroso',
  });
  estudianteAlDia = await alta('estudiantes', {
    numeroDocumento: '20000002',
    nombres: 'Ana',
    apellidos: 'Aldia',
  });
  estudianteAjeno = await alta('estudiantes', {
    numeroDocumento: '20000003',
    nombres: 'Elena',
    apellidos: 'Ajena',
  });
  await vincular(cuentaApoderado.apoderadoId, estudianteMoroso.id, 'Padre');
  await vincular(cuentaApoderado.apoderadoId, estudianteAlDia.id, 'Padre');
  await vincular(cuentaOtro.apoderadoId, estudianteAjeno.id, 'Madre');

  // 2020 ya pasó: todas sus boletas están vencidas. 2030 aún no: todas al día.
  anio2020 = await alta('catalogos/anios', { codigo: '2020' });
  anio2030 = await alta('catalogos/anios', { codigo: '2030' });
  primero = await alta('catalogos/grados', { nombre: 'Primero' });
  segundo = await alta('catalogos/grados', { nombre: 'Segundo' });
  seccion2020A = await alta('catalogos/secciones', {
    nombre: 'A',
    gradoId: primero.id,
    anioAcademicoId: anio2020.id,
  });
  seccion2020B = await alta('catalogos/secciones', {
    nombre: 'B',
    gradoId: segundo.id,
    anioAcademicoId: anio2020.id,
  });
  seccion2030A = await alta('catalogos/secciones', {
    nombre: 'A',
    gradoId: primero.id,
    anioAcademicoId: anio2030.id,
  });
  matriculaMorosa = await alta('matriculas', {
    estudianteId: estudianteMoroso.id,
    seccionId: seccion2020A.id,
    planPago: plan('350.00', 10),
  });
  matriculaAjena = await alta('matriculas', {
    estudianteId: estudianteAjeno.id,
    seccionId: seccion2020B.id,
    planPago: plan('200.00', 3),
  });
  matriculaAlDia = await alta('matriculas', {
    estudianteId: estudianteAlDia.id,
    seccionId: seccion2030A.id,
    planPago: plan('400.00', 10),
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

// ------------------------------------------------------------------- US-008
test('US-008: lista a los estudiantes morosos agrupados, con su deuda y apoderados', async () => {
  const { resumen, estudiantes, fechaCorte } = await morosidad();
  assert.match(fechaCorte, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(resumen, { estudiantes: 2, boletas: 13, deuda: '4100.00' });

  const [primeroDeLaLista, segundoDeLaLista] = estudiantes;
  assert.equal(primeroDeLaLista.estudiante.id, estudianteMoroso.id, 'mayor deuda primero');
  assert.equal(primeroDeLaLista.boletasMorosas, 10);
  assert.equal(primeroDeLaLista.deuda, '3500.00');
  assert.equal(primeroDeLaLista.aula, 'Primero A');
  assert.equal(primeroDeLaLista.anioAcademico, '2020');
  assert.equal(primeroDeLaLista.vencimientoMasAntiguo, '2020-03-10');
  assert.ok(primeroDeLaLista.diasAtraso > 365);
  assert.deepEqual(primeroDeLaLista.apoderados, [
    { nombre: 'Usuario Prueba', parentesco: 'Padre' },
  ]);
  assert.equal(segundoDeLaLista.estudiante.id, estudianteAjeno.id);
  assert.equal(segundoDeLaLista.deuda, '600.00');
  assert.ok(
    estudiantes.every((fila) => fila.estudiante.id !== estudianteAlDia.id),
    'un estudiante al día no aparece',
  );
});

test('US-008: se filtra por año, grado y sección', async () => {
  const porSeccion = await morosidad(`?seccionId=${seccion2020B.id}`);
  assert.deepEqual(
    porSeccion.estudiantes.map((fila) => fila.estudiante.id),
    [estudianteAjeno.id],
  );
  const porGrado = await morosidad(`?gradoId=${primero.id}`);
  assert.deepEqual(
    porGrado.estudiantes.map((fila) => fila.estudiante.id),
    [estudianteMoroso.id],
  );
  const anioAlDia = await morosidad(`?anioAcademicoId=${anio2030.id}`);
  assert.deepEqual(anioAlDia.estudiantes, []);
  assert.equal(anioAlDia.resumen.deuda, '0.00');
});

test('US-008: una boleta pagada deja de contar como morosa', async () => {
  const [masAntigua] = await boletasDe(matriculaMorosa.id);
  await pagar(apoderado, masAntigua.id);
  const { estudiantes } = await morosidad(`?seccionId=${seccion2020A.id}`);
  assert.equal(estudiantes[0].boletasMorosas, 9);
  assert.equal(estudiantes[0].deuda, '3150.00');
  assert.equal(estudiantes[0].vencimientoMasAntiguo, '2020-04-10');
});

test('US-008: solo el administrador consulta la morosidad y con filtros válidos', async () => {
  await apoderado.get(`${base}/reportes/pagos/morosidad`).expect(403);
  await request(app).get(`${base}/reportes/pagos/morosidad`).expect(401);
  await admin.get(`${base}/reportes/pagos/morosidad?seccionId=abc`).expect(400);
  await admin.get(`${base}/reportes/pagos/morosidad?estado=MOROSA`).expect(400);
});

// ------------------------------------------------------------------- US-012
test('US-012: totales recaudado, pendiente y moroso por periodo', async () => {
  const datos = await reporte('desde=2020-01-01&hasta=2020-12-31');
  assert.equal(datos.desde, '2020-01-01');
  assert.deepEqual(datos.totales, {
    boletas: 13,
    emitido: '4100.00',
    recaudado: '350.00',
    pendiente: '0.00',
    moroso: '3750.00',
    porcentajeCobranza: 8.54,
  });
  assert.equal(datos.periodos.length, 10, 'de marzo a diciembre');
  assert.deepEqual(datos.periodos[0], {
    periodo: '2020-03',
    boletas: 2,
    emitido: '550.00',
    recaudado: '350.00',
    pendiente: '0.00',
    moroso: '200.00',
    porcentajeCobranza: 63.64,
  });
  assert.deepEqual(datos.filtros, { anioAcademico: null, grado: null, seccion: null });

  const futuro = await reporte('desde=2030-01-01&hasta=2030-12-31');
  assert.equal(futuro.totales.pendiente, '4000.00', 'lo que aún no vence es pendiente');
  assert.equal(futuro.totales.moroso, '0.00');
});

test('US-012: se filtra por grado, sección y rango de fechas', async () => {
  const porSeccion = await reporte(
    `desde=2020-01-01&hasta=2020-12-31&seccionId=${seccion2020B.id}`,
  );
  assert.equal(porSeccion.totales.emitido, '600.00');
  assert.equal(porSeccion.filtros.seccion, 'Segundo B');
  const porGrado = await reporte(`desde=2020-01-01&hasta=2020-12-31&gradoId=${primero.id}`);
  assert.equal(porGrado.totales.emitido, '3500.00');
  assert.equal(porGrado.filtros.grado, 'Primero');
  const unMes = await reporte('desde=2020-04-01&hasta=2020-04-30');
  assert.deepEqual(
    unMes.periodos.map((fila) => fila.periodo),
    ['2020-04'],
  );
  assert.equal(unMes.totales.emitido, '550.00');
});

test('US-012: las boletas anuladas no cuentan en el reporte', async () => {
  const [boleta] = await boletasDe(matriculaAlDia.id);
  await prisma.compromisoPago.update({ where: { id: boleta.id }, data: { estado: 'ANULADA' } });
  const datos = await reporte('desde=2030-01-01&hasta=2030-12-31');
  assert.equal(datos.totales.emitido, '3600.00');
  assert.equal(datos.totales.boletas, 9);
  await prisma.compromisoPago.update({ where: { id: boleta.id }, data: { estado: 'PENDIENTE' } });
});

// supertest no acumula cuerpos binarios por defecto: este parser los junta en un Buffer.
const comoBuffer = (res, cb) => {
  const partes = [];
  res.on('data', (parte) => partes.push(parte));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};
const descargar = (agente, ruta) => agente.get(`${base}${ruta}`).buffer(true).parse(comoBuffer);

test('US-012: el reporte se exporta a PDF', async () => {
  const respuesta = await descargar(
    admin,
    '/reportes/pagos?desde=2020-01-01&hasta=2020-12-31&formato=pdf',
  ).expect(200);
  assert.equal(respuesta.headers['content-type'], 'application/pdf');
  assert.match(
    respuesta.headers['content-disposition'],
    /reporte-pagos-2020-01-01-a-2020-12-31\.pdf/,
  );
  assert.equal(respuesta.body.subarray(0, 5).toString(), '%PDF-');
  assert.ok(respuesta.body.length > 1000);
});

test('US-012: el reporte se exporta a Excel', async () => {
  const respuesta = await descargar(
    admin,
    `/reportes/pagos?desde=2020-01-01&hasta=2020-12-31&seccionId=${seccion2020A.id}&formato=xlsx`,
  ).expect(200);
  assert.equal(
    respuesta.headers['content-type'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.match(respuesta.headers['content-disposition'], /\.xlsx"/);
  // Un .xlsx es un ZIP: empieza con la firma «PK».
  assert.equal(respuesta.body.subarray(0, 2).toString(), 'PK');
  assert.ok(respuesta.body.length > 1000);
});

test('US-012: rechaza rangos y filtros inválidos, y solo lo usa el administrador', async () => {
  const consultas = [
    'desde=2020-12-31&hasta=2020-01-01', // rango invertido
    'hasta=2020-12-31', // falta la fecha inicial
    'desde=2020-02-30&hasta=2020-12-31', // fecha inexistente
    'desde=2020-01-01&hasta=2024-01-01', // más de tres años
    'desde=2020-01-01&hasta=2020-12-31&formato=csv',
    'desde=2020-01-01&hasta=2020-12-31&estado=PAGADA', // campo no declarado
  ];
  for (const consulta of consultas)
    await admin.get(`${base}/reportes/pagos?${consulta}`).expect(400);
  await admin
    .get(`${base}/reportes/pagos?desde=2020-01-01&hasta=2020-12-31&seccionId=999999`)
    .expect(404);
  await apoderado.get(`${base}/reportes/pagos?desde=2020-01-01&hasta=2020-12-31`).expect(403);
  await request(app).get(`${base}/reportes/pagos?desde=2020-01-01&hasta=2020-12-31`).expect(401);
});

test('US-012: los montos se suman sin error de coma flotante', () => {
  const hoy = new Date('2025-01-01T00:00:00Z');
  const boletas = ['0.10', '0.20', '0.10'].map((monto) => ({
    periodo: '2025-02',
    monto,
    estado: 'PAGADA',
    fechaVencimiento: new Date('2025-02-10T00:00:00Z'),
  }));
  const { totales } = calcularReporte(boletas, hoy);
  assert.equal(totales.emitido, '0.40');
  assert.equal(totales.recaudado, '0.40');
  assert.equal(totales.porcentajeCobranza, 100);
  assert.deepEqual(calcularReporte([], hoy).totales.porcentajeCobranza, 0);
  assert.deepEqual(agruparMorosos([], hoy).resumen, { estudiantes: 0, boletas: 0, deuda: '0.00' });
});

// ------------------------------------------------------------------- US-013
const pagoConfirmadoDe = async (boletaId) =>
  prisma.pago.findFirst({ where: { compromisoPagoId: boletaId, estado: 'CONFIRMADO' } });

let boletaCorregida, pagoAnulado;

test('US-013: el administrador anula un pago con motivo y la boleta vuelve a cobrarse', async () => {
  [boletaCorregida] = await boletasDe(matriculaMorosa.id);
  pagoAnulado = await pagoConfirmadoDe(boletaCorregida.id);
  const motivo = 'El pago se aplicó a la boleta equivocada.';
  const respuesta = await admin
    .put(`${base}/pagos/${pagoAnulado.id}/anulacion`)
    .send({ motivo })
    .expect(200);
  assert.equal(respuesta.body.data.estado, 'ANULADO');
  assert.equal(respuesta.body.data.boleta.estado, 'MOROSA', 'vencida y otra vez sin pagar');

  // Nada se borra: el pago queda anulado con quién, cuándo y por qué.
  const pago = await prisma.pago.findUnique({ where: { id: pagoAnulado.id } });
  assert.equal(pago.estado, 'ANULADO');
  assert.equal(pago.anuladoPorId, cuentaAdmin.id);
  assert.equal(pago.motivoAnulacion, motivo);
  assert.ok(pago.anuladoEn);
  const boleta = await prisma.compromisoPago.findUnique({ where: { id: boletaCorregida.id } });
  assert.equal(boleta.estado, 'PENDIENTE');
  assert.equal(boleta.pagadaEn, null);
  const comprobante = await prisma.comprobante.findUnique({ where: { pagoId: pagoAnulado.id } });
  assert.ok(comprobante.anuladoEn, 'el comprobante se conserva marcado como anulado');
});

test('US-013: la anulación queda en la auditoría con valores anterior y nuevo y el motivo', async () => {
  const registro = await prisma.registroAuditoria.findFirst({
    where: { tipoEvento: 'PAGO_ANULADO', entidadId: pagoAnulado.id },
  });
  assert.ok(registro);
  assert.equal(registro.usuarioId, cuentaAdmin.id);
  assert.equal(registro.entidad, 'Pago');
  assert.equal(registro.detalle.valorAnterior.estadoPago, 'CONFIRMADO');
  assert.equal(registro.detalle.valorAnterior.estadoBoleta, 'PAGADA');
  assert.match(registro.detalle.valorAnterior.comprobante, /^B001-\d{8}$/);
  assert.equal(registro.detalle.valorNuevo.estadoPago, 'ANULADO');
  assert.equal(registro.detalle.motivo, 'El pago se aplicó a la boleta equivocada.');
  const consulta = await admin.get(`${base}/admin/auditoria?tipoEvento=PAGO_ANULADO`).expect(200);
  assert.equal(consulta.body.data.registros[0].entidadId, pagoAnulado.id);
});

test('US-013: un reenvío tardío de la pasarela no revive el pago anulado', async () => {
  const cuerpo = {
    referencia: pagoAnulado.referencia,
    idExterno: pagoAnulado.referenciaExterna,
    tipo: 'pago',
  };
  const respuesta = await notificar(cuerpo).expect(200);
  assert.equal(respuesta.body.data.aplicado, false);
  assert.equal(respuesta.body.data.motivo, 'ANULADO');
  const boleta = await prisma.compromisoPago.findUnique({ where: { id: boletaCorregida.id } });
  assert.equal(boleta.estado, 'PENDIENTE');
});

test('US-013: tras anular, la boleta no tiene comprobante y vuelve a la morosidad', async () => {
  const respuesta = await apoderado
    .get(`${base}/compromisos-pago/${boletaCorregida.id}/comprobante`)
    .expect(409);
  assert.equal(respuesta.body.error.code, 'BOLETA_NO_PAGADA');
  const { estudiantes } = await morosidad(`?seccionId=${seccion2020A.id}`);
  assert.equal(estudiantes[0].boletasMorosas, 10);
});

test('US-013: la boleta corregida se paga de nuevo y recibe un comprobante nuevo', async () => {
  const nuevo = await pagar(apoderado, boletaCorregida.id);
  const boleta = await prisma.compromisoPago.findUnique({
    where: { id: boletaCorregida.id },
    include: { comprobantes: { orderBy: { id: 'asc' } } },
  });
  assert.equal(boleta.estado, 'PAGADA');
  assert.equal(boleta.comprobantes.length, 2, 'se conserva el anulado y se emite uno nuevo');
  assert.ok(boleta.comprobantes[0].anuladoEn);
  assert.equal(boleta.comprobantes[1].anuladoEn, null);
  assert.equal(boleta.comprobantes[1].pagoId, nuevo.id);

  const listado = await apoderado.get(`${base}/compromisos-pago?estado=PAGADA`).expect(200);
  const fila = listado.body.data.boletas.find((item) => item.id === boletaCorregida.id);
  assert.equal(fila.comprobante, `B001-${String(boleta.comprobantes[1].id).padStart(8, '0')}`);
  assert.equal('pagoConfirmadoId' in fila, false, 'el apoderado no ve datos de anulación');

  const deAdmin = await admin.get(`${base}/compromisos-pago?estado=PAGADA&limite=100`).expect(200);
  const filaAdmin = deAdmin.body.data.boletas.find((item) => item.id === boletaCorregida.id);
  assert.equal(filaAdmin.pagoConfirmadoId, nuevo.id);
});

test('US-013: dos anulaciones simultáneas aplican una sola', async () => {
  const [, segunda] = await boletasDe(matriculaMorosa.id);
  const pago = await pagar(apoderado, segunda.id);
  const motivo = 'Pago duplicado registrado por error.';
  const respuestas = await Promise.all([
    admin.put(`${base}/pagos/${pago.id}/anulacion`).send({ motivo }),
    admin.put(`${base}/pagos/${pago.id}/anulacion`).send({ motivo }),
  ]);
  assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 409]);
  const auditoria = await prisma.registroAuditoria.count({
    where: { tipoEvento: 'PAGO_ANULADO', entidadId: pago.id },
  });
  assert.equal(auditoria, 1);
});

test('US-013: rechaza anular dos veces, pagos no confirmados y datos inválidos', async () => {
  const motivo = 'Motivo suficientemente largo.';
  const repetida = await admin
    .put(`${base}/pagos/${pagoAnulado.id}/anulacion`)
    .send({ motivo })
    .expect(409);
  assert.equal(repetida.body.error.code, 'PAGO_YA_ANULADO');

  const [, , tercera] = await boletasDe(matriculaMorosa.id);
  const { pagoId } = (
    await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: tercera.id }).expect(201)
  ).body.data;
  const enCurso = await admin.put(`${base}/pagos/${pagoId}/anulacion`).send({ motivo }).expect(409);
  assert.equal(enCurso.body.error.code, 'PAGO_NO_ANULABLE');
  await apoderado.delete(`${base}/pagos/${pagoId}`).expect(200);

  await admin
    .put(`${base}/pagos/${pagoAnulado.id}/anulacion`)
    .send({ motivo: 'corto' })
    .expect(400);
  await admin.put(`${base}/pagos/${pagoAnulado.id}/anulacion`).send({}).expect(400);
  await admin
    .put(`${base}/pagos/${pagoAnulado.id}/anulacion`)
    .send({ motivo, estado: 'PAGADA' })
    .expect(400);
  await admin.put(`${base}/pagos/999999/anulacion`).send({ motivo }).expect(404);
  await apoderado.put(`${base}/pagos/${pagoAnulado.id}/anulacion`).send({ motivo }).expect(403);
});

// ------------------------------------------------------------------- US-011
test('US-011: avisa al apoderado de las boletas que vencen en los próximos días', async () => {
  const boletas = await boletasDe(matriculaAlDia.id);
  await prisma.compromisoPago.update({
    where: { id: boletas[0].id },
    data: { fechaVencimiento: sumarDias(0) },
  });
  await prisma.compromisoPago.update({
    where: { id: boletas[1].id },
    data: { fechaVencimiento: sumarDias(2) },
  });
  await prisma.compromisoPago.update({
    where: { id: boletas[2].id },
    data: { fechaVencimiento: sumarDias(env.PAGOS_DIAS_AVISO + 3) },
  });
  const { diasAnticipacion, avisos } = (
    await apoderado.get(`${base}/avisos-vencimiento`).expect(200)
  ).body.data;
  assert.equal(diasAnticipacion, env.PAGOS_DIAS_AVISO);
  assert.deepEqual(
    avisos.map((aviso) => [aviso.boletaId, aviso.diasRestantes]),
    [
      [boletas[0].id, 0],
      [boletas[1].id, 2],
    ],
    'vence hoy y en dos días; la que vence más adelante todavía no se avisa',
  );
  assert.equal(avisos[0].estudiante.id, estudianteAlDia.id);
  assert.equal(avisos[0].monto, '400.00');
  assert.ok(
    avisos.every((aviso) => aviso.estudiante.id !== estudianteMoroso.id),
    'las boletas ya vencidas son morosas, no avisos',
  );
});

test('US-011: una boleta pagada o con pago en curso ya no se avisa', async () => {
  const [hoy, enDosDias] = await boletasDe(matriculaAlDia.id);
  await pagar(apoderado, hoy.id);
  await apoderado.post(`${base}/pagos`).send({ compromisoPagoId: enDosDias.id }).expect(201);
  const { avisos } = (await apoderado.get(`${base}/avisos-vencimiento`).expect(200)).body.data;
  assert.deepEqual(avisos, []);
});

test('US-011: cada apoderado solo recibe los avisos de sus estudiantes', async () => {
  const [boleta] = await boletasDe(matriculaAjena.id);
  await prisma.compromisoPago.update({
    where: { id: boleta.id },
    data: { fechaVencimiento: sumarDias(1) },
  });
  const propios = (await otroApoderado.get(`${base}/avisos-vencimiento`).expect(200)).body.data;
  assert.deepEqual(
    propios.avisos.map((aviso) => aviso.boletaId),
    [boleta.id],
  );
  const ajenos = (await apoderado.get(`${base}/avisos-vencimiento`).expect(200)).body.data;
  assert.ok(ajenos.avisos.every((aviso) => aviso.boletaId !== boleta.id));
});

test('US-011: sin estudiantes no hay avisos, y solo es para apoderados', async () => {
  const sinHijos = request.agent(app);
  await crearCuenta('apoderado-sin-hijos-cobranza@prueba.local', ['APODERADO'], sinHijos);
  const respuesta = await sinHijos.get(`${base}/avisos-vencimiento`).expect(200);
  assert.deepEqual(respuesta.body.data.avisos, []);
  await admin.get(`${base}/avisos-vencimiento`).expect(403);
  await request(app).get(`${base}/avisos-vencimiento`).expect(401);
});
