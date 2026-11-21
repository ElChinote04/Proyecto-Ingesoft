import { z } from 'zod';
import { normalizeUserField, userFieldRules, userRoles } from './usuario.reglas.js';
import { planPagoSchema } from './pagos.schemas.js';
import { motivoCorreccion } from './calificacion.schemas.js';
const id = z.number().int().positive().max(2147483647);
const text = (label, max = 100) => z.string().trim().min(1, `Ingresa ${label}.`).max(max);
const password = z
  .string()
  .min(10, 'Usa al menos 10 caracteres.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'La contraseña no puede superar 72 bytes.');
export const roleNames = userRoles;
const person = {
  numeroDocumento: text('el documento', 30).toUpperCase(),
  nombres: text('los nombres'),
  apellidos: text('los apellidos'),
};
const userField = (name) => {
  const rule = userFieldRules[name];
  return z
    .string()
    .transform((value) => normalizeUserField(name, value))
    .pipe(
      z
        .string()
        .max(rule.maxLength, `No superes ${rule.maxLength} caracteres en este campo.`)
        .regex(rule.pattern, rule.message),
    );
};
const userPerson = {
  numeroDocumento: userField('numeroDocumento'),
  nombres: userField('nombres'),
  apellidos: userField('apellidos'),
};
const account = {
  identificador: userField('identificador'),
  roles: z
    .array(z.enum(roleNames))
    .min(1, 'Selecciona al menos un rol.')
    .max(4)
    .refine((v) => new Set(v).size === v.length, 'No repitas roles.'),
  activo: z.boolean().default(true),
};
export const createUserSchema = z
  .object({ ...userPerson, ...account, contrasena: password })
  .strict();
export const editUserSchema = z
  .object({ ...account, activo: z.boolean(), contrasena: password.optional() })
  .strict();
export const setupSchema = z
  .object({
    ...person,
    identificador: text('el usuario o correo', 200).toLowerCase(),
    contrasena: password,
    claveInstalacion: z.string().min(1).max(200).optional(),
  })
  .strict();
export const studentSchema = z.object(userPerson).strict();
export const enrollmentSchema = z
  .object({ estudianteId: id, seccionId: id, planPago: planPagoSchema.optional() })
  .strict();
export const catalogSchemas = {
  anios: z
    .object({ codigo: z.string().regex(/^(19|20|21)\d{2}$/, 'Ingresa un año entre 1900 y 2199.') })
    .strict(),
  grados: z.object({ nombre: text('el grado', 50) }).strict(),
  secciones: z
    .object({ nombre: text('la sección', 30).toUpperCase(), gradoId: id, anioAcademicoId: id })
    .strict(),
  cursos: z
    .object({ codigo: text('el código', 30).toUpperCase(), nombre: text('el curso') })
    .strict(),
  aulas: z.object({ codigo: text('el aula', 30).toUpperCase() }).strict(),
};

export const createCursoSchema = z
  .object({
    codigo: text('el código del curso', 30).toUpperCase(),
    nombre: text('el nombre del curso', 150),
    descripcion: text('la descripción del curso', 500),
  })
  .strict();

export const updateCursoSchema = z
  .object({ descripcion: text('la descripción del curso', 500) })
  .strict();

export const createCompetenciaSchema = z
  .object({
    cursoId: id,
    codigo: text('el código de la competencia', 30).toUpperCase(),
    nombre: text('el nombre de la competencia', 150),
    descripcion: text('la descripción de la competencia', 500),
  })
  .strict();

export const updateCompetenciaSchema = z
  .object({ descripcion: text('la descripción de la competencia', 500) })
  .strict();

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida YYYY-MM-DD.');
export const createReglaConsolidacionSchema = z
  .object({
    gradoId: id,
    cursoId: id,
    nombre: text('el nombre de la regla', 150),
    version: z.number().int().positive(),
    metodo: text('el método de consolidación', 100),
    vigenteHasta: dateOnly.optional(),
  })
  .strict();
export const updateReglaConsolidacionSchema = z
  .object({ version: z.number().int().positive(), metodo: text('el método de consolidación', 100) })
  .strict();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa una hora válida HH:mm.');
export const blockSchema = z
  .object({
    cursoId: id,
    seccionId: id,
    docenteId: id,
    aulaId: id,
    diaSemana: z.number().int().min(1).max(5, 'Los horarios solo admiten lunes a viernes.'),
    horaInicio: time,
    horaFin: time,
  })
  .strict()
  .refine((v) => v.horaInicio < v.horaFin, {
    message: 'La hora final debe ser posterior a la inicial.',
    path: ['horaFin'],
  });
export const validarBloqueSchema = blockSchema.safeExtend({ bloqueId: id.optional() });
export const classSchema = z
  .object({
    bloqueId: id,
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v + 'T00:00:00Z');
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, 'La fecha no es válida.')
      .refine((v) => {
        const dia = new Date(v + 'T00:00:00Z').getUTCDay();
        return dia >= 1 && dia <= 5;
      }, 'Las sesiones de clase solo se programan de lunes a viernes.'),
  })
  .strict();
