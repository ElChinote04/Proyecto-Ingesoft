// Pruebas de la lógica de negocio del cronograma y de la decisión de
// confirmación. No tocan la base de datos ni la red: verifican las reglas que
// no deben depender de la infraestructura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aCentimos,
  construirCronograma,
  estadoVisible,
  formatearPeriodo,
  resolverConfirmacion,
  ultimoDiaDelMes,
} from '../src/domain/cronograma.js';

test('aCentimos no arrastra el error de coma flotante', () => {
  assert.equal(aCentimos('350.00'), 35000);
  assert.equal(aCentimos('350.75'), 35075);
  assert.equal(aCentimos('350.5'), 35050);
  assert.equal(aCentimos('350'), 35000);
  assert.equal(aCentimos('0.29'), 29);
  // 0.29 * 100 da 28.999999999999996 en JavaScript; aquí no.
  assert.notEqual(Math.floor(0.29 * 100), 29);
  assert.equal(aCentimos('1.005'), 101);
  assert.equal(aCentimos('1.004'), 100);
});

test('aCentimos rechaza lo que no es un número', () => {
  for (const valor of ['abc', '', '12.', '1,50', '--3'])
    assert.throws(() => aCentimos(valor), { code: 'MONTO_INVALIDO' });
});

test('formatearPeriodo y ultimoDiaDelMes', () => {
  assert.equal(formatearPeriodo(2026, 3), '2026-03');
  assert.equal(formatearPeriodo(2026, 11), '2026-11');
  assert.equal(ultimoDiaDelMes(2026, 2), 28);
  assert.equal(ultimoDiaDelMes(2024, 2), 29, 'año bisiesto');
  assert.equal(ultimoDiaDelMes(2026, 4), 30);
});

test('US-006: el cronograma emite una cuota por mes desde el mes de inicio', () => {
  const cuotas = construirCronograma({
    anio: 2026,
    mesInicio: 3,
    numeroCuotas: 10,
    diaVencimiento: 10,
    montoPension: '350.00',
  });
  assert.equal(cuotas.length, 10);
  assert.equal(cuotas[0].periodo, '2026-03');
  assert.equal(cuotas[9].periodo, '2026-12');
  assert.equal(cuotas[0].numeroCuota, 1);
  assert.equal(cuotas[0].concepto, 'Pensión 2026-03');
  assert.equal(cuotas[0].fechaVencimiento.toISOString().slice(0, 10), '2026-03-10');
  assert.equal(cuotas[9].fechaVencimiento.toISOString().slice(0, 10), '2026-12-10');
  assert.ok(cuotas.every((c) => c.monto === '350.00'));
});

test('US-006: el cronograma cruza el cambio de año cuando corresponde', () => {
  const cuotas = construirCronograma({
    anio: 2026,
    mesInicio: 11,
    numeroCuotas: 4,
    diaVencimiento: 15,
    montoPension: '200.00',
  });
  assert.deepEqual(
    cuotas.map((c) => c.periodo),
    ['2026-11', '2026-12', '2027-01', '2027-02'],
  );
});

test('US-006: el cronograma valida sus entradas', () => {
  const base = {
    anio: 2026,
    mesInicio: 3,
    numeroCuotas: 10,
    diaVencimiento: 10,
    montoPension: '350.00',
  };
  assert.throws(() => construirCronograma({ ...base, numeroCuotas: 0 }), {
    code: 'CUOTAS_INVALIDAS',
  });
  assert.throws(() => construirCronograma({ ...base, numeroCuotas: 13 }), {
    code: 'CUOTAS_INVALIDAS',
  });
  assert.throws(() => construirCronograma({ ...base, mesInicio: 13 }), { code: 'MES_INVALIDO' });
  assert.throws(() => construirCronograma({ ...base, diaVencimiento: 31 }), {
    code: 'DIA_INVALIDO',
  });
  assert.throws(() => construirCronograma({ ...base, montoPension: '0.00' }), {
    code: 'MONTO_FUERA_DE_RANGO',
  });
});

test('US-007A: la morosidad se deriva de la fecha, no de un estado guardado', () => {
  const hoy = new Date('2026-06-15T12:00:00Z');
  const vencida = { estado: 'PENDIENTE', fechaVencimiento: new Date('2026-06-10T00:00:00Z') };
  const alDia = { estado: 'PENDIENTE', fechaVencimiento: new Date('2026-07-10T00:00:00Z') };
  const venceHoy = { estado: 'PENDIENTE', fechaVencimiento: new Date('2026-06-15T00:00:00Z') };
  const pagada = { estado: 'PAGADA', fechaVencimiento: new Date('2026-01-10T00:00:00Z') };
  assert.equal(estadoVisible(vencida, hoy), 'MOROSA');
  assert.equal(estadoVisible(alDia, hoy), 'PENDIENTE');
  assert.equal(
    estadoVisible(venceHoy, hoy),
    'PENDIENTE',
    'el día de vencimiento todavía no es mora',
  );
  assert.equal(estadoVisible(pagada, hoy), 'PAGADA', 'una boleta pagada nunca es morosa');
});

test('QAS008: la confirmación es idempotente ante reenvíos de la pasarela', () => {
  const enProceso = { estado: 'PROCESANDO' };
  assert.equal(resolverConfirmacion(enProceso, 'PAGADO').accion, 'CONFIRMAR');
  // El mismo evento reenviado sobre un pago ya confirmado no vuelve a aplicarse.
  assert.deepEqual(resolverConfirmacion({ estado: 'CONFIRMADO' }, 'PAGADO'), {
    accion: 'IGNORAR',
    motivo: 'YA_CONFIRMADO',
  });
  assert.deepEqual(resolverConfirmacion(null, 'PAGADO'), {
    accion: 'IGNORAR',
    motivo: 'REFERENCIA_DESCONOCIDA',
  });
});

test('US-007B: un pago no confirmado no cambia el estado de la boleta', () => {
  const enProceso = { estado: 'PROCESANDO' };
  assert.equal(resolverConfirmacion(enProceso, 'PENDIENTE').accion, 'IGNORAR');
  assert.equal(resolverConfirmacion(enProceso, 'RECHAZADO').accion, 'RECHAZAR');
  assert.equal(resolverConfirmacion(enProceso, 'EXPIRADO').accion, 'CANCELAR');
  // Un pago ya rechazado que luego llega como pagado sí se confirma: la
  // pasarela es la fuente de verdad sobre el dinero.
  assert.equal(resolverConfirmacion({ estado: 'RECHAZADO' }, 'PAGADO').accion, 'CONFIRMAR');
  assert.equal(resolverConfirmacion({ estado: 'RECHAZADO' }, 'RECHAZADO').accion, 'IGNORAR');
});
