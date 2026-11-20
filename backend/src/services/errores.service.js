import * as repository from '../repositories/errores.repository.js';
import * as auditoriaRepository from '../repositories/auditoria.repository.js';

const SEVERIDAD_POR_NIVEL = { error: 'ERROR', warn: 'ADVERTENCIA' };
export const SEVERIDADES_ERROR = Object.values(SEVERIDAD_POR_NIVEL);

// Las fechas del filtro son días de Lima (UTC-5); "hasta" incluye el día completo.
const inicioDelDia = (fecha) => new Date(`${fecha}T00:00:00-05:00`);
const finDelDia = (fecha) => new Date(inicioDelDia(fecha).getTime() + 24 * 60 * 60 * 1000);

// Un error no controlado no guarda su mensaje original, que podría traer datos internos.
const describir = ({ message, code, errorType }) =>
  code === 'INTERNAL_ERROR' && errorType ? `${message} (${errorType})` : message;

// Solicitudes que dejaron un error o advertencia; la auditoría las usa para enlazar sus eventos.
export async function obtenerSolicitudesConError() {
  const registros = await repository.leerRegistros();
  return new Set(
    registros
      .filter((registro) => SEVERIDAD_POR_NIVEL[registro.level] && registro.requestId)
      .map((registro) => registro.requestId),
  );
}

export async function obtenerErrores(consulta) {
  const { pagina, limite, severidad, codigo, usuario, requestId, desde, hasta } = consulta;
  const errores = (await repository.leerRegistros()).filter(
    (registro) => SEVERIDAD_POR_NIVEL[registro.level],
  );
  const ids = [...new Set(errores.map((registro) => registro.userId).filter(Boolean))];
  const cuentas = await repository.obtenerCuentas(ids);
  const identificadores = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta.identificador]));
  const registros = errores
    .map((registro) => ({
      fechaHora: registro.timestamp,
      severidad: SEVERIDAD_POR_NIVEL[registro.level],
      modulo: registro.module ?? 'sistema',
      codigo: registro.code ?? 'SIN_CODIGO',
      descripcion: describir(registro),
      usuario: identificadores.get(registro.userId) ?? null,
      requestId: registro.requestId ?? null,
    }))
    .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  const filtrados = registros.filter(
    (registro) =>
      (!severidad || registro.severidad === severidad) &&
      (!codigo || registro.codigo === codigo) &&
      (!usuario || registro.usuario === usuario) &&
      (!requestId || registro.requestId === requestId) &&
      (!desde || new Date(registro.fechaHora) >= inicioDelDia(desde)) &&
      (!hasta || new Date(registro.fechaHora) < finDelDia(hasta)),
  );
  const visibles = filtrados.slice((pagina - 1) * limite, pagina * limite);
  // El enlace "Ver en auditoría" solo se ofrece si esa solicitud dejó algún evento.
  const solicitudes = [...new Set(visibles.map((registro) => registro.requestId).filter(Boolean))];
  const auditadas = new Set(
    (await auditoriaRepository.buscarSolicitudesAuditadas(solicitudes)).map(
      (fila) => fila.requestId,
    ),
  );
  return {
    total: filtrados.length,
    pagina,
    limite,
    codigos: [...new Set(registros.map((registro) => registro.codigo))].sort(),
    registros: visibles.map((registro) => ({
      ...registro,
      enAuditoria: auditadas.has(registro.requestId),
    })),
  };
}
