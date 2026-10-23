import { z } from 'zod';
import { planPagoSchema } from './pagos.schemas.js';
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
    claveInstalacion: z.string().min(1).max(200).optional(),
  })
  .strict();
export const studentSchema = z.object(person).strict();
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

const logro = z.enum(['AD', 'A', 'B', 'C']);
const calificacionCompetenciaInput = z
  .object({ competenciaId: id, nivelLogro: logro, conclusionDescriptiva: z.string().trim().max(500).optional() })
  .strict();

export const createCalificacionSchema = z
  .object({
    matriculaId: id,
    bimestreId: id,
    asignacionId: id,
    reglaId: id,
    conclusionDescriptiva: z.string().trim().max(500).optional(),
    competencias: z.array(calificacionCompetenciaInput).min(1, 'Registra al menos una competencia.'),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.competencias.map(({ competenciaId }) => competenciaId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', path: ['competencias'], message: 'No repitas competencias.' });
  });

export const updateCalificacionSchema = z
  .object({
    conclusionDescriptiva: z.string().trim().max(500).optional(),
    competencias: z.array(calificacionCompetenciaInput).min(1).optional(),
  })
  .strict()
  .refine((value) => value.conclusionDescriptiva !== undefined || value.competencias !== undefined, {
    message: 'Indica al menos un dato para actualizar.',
  });

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

const dateOnlyPlan = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida YYYY-MM-DD.');
const competencyIds = z.array(id).refine((values) => new Set(values).size === values.length, 'No repitas competencias.');
export const createPlanAcademicoSchema = z
  .object({
    bimestreId: id,
    asignacionId: id,
    titulo: text('el título del plan', 200),
    objetivo: text('el objetivo del plan', 1000),
    fechaFin: dateOnlyPlan.optional(),
    competenciaIds: competencyIds.optional().default([]),
  })
  .strict();
export const updatePlanAcademicoSchema = z
  .object({
    titulo: text('el título del plan', 200).optional(),
    objetivo: text('el objetivo del plan', 1000).optional(),
    competenciaIds: competencyIds.optional(),
  })
  .strict()
  .refine((value) => value.titulo !== undefined || value.objetivo !== undefined || value.competenciaIds !== undefined, {
    message: 'Indica al menos un dato para actualizar.',
  });

const evidenceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida YYYY-MM-DD.');
const evidenceFiles = z.array(z.string().trim().min(1)).min(1, 'Registra al menos un archivo.');
export const createEvidenciaPedagogicaSchema = z
  .object({
    docenteId: id,
    planId: id,
    fechaEntrega: evidenceDate.optional(),
    descripcionAvance: text('la descripción del avance', 2000),
    archivos: evidenceFiles,
  })
  .strict();
export const updateEvidenciaPedagogicaSchema = z
  .object({ fechaEntrega: evidenceDate.optional(), descripcionAvance: text('la descripción del avance', 2000).optional(), archivos: evidenceFiles.optional() })
  .strict()
  .refine((value) => value.fechaEntrega !== undefined || value.descripcionAvance !== undefined || value.archivos !== undefined, { message: 'Indica al menos un dato para actualizar.' });
export const reviewEvidenciaPedagogicaSchema = z
  .object({ estadoRevision: z.enum(['PENDIENTE_REVISION', 'OBSERVADA', 'VALIDADA']), observacionesRevision: z.string().trim().max(2000).optional() })
  .strict();

export const createCalificacionCompetenciaSchema = z
  .object({ calificacionId: id, competenciaId: id, nivelLogro: z.enum(['AD', 'A', 'B', 'C']), conclusionDescriptiva: z.string().trim().max(500).optional() })
  .strict();
export const updateCalificacionCompetenciaSchema = z
  .object({ nivelLogro: z.enum(['AD', 'A', 'B', 'C']), conclusionDescriptiva: z.string().trim().max(500).optional() })
  .strict();
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
