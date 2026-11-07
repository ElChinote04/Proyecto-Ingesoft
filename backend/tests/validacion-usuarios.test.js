import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUserSchema, editUserSchema, studentSchema } from '../src/validators/adminSchemas.js';
import { userFieldRules as reglasBackend } from '../src/validators/usuario.reglas.js';
import { userFormBody } from '../../frontend/src/utils/userForm.js';
import { userFieldRules as reglasFrontend } from '../../frontend/src/utils/userValidation.js';

const valido = {
  numeroDocumento: '00123456',
  nombres: 'María Belén',
  apellidos: 'Muñoz Quiñones',
  identificador: 'maria@colegio.edu.pe',
  contrasena: 'TemporalSegura123!',
  roles: ['DOCENTE', 'APODERADO'],
  activo: true,
};

function formulario(datos) {
  const form = new FormData();
  for (const [campo, valor] of Object.entries(datos)) {
    if (Array.isArray(valor)) valor.forEach((item) => form.append(campo, item));
    else if (campo === 'activo') {
      if (valor) form.append(campo, 'on');
    } else form.append(campo, String(valor));
  }
  return form;
}

test('VAL-01 alta multirrol admite letras, tildes, ñ y espacios y conserva ceros iniciales del DNI', () => {
  assert.deepEqual(createUserSchema.parse(valido), valido);
  assert.deepEqual(userFormBody(formulario(valido), false), valido);
});

test('VAL-02 formulario y servidor normalizan espacios exteriores y correo de igual forma', () => {
  const datos = {
    ...valido,
    numeroDocumento: ' 00123456 ',
    nombres: ' María Belén ',
    identificador: ' MARIA@COLEGIO.EDU.PE ',
  };
  assert.deepEqual(createUserSchema.parse(datos), valido);
  assert.deepEqual(userFormBody(formulario(datos), false), valido);
});

const invalidos = {
  identificador: [
    '',
    'mariacolegio.edu.pe',
    'maria@@colegio.edu.pe',
    '@colegio.edu.pe',
    'maria@',
    'maria@colegio',
    'maria @colegio.edu.pe',
    'maria@.edu.pe',
    'maria..belen@colegio.edu.pe',
    'maria@-colegio.edu.pe',
  ],
  numeroDocumento: [
    '',
    '1234567',
    '123456789',
    '1234a678',
    '1234-678',
    '1234 678',
    '12345678.0',
    '+12345678',
    '１２３４５６７８',
    '1'.repeat(31),
  ],
  nombres: [
    '',
    '   ',
    'Maria3',
    'Belen.',
    'Maria, Ana',
    'Ana\tMaria',
    'María@',
    'María-José',
    'María_José',
    '<script>',
    'Ana🙂',
    'A'.repeat(101),
  ],
  apellidos: [
    '',
    'Munoz2',
    'Munoz!',
    "O'Connor",
    'Quinones#',
    'Perez.',
    'Perez, Lopez',
    'A'.repeat(101),
  ],
};
for (const [campo, valores] of Object.entries(invalidos)) {
  test(`VAL-03 ${campo} rechaza formatos inválidos en formulario y servidor`, () => {
    for (const valor of valores) {
      const datos = { ...valido, [campo]: valor };
      const result = createUserSchema.safeParse(datos);
      assert.equal(result.success, false, `${campo}: ${JSON.stringify(valor)}`);
      assert.ok(result.error.issues.some((issue) => issue.path[0] === campo));
      assert.throws(
        () => userFormBody(formulario(datos), false),
        (error) => error.details.some((detalle) => detalle.campo === campo),
      );
    }
  });
}

