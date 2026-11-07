import { aplicarRegla, metodoRegla } from './consolidacion.js';

const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true });

// Las competencias de un área no tienen orden en el tiempo: «reciente» no significa nada entre ellas.
function reglaDeArea({ estrategia, desempate }) {
  if (estrategia === 'prioridad') return { estrategia };
  return {
    estrategia: 'frecuencia',
    desempate: estrategia === 'frecuencia' && desempate === 'alto' ? 'alto' : 'bajo',
  };
}

function calcularFinalDeArea(competencias, regla) {
  if (!regla || competencias.some(({ calificacionAnual }) => !calificacionAnual)) return null;
  return aplicarRegla(
    competencias.map(({ calificacionAnual }) => ({ nivelLogro: calificacionAnual })),
    reglaDeArea(regla),
  );
}

// El área se identifica por el curso de la competencia y no por la asignación: reasignar un curso
// crea otra asignación y no debe duplicar el área.
function agruparCompetencias(cursos, notas, logrosVacios) {
  const areas = new Map();
  const agregar = (curso, competencia) => {
    const area = areas.get(curso.id) ?? { ...curso, competencias: new Map() };
    areas.set(curso.id, area);
    if (!area.competencias.has(competencia.id))
      area.competencias.set(competencia.id, { ...competencia, logros: { ...logrosVacios } });
    return area;
  };
  for (const { competencias, ...curso } of cursos)
    for (const competencia of competencias) agregar(curso, competencia);
  for (const { competencia } of notas) {
    const { curso, ...datos } = competencia;
    agregar(curso, datos);
  }
  return areas;
}

/**
 * Arma la libreta de una matrícula a partir de las notas ya filtradas por publicación.
 * @param {object} datos
 * @param {{ id: number, codigo: string, nombre: string, competencias: object[] }[]} datos.cursos
 *   cursos que se dictan hoy en la sección, con sus competencias activas.
 * @param {object[]} datos.notas notas publicadas, de la más antigua a la más reciente.
 * @param {{ id: number, numero: number, publicado: boolean }[]} datos.periodos en orden de número.
 */
export function armarLibreta({ cursos, notas, periodos }) {
  const anualCompleta = periodos.length > 0 && periodos.every(({ publicado }) => publicado);
  const numeroDe = new Map(periodos.map(({ id, numero }) => [id, numero]));
  const logrosVacios = Object.fromEntries(periodos.map(({ numero }) => [numero, null]));
  const areas = agruparCompetencias(cursos, notas, logrosVacios);

  const ultimaRegla = new Map();
  for (const { nivelLogro, competencia, calificacion } of notas) {
    const numero = numeroDe.get(calificacion.bimestreId);
    areas.get(competencia.curso.id).competencias.get(competencia.id).logros[numero] = nivelLogro;
    const vigente = ultimaRegla.get(competencia.curso.id);
    if (!vigente || numero >= vigente.numero)
      ultimaRegla.set(competencia.curso.id, { numero, metodo: calificacion.regla.metodo });
  }

  return {
    anualCompleta,
    areas: [...areas.values()]
      .map(({ competencias, ...area }) => {
        const guardada = ultimaRegla.get(area.id);
        // La regla es la que calificó el último bimestre: cambiarla hoy no altera un año cerrado.
        const regla = guardada ? metodoRegla(guardada.metodo) : null;
        const filas = [...competencias.values()].sort(porCodigo).map((competencia) => {
          const niveles = periodos
            .map(({ numero }) => competencia.logros[numero])
            .filter(Boolean)
            .map((nivelLogro) => ({ nivelLogro }));
          return {
            ...competencia,
            calificacionAnual:
              anualCompleta && niveles.length ? aplicarRegla(niveles, regla) : null,
          };
        });
        return {
          ...area,
          calificacionFinal: anualCompleta ? calcularFinalDeArea(filas, regla) : null,
          competencias: filas,
        };
      })
      .filter(({ competencias }) => competencias.length)
      .sort(porCodigo),
  };
}
