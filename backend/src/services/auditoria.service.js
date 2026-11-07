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

// Recorre todo el detalle porque cada módulo anida sus datos de forma distinta.
function recolectarIds(valor, ids) {
  if (!valor || typeof valor !== 'object') return;
  for (const [campo, dato] of Object.entries(valor)) {
    if (Object.hasOwn(ids, campo) && Number.isInteger(dato)) ids[campo].add(dato);
    else recolectarIds(dato, ids);
  }
}

const claveEntidad = (entidad, id) => `${entidad}#${id}`;

async function obtenerDatosDeNotas(registros) {
  const idsDe = (entidad) =>
    registros.filter((evento) => evento.entidad === entidad).map((evento) => evento.entidadId);
  const filas = await repository.obtenerDatosDeNotas(
    idsDe('Calificacion'),
    idsDe('CalificacionCompetencia'),
  );
  const datos = new Map();
  for (const { calificacionId, detalleIds, ...nota } of filas) {
    datos.set(claveEntidad('Calificacion', calificacionId), nota);
    for (const id of detalleIds) datos.set(claveEntidad('CalificacionCompetencia', id), nota);
  }
  return datos;
}

const GUARDADO_DOCENTE = 'CALIFICACION_GUARDADA';

// El guardado del docente no registra la nota anterior: se toma del guardado previo de la misma
// calificación y competencia. Así también se ven bien los registros que ya existen.
async function obtenerNotasAnteriores(registros) {
  const pendientes = registros.filter(
    (evento) => evento.tipoEvento === GUARDADO_DOCENTE && !evento.detalle?.valorAnterior,
  );
  const guardados = await repository.buscarGuardadosDeNotas(
    GUARDADO_DOCENTE,
    pendientes.map((evento) => evento.entidadId),
  );
  const ultimas = new Map();
  const anteriores = new Map();
  for (const { id, entidadId, detalle } of guardados) {
    const clave = `${entidadId}-${detalle.valorNuevo?.competenciaId}`;
    if (ultimas.has(clave)) anteriores.set(id, ultimas.get(clave));
    ultimas.set(clave, detalle.valorNuevo);
  }
  return anteriores;
}

export async function obtenerEventos(consulta) {
  const { pagina, limite, desde, hasta, ...filtros } = consulta;
  const where = {
    ...filtros,
    // El módulo de notas registra sus éxitos como 'EXITOSO'; se consultan junto con 'EXITO'.
    ...(filtros.resultado === 'EXITO' && { resultado: { in: ['EXITO', 'EXITOSO'] } }),
    fechaHora: { gte: desde && inicioDelDia(desde), lt: hasta && finDelDia(hasta) },
  };
  const [{ total, registros }, tiposEvento] = await Promise.all([
    repository.buscarEventos(where, pagina, limite),
    repository.obtenerTiposEvento(),
  ]);
  const ids = { apoderadoId: new Set(), estudianteId: new Set(), competenciaId: new Set() };
  recolectarIds(
    registros.map((evento) => evento.detalle),
    ids,
  );
  const [nombres, datosDeNotas, notasAnteriores] = await Promise.all([
    repository.obtenerNombres(ids),
    obtenerDatosDeNotas(registros),
    obtenerNotasAnteriores(registros),
  ]);
  return {
    total,
    pagina,
    limite,
    tiposEvento,
    nombres,
    registros: registros.map((evento) => {
      const detalle =
        evento.tipoEvento === 'ASISTENCIA_GUARDADA' ? sinVersion(evento.detalle) : evento.detalle;
      return {
        id: evento.id,
        fechaHora: evento.fechaHora,
        usuario: evento.usuario?.identificador ?? null,
        tipoEvento: evento.tipoEvento,
        entidad: evento.entidad,
        entidadId: evento.entidadId,
        resultado: evento.resultado,
        requestId: evento.requestId,
        nota: datosDeNotas.get(claveEntidad(evento.entidad, evento.entidadId)) ?? null,
        detalle: notasAnteriores.has(evento.id)
          ? { ...detalle, valorAnterior: notasAnteriores.get(evento.id) }
          : detalle,
      };
    }),
  };
}
