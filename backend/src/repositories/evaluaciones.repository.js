import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

const asignacionVigente = (docenteId) => ({ docenteId, activo: true, curso: { activo: true } });

export const findSeccion = (id, db = prisma) =>
  db.seccion.findUnique({ where: { id }, select: { id: true, anioAcademicoId: true } });

export const findBimestre = (id, db = prisma) =>
  db.bimestreAcademico.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      activo: true,
      anioAcademicoId: true,
      fechaInicio: true,
      fechaFin: true,
    },
  });

export const findCompetencia = (id, db = prisma) =>
  db.competencia.findUnique({ where: { id }, select: { id: true, cursoId: true, activo: true } });

// Cursos que el docente dicta hoy en la sección, con sus competencias activas.
export const listCursosDelDocente = ({ docenteId, seccionId }, db = prisma) =>
  db.cursoSeccionDocente.findMany({
    where: { seccionId, ...asignacionVigente(docenteId) },
    select: {
      id: true,
      curso: {
        select: {
          id: true,
          codigo: true,
          nombre: true,
          competencias: {
            where: { activo: true },
            select: { id: true, codigo: true, nombre: true },
            orderBy: { codigo: 'asc' },
          },
        },
      },
    },
    orderBy: [{ curso: { nombre: 'asc' } }, { id: 'asc' }],
  });

export const findAsignacionVigente = ({ docenteId, cursoId, seccionId }, db = prisma) =>
  db.cursoSeccionDocente.findFirst({
    where: { cursoId, seccionId, ...asignacionVigente(docenteId) },
    select: { id: true },
    orderBy: { id: 'desc' },
  });

const resultadosVigentes = { activo: true, matricula: { activo: true } };

export const listEvaluaciones = ({ seccionId, bimestreId, cursoIds }, db = prisma) =>
  db.evaluacion.findMany({
    where: { activo: true, seccionId, bimestreId, cursoId: { in: cursoIds } },
    select: {
      id: true,
      cursoId: true,
      competenciaId: true,
      titulo: true,
      descripcion: true,
      fecha: true,
      peso: true,
      _count: { select: { resultados: { where: resultadosVigentes } } },
    },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });

// Las evaluaciones de la clase con el resultado de un alumno, para el modal de ese alumno.
export const listEvaluacionesDeAlumno = (
  { seccionId, bimestreId, cursoIds, matriculaId },
  db = prisma,
) =>
  db.evaluacion.findMany({
    where: { activo: true, seccionId, bimestreId, cursoId: { in: cursoIds } },
    select: {
      id: true,
      cursoId: true,
      competenciaId: true,
      titulo: true,
      descripcion: true,
      fecha: true,
      peso: true,
      resultados: {
        where: { activo: true, matriculaId },
        select: {
          id: true,
          condicion: true,
          nota: true,
          motivo: true,
          comentario: true,
          archivos: {
            where: { activo: true },
            select: { id: true, nombreOriginal: true, tipoMime: true, tamanoBytes: true },
            orderBy: { id: 'asc' },
          },
        },
      },
    },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });

export const countMatriculasActivas = (seccionId, db = prisma) =>
  db.matricula.count({ where: { seccionId, activo: true } });

export const listMatriculasActivas = (seccionId, db = prisma) =>
  db.matricula.findMany({ where: { seccionId, activo: true }, select: { id: true } });

const evaluacion = {
  id: true,
  asignacionId: true,
  cursoId: true,
  seccionId: true,
  bimestreId: true,
  competenciaId: true,
  titulo: true,
  descripcion: true,
  fecha: true,
  peso: true,
  activo: true,
  bimestre: { select: { id: true, nombre: true, fechaInicio: true, fechaFin: true } },
  _count: { select: { resultados: { where: { activo: true } } } },
};

export const findEvaluacion = (id, db = prisma) =>
  db.evaluacion.findUnique({ where: { id }, select: evaluacion });

// Cambiar o eliminar una evaluación la toma en exclusiva; registrar un resultado, compartida.
// Así el peso con el que se recalcula una letra no cambia a mitad del cálculo.
export const bloquearEvaluacion = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "Evaluacion" WHERE "id" = ${id} FOR UPDATE`;

export const bloquearEvaluacionCompartida = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "Evaluacion" WHERE "id" = ${id} FOR SHARE`;

export const createEvaluacion = (data, db) => db.evaluacion.create({ data, select: evaluacion });

export const updateEvaluacion = (id, data, db) =>
  db.evaluacion.update({ where: { id }, data, select: evaluacion });

export async function darDeBajaResultadosDeEvaluacion(evaluacionId, modificadoPorId, db) {
  await db.archivoResultadoEvaluacion.updateMany({
    where: { activo: true, resultado: { evaluacionId, activo: true } },
    data: { activo: false },
  });
  const { count } = await db.resultadoEvaluacion.updateMany({
    where: { evaluacionId, activo: true },
    data: { activo: false, modificadoPorId },
  });
  return count;
}

const alumno = {
  id: true,
  estudiante: {
    select: {
      codigoEstudiante: true,
      persona: { select: { nombres: true, apellidos: true } },
    },
  },
};

export const listMatriculasPendientes = ({ evaluacionId, seccionId }, db = prisma) =>
  db.matricula.findMany({
    where: {
      seccionId,
      activo: true,
      resultadosEvaluacion: { none: { evaluacionId, activo: true } },
    },
    select: alumno,
    orderBy: [
      { estudiante: { persona: { apellidos: 'asc' } } },
      { estudiante: { persona: { nombres: 'asc' } } },
    ],
  });

export const findMatricula = (id, db = prisma) =>
  db.matricula.findUnique({ where: { id }, select: { id: true, activo: true, seccionId: true } });

// Serializa los guardados del mismo alumno en la misma evaluación (el resultado puede no
// existir aún, así que no hay fila que bloquear).
export const bloquearResultado = ({ evaluacionId, matriculaId }, db) =>
  db.$executeRaw`SELECT pg_advisory_xact_lock(${evaluacionId}::int, ${matriculaId}::int)`;

const resultado = {
  id: true,
  evaluacionId: true,
  matriculaId: true,
  condicion: true,
  nota: true,
  motivo: true,
  comentario: true,
  activo: true,
  archivos: {
    where: { activo: true },
    select: {
      id: true,
      nombreOriginal: true,
      nombreAlmacenado: true,
      tipoMime: true,
      tamanoBytes: true,
    },
    orderBy: { id: 'asc' },
  },
};

export const findResultadoActivo = ({ evaluacionId, matriculaId }, db = prisma) =>
  db.resultadoEvaluacion.findFirst({
    where: { evaluacionId, matriculaId, activo: true },
    select: resultado,
  });

export const createResultado = (data, db) =>
  db.resultadoEvaluacion.create({ data, select: { id: true } });

export const updateResultado = (id, data, db) =>
  db.resultadoEvaluacion.update({ where: { id }, data, select: { id: true } });

export const findResultado = (id, db = prisma) =>
  db.resultadoEvaluacion.findUnique({ where: { id }, select: resultado });

export const createArchivos = (registros, db) =>
  db.archivoResultadoEvaluacion.createMany({ data: registros });

export const darDeBajaArchivos = ({ resultadoId, ids }, db) =>
  db.archivoResultadoEvaluacion.updateMany({
    where: { resultadoId, activo: true, ...(ids && { id: { in: ids } }) },
    data: { activo: false },
  });
