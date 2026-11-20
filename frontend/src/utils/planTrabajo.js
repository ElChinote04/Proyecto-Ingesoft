export const TIPOS_ACTIVIDAD = [
  ['EXPOSICION', 'Exposición'],
  ['EJERCICIO', 'Ejercicios'],
  ['VIDEO', 'Video'],
  ['AVANCE_PLAN', 'Avance del plan'],
  ['OTRO', 'Otro'],
];
export const etiquetaTipo = (tipo) =>
  TIPOS_ACTIVIDAD.find(([clave]) => clave === tipo)?.[1] ?? tipo;

export const MAX_ENLACES = 5;

export const hoyEnLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export const fechaCorta = (valor) =>
  new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${valor}T00:00:00Z`),
  );

/** El bimestre en curso; si no hay, el próximo; si tampoco, el último con fechas. */
export function bimestrePorDefecto(bimestres) {
  const hoy = hoyEnLima();
  const conFechas = bimestres.filter(({ fechaInicio, fechaFin }) => fechaInicio && fechaFin);
  return (
    conFechas.find(({ fechaInicio, fechaFin }) => fechaInicio <= hoy && hoy <= fechaFin) ??
    conFechas.find(({ fechaInicio }) => fechaInicio > hoy) ??
    conFechas.at(-1) ??
    bimestres[0]
  );
}

/** Agrupa las asignaciones por curso: el docente elige primero el curso y luego la sección. */
export function cursosDe(asignaciones) {
  const cursos = new Map();
  for (const asignacion of asignaciones) {
    const curso = cursos.get(asignacion.curso.id) ?? { ...asignacion.curso, clases: [] };
    curso.clases.push(asignacion);
    cursos.set(asignacion.curso.id, curso);
  }
  return [...cursos.values()];
}

export const nombreSeccion = ({ grado, nombre }) => `${grado} ${nombre}`;

/** El nombre del curso, con su código solo si otro curso de la lista se llama igual. */
export const etiquetaCurso = (curso, cursos) =>
  cursos.filter(({ nombre }) => nombre === curso.nombre).length > 1
    ? `${curso.nombre} (${curso.codigo})`
    : curso.nombre;
