import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScheduleMatrix } from '../../frontend/src/utils/scheduleMatrix.js';

const bloque = (id, horaInicio, horaFin, diaSemana = 1) => ({ id, horaInicio, horaFin, diaSemana });

test('incluye los finales y las horas intermedias de un bloque de 08:00 a 09:30', () => {
  const matriz = buildScheduleMatrix([bloque(1, '08:00', '09:30')]);
  assert.deepEqual(matriz.horas, ['08:00', '09:00', '09:30']);
  assert.equal(matriz.alturas.length, 2);
  assert.ok(matriz.alturas.every((alto) => alto > 0));
});

test('conserva todos los límites cuando los bloques comienzan a minutos distintos', () => {
  const matriz = buildScheduleMatrix([bloque(1, '08:15', '09:30'), bloque(2, '08:45', '10:10', 2)]);
  assert.deepEqual(matriz.horas, ['08:15', '08:45', '09:00', '09:30', '10:00', '10:10']);
});

test('las clases simultáneas de distintos recursos no se ocultan ni se superponen', () => {
  const matriz = buildScheduleMatrix([
    bloque(1, '08:00', '09:30'),
    bloque(2, '09:00', '10:00'),
    bloque(3, '09:30', '10:00'),
  ]);
  assert.equal(matriz.dias[0].length, 2);
  assert.deepEqual(
    matriz.dias[0].map((columna) => columna.map((b) => b.id)),
    [[1, 3], [2]],
  );
});

test('los bloques contiguos comparten columna y los días se mantienen separados', () => {
  const matriz = buildScheduleMatrix([
    bloque(1, '08:00', '09:00'),
    bloque(2, '09:00', '10:00'),
    bloque(3, '08:00', '10:00', 5),
  ]);
  assert.equal(matriz.dias[0].length, 1);
  assert.deepEqual(
    matriz.dias[4][0].map((b) => b.id),
    [3],
  );
});

test('una matriz vacía mantiene los cinco días sin generar filas inválidas', () => {
  const matriz = buildScheduleMatrix([]);
  assert.deepEqual(matriz.horas, []);
  assert.deepEqual(matriz.alturas, []);
  assert.equal(matriz.dias.length, 5);
});

test('los bloques antiguos de fin de semana no agregan columnas ni horas a la matriz', () => {
  const finDeSemana = [bloque(2, '06:00', '07:00', 6), bloque(3, '22:00', '23:00', 7)];
  const matriz = buildScheduleMatrix([bloque(1, '08:00', '09:00'), ...finDeSemana]);
  assert.deepEqual(matriz.horas, ['08:00', '09:00']);
  assert.equal(matriz.dias.length, 5);
  assert.deepEqual(matriz.dias.flat(2).map((b) => b.id), [1]);
  const vacia = buildScheduleMatrix(finDeSemana);
  assert.deepEqual(vacia.horas, []);
  assert.deepEqual(vacia.alturas, []);
  assert.equal(vacia.dias.length, 5);
});

test('las clases breves mantienen espacio para leer su información', () => {
  const matriz = buildScheduleMatrix([bloque(1, '09:37', '09:38')]);
  assert.ok(matriz.alturas[0] >= 148);
});
