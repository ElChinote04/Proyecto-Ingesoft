import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../src/config/database.js';
import { backendRoot, env } from '../../src/config/env.js';

// Apoyo para las suites que necesitan notas: las registra como el docente, con una evaluación
// del salón y el examen corregido de cada alumno. La letra la calcula el servidor.
const base = '/api/v1';

export const PDF = Buffer.from('%PDF-1.4\n%examen corregido\n');

// Una nota que da cada letra con la escala por defecto (AD ≥ 18, A ≥ 14, B ≥ 11).
export const NOTA_DE = { AD: 19, A: 15, B: 12, C: 8 };

export const fechaTexto = (fecha) => fecha.toISOString().slice(0, 10);

/**
 * Sin fechas no se evalúa: da a los bimestres del año dos meses cada uno, sin solaparse.
 * Devuelve los bimestres ya fechados, en orden.
 */
export async function fecharBimestres(anioAcademicoId, anio = 2026) {
  const bimestres = await prisma.bimestreAcademico.findMany({
    where: { anioAcademicoId },
    orderBy: { numero: 'asc' },
  });
  for (const [indice, { id }] of bimestres.entries())
    await prisma.bimestreAcademico.update({
      where: { id },
      data: {
        fechaInicio: new Date(Date.UTC(anio, 2 + indice * 2, 1)),
        fechaFin: new Date(Date.UTC(anio, 3 + indice * 2, 28)),
      },
    });
  return prisma.bimestreAcademico.findMany({
    where: { anioAcademicoId },
    orderBy: { numero: 'asc' },
  });
}

export function crearCalificador(agente) {
  const evaluaciones = new Map();

  /** Crea una evaluación; sin `nueva`, reutiliza la de esa sección, bimestre y competencia. */
  async function evaluacion({ seccionId, cursoId, competenciaId, bimestre, peso = 1, nueva }) {
    const clave = `${seccionId}:${bimestre.id}:${competenciaId}`;
    if (!nueva && evaluaciones.has(clave)) return evaluaciones.get(clave);
    const { body } = await agente
      .post(`${base}/evaluaciones`)
      .send({
        cursoId,
        seccionId,
        bimestreId: bimestre.id,
        competenciaId,
        titulo: `Práctica ${evaluaciones.size + 1}`,
        fecha: fechaTexto(bimestre.fechaInicio),
        peso,
      })
      .expect(201);
    if (!nueva) evaluaciones.set(clave, body.data.id);
    return body.data.id;
  }

  /** PUT del resultado; con nota adjunta un PDF, como exige el servidor. */
  function registrar(evaluacionId, matriculaId, { nota, condicion = 'CALIFICADA', motivo } = {}) {
    const peticion = agente
      .put(`${base}/evaluaciones/${evaluacionId}/resultados/${matriculaId}`)
      .field('condicion', condicion);
    if (nota !== undefined) peticion.field('nota', String(nota));
    if (motivo) peticion.field('motivo', motivo);
    if (condicion === 'CALIFICADA') peticion.attach('archivos', PDF, 'examen.pdf');
    return peticion;
  }

  /**
   * Pone una nota con la evaluación reutilizable de la competencia y devuelve su id. Al
   * corregir una nota se reemplaza el examen, como haría el docente, para no superar el máximo
   * de archivos.
   */
  async function calificar(matriculaId, datos) {
    const id = await evaluacion(datos);
    const previos = await prisma.archivoResultadoEvaluacion.findMany({
      where: { activo: true, resultado: { evaluacionId: id, matriculaId, activo: true } },
      select: { id: true },
    });
    const peticion = registrar(id, matriculaId, { nota: datos.nota });
    if (previos.length)
      peticion.field('archivosQuitados', JSON.stringify(previos.map((archivo) => archivo.id)));
    await peticion.expect(200);
    return id;
  }

  return { evaluacion, registrar, calificar };
}

export async function archivosEnDisco() {
  try {
    return (await readdir(path.resolve(backendRoot, env.EVIDENCIAS_DIR))).length;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

/** Hace fallar toda inserción en la tabla mientras corre la operación. */
export async function conTriggerQueFalla(tabla, operacion) {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fallar_prueba() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'fallo de prueba'; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER fallar_prueba BEFORE INSERT ON "${tabla}"
    FOR EACH ROW EXECUTE FUNCTION fallar_prueba()`);
  try {
    await operacion();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER fallar_prueba ON "${tabla}"`);
    await prisma.$executeRawUnsafe('DROP FUNCTION fallar_prueba');
  }
}
