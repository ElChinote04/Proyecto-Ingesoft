export const ESTADOS_PUBLICACION = {
  PUBLICADA: 'PUBLICADA',
  LISTA: 'LISTA',
  CON_PENDIENTES: 'CON_PENDIENTES',
  SIN_DATOS: 'SIN_DATOS',
};

const nombreDocente = ({ docente }) => `${docente.persona.nombres} ${docente.persona.apellidos}`;

// Reasignar un curso crea otra asignación y deja activa la anterior, así que se agrupa por curso:
// contar por asignación exigiría dos veces la misma competencia y el pendiente no se cerraría nunca.
function agruparPorCurso(asignaciones) {
  const cursos = new Map();
  for (const asignacion of asignaciones) {
    const curso = cursos.get(asignacion.curso.id) ?? { ...asignacion.curso, docentes: new Set() };
    curso.docentes.add(nombreDocente(asignacion));
    cursos.set(asignacion.curso.id, curso);
  }
  return [...cursos.values()];
}

const CUENTAN = ['CALIFICADA', 'NO_RINDIO'];

/**
 * Situación de un alumno en una competencia: completa si no le falta registrar ninguna
 * evaluación, tiene letra y le cuentan al menos `minimo` notas.
 */
function situacionDelAlumno(matriculaId, evaluaciones, tieneLetra, minimo) {
  const condiciones = evaluaciones.map(({ resultados }) => resultados.get(matriculaId));
  const pendientes = condiciones.filter((condicion) => !condicion).length;
  if (pendientes) return { pendientes };
  if (!tieneLetra) return { sinLetra: true };
  const contados = condiciones.filter((condicion) => CUENTAN.includes(condicion)).length;
  return contados < minimo ? { bajoMinimo: true } : { completa: true };
}

/**
 * Calcula qué falta en una sección para poder publicar sus libretas.
 * @param {object} datos
 * @param {{ gradoId: number, matriculas: { id: number }[], asignaciones: object[] }} datos.seccion
 * @param {Map<number, { resultados: Map<number, string> }[]>} datos.evaluacionesPorCompetencia
 *   evaluaciones activas de la sección en el bimestre, con la condición de cada alumno.
 * @param {Set<string>} datos.letras claves `matriculaId:competenciaId` que ya tienen letra.
 * @param {Map<string, { minimoNotas: number }>} datos.reglasVigentes clave `gradoId:cursoId`.
 */
export function evaluarSeccion({ seccion, evaluacionesPorCompetencia, letras, reglasVigentes }) {
  let totalEsperado = 0;
  let totalCompleto = 0;
  const pendientes = [];
  for (const curso of agruparPorCurso(seccion.asignaciones)) {
    const regla = reglasVigentes.get(`${seccion.gradoId}:${curso.id}`);
    const minimo = regla?.minimoNotas || 1;
    const faltas = { sinEvaluaciones: 0, resultadosPendientes: 0, sinLetra: 0, bajoMinimo: 0 };
    for (const { id: competenciaId } of curso.competencias) {
      const evaluaciones = evaluacionesPorCompetencia.get(competenciaId) ?? [];
      totalEsperado += seccion.matriculas.length;
      if (!evaluaciones.length) {
        if (seccion.matriculas.length) faltas.sinEvaluaciones += 1;
        continue;
      }
      for (const { id: matriculaId } of seccion.matriculas) {
        const situacion = situacionDelAlumno(
          matriculaId,
          evaluaciones,
          letras.has(`${matriculaId}:${competenciaId}`),
          minimo,
        );
        if (situacion.completa) totalCompleto += 1;
        faltas.resultadosPendientes += situacion.pendientes ?? 0;
        if (situacion.sinLetra) faltas.sinLetra += 1;
        if (situacion.bajoMinimo) faltas.bajoMinimo += 1;
      }
    }
    // Sin regla no hay letra anual; un curso sin competencias no tiene nada que consolidar.
    const sinRegla = !regla && curso.competencias.length > 0;
    if (sinRegla || Object.values(faltas).some(Boolean))
      pendientes.push({
        curso: curso.nombre,
        docente: [...curso.docentes].join(', '),
        ...faltas,
        minimoNotas: minimo,
        sinRegla,
      });
  }
  return { totalEsperado, totalCompleto, pendientes };
}

export function estadoSeccion({ publicada, totalEsperado, pendientes }) {
  if (publicada) return ESTADOS_PUBLICACION.PUBLICADA;
  if (!totalEsperado) return ESTADOS_PUBLICACION.SIN_DATOS;
  return pendientes.length ? ESTADOS_PUBLICACION.CON_PENDIENTES : ESTADOS_PUBLICACION.LISTA;
}
