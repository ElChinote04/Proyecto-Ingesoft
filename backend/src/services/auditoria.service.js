import * as repository from '../repositories/auditoria.repository.js';

export const RESULTADOS_AUDITORIA = ['EXITO', 'DENEGADO', 'FALLO'];

// Transacciones críticas de notas y pagos (US-003).
export const EVENTOS_CRITICOS = [
  'NOTA_REGISTRADA',
  'NOTA_MODIFICADA',
  'NOTA_PUBLICADA',
  'COMPROMISO_PAGO_EMITIDO',
  'COMPROMISO_PAGO_MODIFICADO',
  'PAGO_INICIADO',
  'PAGO_CONFIRMADO',
  'PAGO_NO_COMPLETADO',
  'PAGO_ANULADO',
];

// Cambian un valor que ya existía: deben guardar el valor anterior, el nuevo y el motivo.
const EVENTOS_CON_MOTIVO = ['NOTA_MODIFICADA', 'COMPROMISO_PAGO_MODIFICADO', 'PAGO_ANULADO'];

/**
 * Registra un cambio de nota o de pago. Se llama dentro de la transacción de la operación,
 * pasando su "db", para que la operación y su auditoría se guarden juntas.
 */
export function registrarTransaccionCritica(db, datos) {
  const { actorId = null, evento, entidad, entidadId, anterior = null, nuevo = null } = datos;
  if (!EVENTOS_CRITICOS.includes(evento))
    throw new Error(`Auditoría: el evento ${evento} no está en EVENTOS_CRITICOS.`);
  if (EVENTOS_CON_MOTIVO.includes(evento) && (!anterior || !nuevo || !datos.motivo?.trim()))
    throw new Error(`Auditoría: ${evento} exige "anterior", "nuevo" y "motivo".`);
  // JSON.stringify convierte Decimal y Date a texto y omite los campos no enviados.
  const detalle = JSON.parse(
    JSON.stringify({ anterior, nuevo, motivo: datos.motivo?.trim(), contexto: datos.contexto }),
  );
  return repository.registrarEvento(
    {
      usuarioId: actorId,
      tipoEvento: evento,
      entidad,
      entidadId,
      resultado: datos.resultado ?? 'EXITO',
      requestId: datos.requestId ?? null,
      detalle,
    },
    db,
  );
}

// Las fechas del filtro son días de Lima (UTC-5); "hasta" incluye el día completo.
const inicioDelDia = (fecha) => new Date(`${fecha}T00:00:00-05:00`);
const finDelDia = (fecha) => new Date(inicioDelDia(fecha).getTime() + 24 * 60 * 60 * 1000);

// Registros antiguos de asistencia tienen un campo "version" que ya no se muestra.
function sinVersion({ version, ...detalle }) {
  return detalle;
}

export async function obtenerEventos(consulta) {
  const { pagina, limite, desde, hasta, ...filtros } = consulta;
  const where = {
    ...filtros,
    fechaHora: { gte: desde && inicioDelDia(desde), lt: hasta && finDelDia(hasta) },
  };
  const [{ total, registros }, tiposEvento] = await Promise.all([
    repository.buscarEventos(where, pagina, limite),
    repository.obtenerTiposEvento(),
  ]);
  return {
    total,
    pagina,
    limite,
    tiposEvento,
    registros: registros.map((evento) => ({
      id: evento.id,
      fechaHora: evento.fechaHora,
      usuario: evento.usuario?.identificador ?? null,
      tipoEvento: evento.tipoEvento,
      entidad: evento.entidad,
      entidadId: evento.entidadId,
      resultado: evento.resultado,
      requestId: evento.requestId,
      detalle:
        evento.tipoEvento === 'ASISTENCIA_GUARDADA' ? sinVersion(evento.detalle) : evento.detalle,
    })),
  };
}
