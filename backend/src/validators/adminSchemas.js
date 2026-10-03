import { z } from 'zod';
const id = z.number().int().positive().max(2147483647);
const text = (label, max = 100) => z.string().trim().min(1, `Ingresa ${label}.`).max(max);
const password = z
  .string()
  .min(10, 'Usa al menos 10 caracteres.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'La contraseña no puede superar 72 bytes.');
export const roleNames = ['ADMINISTRADOR', 'DOCENTE', 'ALUMNO', 'APODERADO'];
const person = {
  numeroDocumento: text('el documento', 30).toUpperCase(),
  nombres: text('los nombres'),
  apellidos: text('los apellidos'),
};
const account = {
  identificador: text('el usuario o correo', 200).toLowerCase(),
  roles: z
    .array(z.enum(roleNames))
    .min(1, 'Selecciona al menos un rol.')
    .max(4)
    .refine((v) => new Set(v).size === v.length, 'No repitas roles.'),
  activo: z.boolean().default(true),
};
export const createUserSchema = z.object({ ...person, ...account, contrasena: password }).strict();
export const editUserSchema = z
  .object({ ...account, activo: z.boolean(), contrasena: password.optional() })
  .strict();
export const setupSchema = z
  .object({
    ...person,
    identificador: account.identificador,
    contrasena: password,
    claveInstalacion: z.string().min(1).max(200),
  })
  .strict();
export const studentSchema = z.object(person).strict();
export const enrollmentSchema = z.object({ estudianteId: id, seccionId: id }).strict();
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
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa una hora válida HH:mm.');
export const blockSchema = z
  .object({
    cursoId: id,
    seccionId: id,
    docenteId: id,
    aulaId: id,
    diaSemana: z.number().int().min(1).max(7),
    horaInicio: time,
    horaFin: time,
  })
  .strict()
  .refine((v) => v.horaInicio < v.horaFin, {
    message: 'La hora final debe ser posterior a la inicial.',
    path: ['horaFin'],
  });
export const classSchema = z
  .object({
    bloqueId: id,
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v + 'T00:00:00Z');
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, 'La fecha no es válida.'),
  })
  .strict();
