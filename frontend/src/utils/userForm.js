import { normalizeUserField, validateUserForm } from './userValidation.js';

export function userFormBody(form, editing) {
  validateUserForm(form, { editing });
  const body = {
    identificador: normalizeUserField('identificador', form.get('identificador')),
    roles: form.getAll('roles'),
    activo: form.has('activo'),
  };
  const password = form.get('contrasena');
  if (password) body.contrasena = password;
  if (!editing) {
    for (const key of ['numeroDocumento', 'nombres', 'apellidos'])
      body[key] = normalizeUserField(key, form.get(key));
  }
  return body;
}
