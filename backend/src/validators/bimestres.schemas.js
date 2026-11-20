import { z } from 'zod';

// YYYY-MM-DD que además existe en el calendario: 2026-02-30 se rechaza.
export const fechaCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha válida YYYY-MM-DD.')
  .refine(
    (valor) => new Date(`${valor}T00:00:00.000Z`).toISOString().startsWith(valor),
    'La fecha no existe en el calendario.',
  );

export const fechasBimestreSchema = z
  .object({ fechaInicio: fechaCalendario, fechaFin: fechaCalendario })
  .strict();
