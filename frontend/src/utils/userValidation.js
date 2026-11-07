// Copia de las reglas de backend/src/validators/usuario.reglas.js: backend y frontend se construyen
// por separado al desplegar. VAL-10 comprueba que las dos copias sigan iguales.
export const userFieldRules = {
  numeroDocumento: {
    pattern: /^[0-9]{8}$/u,
    maxLength: 8,
    message: 'El DNI debe contener exactamente 8 dígitos numéricos.',
  },
  nombres: {
    pattern: /^\p{L}+(?: +\p{L}+)*$/u,
    maxLength: 100,
    message:
      'Los nombres deben tener como máximo 100 caracteres: solo letras y espacios, sin números ni signos como _.',
  },
  apellidos: {
    pattern: /^\p{L}+(?: +\p{L}+)*$/u,
    maxLength: 100,
    message:
      'Los apellidos deben tener como máximo 100 caracteres: solo letras y espacios, sin números ni signos como _.',
  },
  identificador: {
    pattern:
      /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u,
    maxLength: 200,
    message:
      'Ingresa un correo válido con una sola @ y un dominio, por ejemplo nombre@colegio.edu.pe.',
  },
};

export const userRoles = ['ADMINISTRADOR', 'DOCENTE', 'ALUMNO', 'APODERADO'];

export function normalizeUserField(name, value) {
  const normalized = value.trim().normalize('NFC');
  return name === 'identificador' ? normalized.toLowerCase() : normalized;
}

export function validateUserForm(form, { editing = false } = {}) {
  const details = [];
  for (const [name, rule] of Object.entries(userFieldRules)) {
    if (editing && name !== 'identificador') continue;
    const value = form.get(name);
    if (
      typeof value !== 'string' ||
      normalizeUserField(name, value).length > rule.maxLength ||
      !rule.pattern.test(normalizeUserField(name, value))
    )
      details.push({ campo: name, mensaje: rule.message });
  }
  const roles = form.getAll('roles');
  if (!roles.length) details.push({ campo: 'roles', mensaje: 'Selecciona al menos un rol.' });
  else if (new Set(roles).size !== roles.length || roles.some((role) => !userRoles.includes(role)))
    details.push({ campo: 'roles', mensaje: 'Selecciona roles válidos sin repetirlos.' });
  const password = form.get('contrasena');
  if (!editing || password) {
    if (typeof password !== 'string' || password.length < 10)
      details.push({ campo: 'contrasena', mensaje: 'Usa al menos 10 caracteres.' });
    else if (new TextEncoder().encode(password).length > 72)
      details.push({ campo: 'contrasena', mensaje: 'La contraseña no puede superar 72 bytes.' });
  }
  if (details.length) {
    const error = new Error('Revisa los datos del formulario.');
    error.details = details;
    throw error;
  }
}
