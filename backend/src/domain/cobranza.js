// Reglas de cobranza: morosidad por estudiante (US-008), reporte de pagos por
// periodo (US-012) y avisos de vencimiento (US-011). Funciones puras, sin
// infraestructura: reciben boletas ya consultadas y devuelven el resultado.
// Los montos se suman en céntimos enteros para no arrastrar el error de coma
// flotante y se devuelven como texto con dos decimales, igual que el resto de la API.
import { aCentimos, CENTIMOS_POR_SOL, estadoVisible } from './cronograma.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export const aSoles = (centimos) => (centimos / CENTIMOS_POR_SOL).toFixed(2);

export const fechaIso = (fecha) => new Date(fecha).toISOString().slice(0, 10);

/** Días completos entre dos fechas a medianoche UTC (las boletas son @db.Date). */
export const diasEntre = (desde, hasta) =>
  Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / MS_POR_DIA);

export const sumarDias = (fecha, dias) => new Date(new Date(fecha).getTime() + dias * MS_POR_DIA);

const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 10000) / 100 : 0);

const nombreCompleto = (persona) => `${persona.nombres} ${persona.apellidos}`;

/**
 * US-008: agrupa las boletas morosas por estudiante. Cada fila resume cuánto
 * debe, cuántas boletas tiene vencidas y desde cuándo, con sus apoderados
 * vinculados para que la administración sepa a quién contactar.
 * Orden: mayor deuda primero; a igual deuda, el atraso más antiguo.
 */
export function agruparMorosos(boletas, hoy) {
  const porEstudiante = new Map();
  for (const boleta of boletas) {
    const { matricula } = boleta.planPago;
    const { estudiante } = matricula;
    let fila = porEstudiante.get(estudiante.id);
    if (!fila) {
      fila = {
        estudiante: {
          id: estudiante.id,
          codigo: estudiante.codigoEstudiante,
          nombre: nombreCompleto(estudiante.persona),
          documento: estudiante.persona.numeroDocumento,
        },
        aula: `${matricula.seccion.grado.nombre} ${matricula.seccion.nombre}`,
        anioAcademico: matricula.anioAcademico.codigo,
        apoderados: estudiante.apoderados.map((vinculo) => ({
          nombre: nombreCompleto(vinculo.apoderado.persona),
          parentesco: vinculo.parentesco,
        })),
        boletasMorosas: 0,
        centimos: 0,
        vencimientoMasAntiguo: boleta.fechaVencimiento,
      };
      porEstudiante.set(estudiante.id, fila);
    }
    fila.boletasMorosas += 1;
    fila.centimos += aCentimos(String(boleta.monto));
    if (boleta.fechaVencimiento < fila.vencimientoMasAntiguo)
      fila.vencimientoMasAntiguo = boleta.fechaVencimiento;
  }

  const estudiantes = [...porEstudiante.values()]
    .sort(
      (a, b) =>
        b.centimos - a.centimos ||
        a.vencimientoMasAntiguo - b.vencimientoMasAntiguo ||
        a.estudiante.nombre.localeCompare(b.estudiante.nombre, 'es'),
    )
    .map(({ centimos, vencimientoMasAntiguo, ...fila }) => ({
      ...fila,
      deuda: aSoles(centimos),
      vencimientoMasAntiguo: fechaIso(vencimientoMasAntiguo),
      diasAtraso: diasEntre(vencimientoMasAntiguo, hoy),
    }));

  const totalCentimos = estudiantes.reduce((suma, fila) => suma + aCentimos(fila.deuda), 0);
  return {
    resumen: {
      estudiantes: estudiantes.length,
      boletas: boletas.length,
      deuda: aSoles(totalCentimos),
    },
    estudiantes,
  };
}

const acumuladorVacio = () => ({
  boletas: 0,
  emitido: 0,
  recaudado: 0,
  pendiente: 0,
  moroso: 0,
});

function acumular(acumulador, boleta, hoy) {
  const centimos = aCentimos(String(boleta.monto));
  const estado = estadoVisible(boleta, hoy);
  acumulador.boletas += 1;
  acumulador.emitido += centimos;
  if (estado === 'PAGADA') acumulador.recaudado += centimos;
  else if (estado === 'MOROSA') acumulador.moroso += centimos;
  else acumulador.pendiente += centimos;
}

const enSoles = (acumulador) => ({
  boletas: acumulador.boletas,
  emitido: aSoles(acumulador.emitido),
  recaudado: aSoles(acumulador.recaudado),
  pendiente: aSoles(acumulador.pendiente),
  moroso: aSoles(acumulador.moroso),
  porcentajeCobranza: porcentaje(acumulador.recaudado, acumulador.emitido),
});

/**
 * US-012: totales de lo emitido, recaudado, pendiente y moroso, en total y por
 * periodo (mes de la boleta). Se cuentan las boletas que vencen en el rango
 * consultado; las anuladas no llegan aquí. Pendiente es lo que aún no vence y
 * moroso lo vencido sin pagar, con el mismo corte que el historial de boletas.
 */
export function calcularReporte(boletas, hoy) {
  const total = acumuladorVacio();
  const porPeriodo = new Map();
  for (const boleta of boletas) {
    if (!porPeriodo.has(boleta.periodo)) porPeriodo.set(boleta.periodo, acumuladorVacio());
    acumular(porPeriodo.get(boleta.periodo), boleta, hoy);
    acumular(total, boleta, hoy);
  }
  return {
    totales: enSoles(total),
    periodos: [...porPeriodo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodo, acumulador]) => ({ periodo, ...enSoles(acumulador) })),
  };
}
