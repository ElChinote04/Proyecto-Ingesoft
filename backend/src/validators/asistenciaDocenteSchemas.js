
import { z } from 'zod';

// Validar identificadores de PostgreSQL
const idSchema = z.coerce.number()
  .int()
  .positive()
  .max(2147483647);

// Validar una fecha real con formato YYYY-MM-DD
const fechaSchema = z.string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'La fecha debe tener el formato YYYY-MM-DD.'
  )
  .refine((fecha) => {
    const date = new Date(`${fecha}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === fecha
    );
  }, 'La fecha indicada no existe.');

// Validar los parámetros para registrar asistencia
export const asistenciaDocenteParams = z.object({
  docenteId: idSchema,
  fecha: fechaSchema,
}).strict();

// Validar el cuerpo de la solicitud
export const asistenciaDocenteBody = z.object({
  condicion: z.enum([
    'PRESENTE',
    'TARDANZA',
    'AUSENTE'
  ]),

  observacion: z.string()
    .trim()
    .max(300)
    .default(''),
}).strict();

// Validar el ID para consultar el historial
export const asistenciaDocenteHistorialParams = z.object({
  docenteId: idSchema,
}).strict();

// Validar filtros de reportes
export const asistenciaDocenteReporteQuery = z.object({
  fechaInicio: fechaSchema,
  fechaFin: fechaSchema,
  docenteId: idSchema.optional(),
}).strict().superRefine((datos, ctx) => {

  if (datos.fechaInicio > datos.fechaFin) {
    ctx.addIssue({
      code: 'custom',
      path: ['fechaFin'],
      message: 'La fecha final no puede ser anterior a la inicial.'
    });
    return;
  }

  const inicio = new Date(`${datos.fechaInicio}T00:00:00.000Z`);
  const fin = new Date(`${datos.fechaFin}T00:00:00.000Z`);

  const diferenciaDias =
    (fin.getTime() - inicio.getTime()) / 86400000;

  if (diferenciaDias > 365) {
    ctx.addIssue({
      code: 'custom',
      path: ['fechaFin'],
      message: 'El intervalo máximo es de 366 días inclusivos.'
    });
  }
});
