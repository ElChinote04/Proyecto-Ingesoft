// Copia de las reglas de frontend/src/utils/userValidation.js: backend y frontend se construyen por
// separado al desplegar. VAL-10 comprueba que las dos copias sigan iguales.
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
