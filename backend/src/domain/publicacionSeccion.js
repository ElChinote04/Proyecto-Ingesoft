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

/**
 * Calcula qué falta en una sección para poder publicar sus libretas.
 * @param {object} datos
 * @param {{ gradoId: number, matriculas: { id: number }[], asignaciones: object[] }} datos.seccion
 * @param {Map<string, number>} datos.evidenciasPorNota clave `matriculaId:competenciaId`, valor
 *   el mayor número de evidencias activas entre las notas de esa clave.
 * @param {Set<string>} datos.reglasVigentes claves `gradoId:cursoId`.
 */
export function evaluarSeccion({ seccion, evidenciasPorNota, reglasVigentes }) {
  let totalEsperado = 0;
  let totalCompleto = 0;
  const pendientes = [];
  for (const curso of agruparPorCurso(seccion.asignaciones)) {
    let sinNota = 0;
    let sinEvidencia = 0;
    for (const { id: matriculaId } of seccion.matriculas) {
      for (const { id: competenciaId } of curso.competencias) {
        totalEsperado += 1;
        const evidencias = evidenciasPorNota.get(`${matriculaId}:${competenciaId}`);
        if (evidencias === undefined) sinNota += 1;
        else if (evidencias === 0) sinEvidencia += 1;
        else totalCompleto += 1;
      }
    }
    if (sinNota || sinEvidencia)
      pendientes.push({
        curso: curso.nombre,
        docente: [...curso.docentes].join(', '),
        sinNota,
        sinEvidencia,
        sinRegla: !reglasVigentes.has(`${seccion.gradoId}:${curso.id}`),
      });
  }
  return { totalEsperado, totalCompleto, pendientes };
}

export function estadoSeccion({ publicada, totalEsperado, pendientes }) {
  if (publicada) return ESTADOS_PUBLICACION.PUBLICADA;
  if (!totalEsperado) return ESTADOS_PUBLICACION.SIN_DATOS;
  return pendientes.length ? ESTADOS_PUBLICACION.CON_PENDIENTES : ESTADOS_PUBLICACION.LISTA;
}
