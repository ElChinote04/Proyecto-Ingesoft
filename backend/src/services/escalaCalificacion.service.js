import * as repository from '../repositories/escalaCalificacion.repository.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import { letraDePromedio, validarEscala } from '../domain/notaVigesimal.js';
import { AppError } from '../errors/AppError.js';

const presentar = ({ version, minimoAD, minimoA, minimoB, vigenteDesde }) => ({
  version,
  minimoAD,
  minimoA,
  minimoB,
  vigenteDesde,
});

const valores = ({ minimoAD, minimoA, minimoB }) => ({ minimoAD, minimoA, minimoB });

async function exigirVigente(db) {
  const escala = await repository.findEscalaVigente(db);
  // La migración crea la escala inicial y el cambio siempre deja una vigente.
  if (!escala) throw new Error('No hay una escala de calificación vigente.');
  return escala;
}

/**
 * La escala con la que se calcula una letra. Se llama dentro de la transacción que guarda la
 * letra: el candado compartido impide que la escala cambie antes de que termine.
 */
export async function escalaParaCalcular(db) {
  await repository.bloquearEscalaCompartida(db);
  return exigirVigente(db);
}

export async function obtenerEscala() {
  return presentar(await exigirVigente());
}

// Recalcula desde el promedio guardado: no hace falta volver a leer las evaluaciones.
async function recalcularLetras(escala, actor, db) {
  const cambios = new Map();
  for (const { id, promedio, nivelLogro } of await repository.listLogrosSinPublicar(db)) {
    const letra = letraDePromedio(promedio, escala);
    if (letra !== nivelLogro) cambios.set(letra, [...(cambios.get(letra) ?? []), id]);
  }
  let total = 0;
  for (const [letra, ids] of cambios) {
    await repository.updateLetras(ids, letra, actor.id, db);
    total += ids.length;
  }
  return total;
}

export async function modificarEscala(input, actor, requestId) {
  const errores = validarEscala(input);
  if (errores.length)
    throw new AppError(400, 'INVALID_SCALE', 'La escala de calificación no es válida.', errores);
  return repository.transaction(async (db) => {
    await repository.bloquearEscalaExclusiva(db);
    await repository.bloquearSeccionesCompartido(db);
    const actual = await exigirVigente(db);
    const sinCambios = Object.entries(valores(input)).every(
      ([campo, valor]) => actual[campo] === valor,
    );
    if (sinCambios) return { ...presentar(actual), letrasRecalculadas: 0 };
    await repository.cerrarEscala(actual.id, db);
    const nueva = await repository.createEscala(
      { version: actual.version + 1, ...valores(input), creadoPorId: actor.id },
      db,
    );
    const letrasRecalculadas = await recalcularLetras(nueva, actor, db);
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'ESCALA_CALIFICACION_MODIFICADA',
      entidad: 'EscalaCalificacion',
      entidadId: nueva.id,
      anterior: { version: actual.version, ...valores(actual) },
      nuevo: { version: nueva.version, ...valores(nueva) },
      contexto: { letrasRecalculadas },
      requestId,
    });
    return { ...presentar(nueva), letrasRecalculadas };
  });
}
