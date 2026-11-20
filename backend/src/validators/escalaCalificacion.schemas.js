import { z } from 'zod';

const minimo = (letra) =>
  z
    .number({ error: `Indica desde qué nota empieza ${letra}.` })
    .int(`La nota mínima de ${letra} debe ser un número entero.`)
    .min(1, `La nota mínima de ${letra} debe ser mayor que 0.`)
    .max(20, `La nota mínima de ${letra} no puede pasar de 20.`);

// El orden entre letras se valida en el dominio, que da el mensaje por campo.
export const escalaCalificacionSchema = z
  .object({ minimoAD: minimo('AD'), minimoA: minimo('A'), minimoB: minimo('B') })
  .strict();