test('VAL-04 DNI acepta exactamente ocho dígitos y rechaza longitudes distintas', () => {
  for (const numeroDocumento of ['00000000', '12345678']) {
    const datos = { ...valido, numeroDocumento };
    assert.ok(createUserSchema.safeParse(datos).success);
    assert.equal(userFormBody(formulario(datos), false).numeroDocumento, numeroDocumento);
  }
  for (const numeroDocumento of ['1234567', '123456789', '1'.repeat(30)]) {
    assert.equal(createUserSchema.safeParse({ ...valido, numeroDocumento }).success, false);
    assert.throws(() => userFormBody(formulario({ ...valido, numeroDocumento }), false));
  }
});

test('VAL-04B nombres y apellidos aceptan cien caracteres y rechazan ciento uno', () => {
  for (const campo of ['nombres', 'apellidos']) {
    const datos = { ...valido, [campo]: 'A'.repeat(100) };
    assert.ok(createUserSchema.safeParse(datos).success);
    assert.equal(userFormBody(formulario(datos), false)[campo].length, 100);
    assert.equal(createUserSchema.safeParse({ ...datos, [campo]: 'A'.repeat(101) }).success, false);
    assert.throws(() => userFormBody(formulario({ ...datos, [campo]: 'A'.repeat(101) }), false));
  }
});

test('VAL-05 no admite roles vacíos, repetidos ni ajenos al catálogo', () => {
  for (const roles of [[], ['DOCENTE', 'DOCENTE'], ['SOPORTE'], ['ADMINISTRADOR', 'x']]) {
    const datos = { ...valido, roles };
    assert.equal(createUserSchema.safeParse(datos).success, false);
    assert.throws(() => userFormBody(formulario(datos), false));
  }
});

test('VAL-06 la contraseña respeta mínimo y límite real de bytes UTF-8', () => {
  for (const contrasena of ['', 'corta', 'á'.repeat(37)]) {
    const datos = { ...valido, contrasena };
    assert.equal(createUserSchema.safeParse(datos).success, false);
    assert.throws(() => userFormBody(formulario(datos), false));
  }
  assert.ok(createUserSchema.safeParse({ ...valido, contrasena: 'á'.repeat(36) }).success);
});

test('VAL-07 edición exige correo y rol y conserva contraseña si se omite', () => {
  const datos = { identificador: valido.identificador, roles: ['ALUMNO'], activo: true };
  assert.deepEqual(editUserSchema.parse(datos), datos);
  assert.deepEqual(userFormBody(formulario(datos), true), datos);
  assert.equal(editUserSchema.safeParse({ ...datos, identificador: 'sin-arroba' }).success, false);
  assert.throws(() => userFormBody(formulario({ ...datos, identificador: 'sin-arroba' }), true));
});

test('VAL-08 registrar alumno aplica las mismas reglas a documento, nombres y apellidos', () => {
  const alumno = { numeroDocumento: '00123456', nombres: 'José', apellidos: 'Núñez Peña' };
  assert.deepEqual(studentSchema.parse(alumno), alumno);
  for (const invalido of [
    { numeroDocumento: '1234_678' },
    { numeroDocumento: 'EST-01' },
    { nombres: 'Jose_Luis' },
    { nombres: 'Jose3' },
    { apellidos: 'Nunez_Pena' },
  ])
    assert.equal(studentSchema.safeParse({ ...alumno, ...invalido }).success, false);
});

test('VAL-09 el servidor rechaza campos extra y DNI numérico para conservar ceros iniciales', () => {
  assert.equal(
    createUserSchema.safeParse({ ...valido, hashContrasena: 'inyectado' }).success,
    false,
  );
  assert.equal(createUserSchema.safeParse({ ...valido, numeroDocumento: 12345678 }).success, false);
});

test('VAL-10 las reglas del backend y del frontend siguen siendo iguales', () => {
  const comoTexto = (reglas) =>
    Object.entries(reglas).map(([campo, { pattern, maxLength, message }]) => [
      campo,
      pattern.source,
      maxLength,
      message,
    ]);
  assert.deepEqual(comoTexto(reglasBackend), comoTexto(reglasFrontend));
});
