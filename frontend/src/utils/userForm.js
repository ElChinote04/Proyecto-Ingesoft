export function userFormBody(form, editing) {
  const body = {
    identificador: form.get('identificador'),
    roles: form.getAll('roles'),
    activo: form.has('activo'),
  };
  const password = form.get('contrasena');
  if (password) body.contrasena = password;
  if (!editing) {
    for (const key of ['numeroDocumento', 'nombres', 'apellidos']) body[key] = form.get(key);
  }
  return body;
}
