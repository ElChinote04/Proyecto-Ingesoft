import * as repository from '../repositories/pagos.repository.js';
import { estadoVisible, inicioDelDia } from '../domain/cronograma.js';
import {
  agruparMorosos,
  calcularReporte,
  diasEntre,
  fechaIso,
  sumarDias,
} from '../domain/cobranza.js';
import { generarReportePdf, generarReporteXlsx } from '../domain/reportePagos.js';
import { AppError } from '../errors/AppError.js';
import { env } from '../config/env.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const fechaUtc = (iso) => new Date(`${iso}T00:00:00Z`);

// ------------------------------------------------------------------ US-008
/**
 * Estudiantes con boletas morosas, agrupados y con su deuda total. La
 * morosidad se calcula al consultar, con el mismo corte que el historial.
 */
export async function obtenerMorosidad(filtros) {
  const hoy = inicioDelDia();
  const boletas = await repository.listarBoletasMorosas(filtros, hoy);
  return { fechaCorte: fechaIso(hoy), ...agruparMorosos(boletas, hoy) };
}

// ------------------------------------------------------------------ US-012
/** Nombres legibles de los filtros, para la pantalla y los archivos exportados. */
async function describirFiltros({ anioAcademicoId, gradoId, seccionId }) {
  const [anio, grado, seccion] = await Promise.all([
    anioAcademicoId ? repository.buscarAnio(anioAcademicoId) : null,
    gradoId ? repository.buscarGrado(gradoId) : null,
    seccionId ? repository.buscarSeccion(seccionId) : null,
  ]);
  if (anioAcademicoId && !anio) fail(404, 'REFERENCE_NOT_FOUND', 'El año académico no existe.');
  if (gradoId && !grado) fail(404, 'REFERENCE_NOT_FOUND', 'El grado no existe.');
  if (seccionId && !seccion) fail(404, 'REFERENCE_NOT_FOUND', 'La sección no existe.');
  return {
    anioAcademico: anio?.codigo ?? null,
    grado: grado?.nombre ?? null,
    seccion: seccion ? `${seccion.grado.nombre} ${seccion.nombre}` : null,
  };
}

export async function obtenerReporte({ desde, hasta, ...filtros }) {
  const [nombres, boletas] = await Promise.all([
    describirFiltros(filtros),
    repository.listarBoletasDelPeriodo(filtros, fechaUtc(desde), fechaUtc(hasta)),
  ]);
  return { desde, hasta, filtros: nombres, ...calcularReporte(boletas, inicioDelDia()) };
}

const FORMATOS = {
  pdf: { generar: generarReportePdf, tipo: 'application/pdf' },
  xlsx: {
    generar: generarReporteXlsx,
    tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

/** El mismo reporte, como archivo para descargar. */
export async function exportarReporte(consulta, formato) {
  const reporte = await obtenerReporte(consulta);
  const { generar, tipo } = FORMATOS[formato];
  return {
    archivo: await generar(reporte),
    tipo,
    nombreArchivo: `reporte-pagos-${reporte.desde}-a-${reporte.hasta}.${formato}`,
  };
}

// ------------------------------------------------------------------ US-011
/**
 * Boletas de los estudiantes a cargo del apoderado que vencen dentro de los
 * próximos PAGOS_DIAS_AVISO días (incluido hoy). Se calcula al consultar, así
 * que no depende de un proceso programado ni de enviar correos.
 */
export async function obtenerAvisos(actor) {
  const apoderado = await repository.buscarApoderadoDeUsuario(actor.id);
  const estudianteIds = apoderado?.estudiantes.map((vinculo) => vinculo.estudianteId) ?? [];
  const hoy = inicioDelDia();
  const respuesta = { diasAnticipacion: env.PAGOS_DIAS_AVISO, avisos: [] };
  if (!estudianteIds.length) return respuesta;
  const boletas = await repository.listarBoletasPorVencer(
    estudianteIds,
    hoy,
    sumarDias(hoy, env.PAGOS_DIAS_AVISO),
  );
  respuesta.avisos = boletas
    // Un pago en curso ya está en manos de la pasarela: no se insiste.
    .filter((boleta) => estadoVisible(boleta, hoy) === 'PENDIENTE' && !boleta.pagos.length)
    .map((boleta) => ({
      boletaId: boleta.id,
      estudiante: {
        id: boleta.planPago.matricula.estudianteId,
        nombres: boleta.planPago.matricula.estudiante.persona.nombres,
        apellidos: boleta.planPago.matricula.estudiante.persona.apellidos,
      },
      concepto: boleta.concepto,
      periodo: boleta.periodo,
      monto: Number(boleta.monto).toFixed(2),
      fechaVencimiento: fechaIso(boleta.fechaVencimiento),
      diasRestantes: diasEntre(hoy, boleta.fechaVencimiento),
    }));
  return respuesta;
}
