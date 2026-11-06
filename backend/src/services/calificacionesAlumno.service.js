import * as repository from '../repositories/calificacionesAlumno.repository.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import { estaPublicada, exigirSeccionSinPublicar } from './publicacionSeccion.service.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

function requireDocente(actor) {
  if (!actor.docenteId)
    fail(403, 'NO_TEACHER_PROFILE', 'Tu cuenta no tiene un perfil docente asociado.');
}

const niveles = ['C', 'B', 'A', 'AD'];

function metodoRegla(metodo) {
  try {
    return JSON.parse(metodo);
  } catch {
    return { estrategia: metodo, desempate: 'reciente', minimoEvidencias: 1 };
  }
}

export function consolidar(items, metodo) {
  if (!items.length) return null;
  const regla = metodoRegla(metodo);
  const suficientes = items.length >= (regla.minimoEvidencias || 1) ? items : [];
  if (!suficientes.length) return null;
  if (regla.estrategia === 'reciente') return suficientes.at(-1).nivelLogro;
  if (regla.estrategia === 'prioridad') {
    return suficientes.reduce(
      (mejor, item) =>
        niveles.indexOf(item.nivelLogro) > niveles.indexOf(mejor) ? item.nivelLogro : mejor,
      suficientes[0].nivelLogro,
    );
  }

  const conteos = new Map();
  for (const item of suficientes)
    conteos.set(item.nivelLogro, (conteos.get(item.nivelLogro) || 0) + 1);
  const maximo = Math.max(...conteos.values());
  const candidatas = niveles.filter((nivel) => conteos.get(nivel) === maximo);
  if (candidatas.length === 1 || regla.desempate === 'alto')
    return candidatas[candidatas.length - 1];
  if (regla.desempate === 'bajo') return candidatas[0];
  return [...suficientes].reverse().find((item) => candidatas.includes(item.nivelLogro)).nivelLogro;
}

export function agregarLogroConsolidado(calificaciones) {
  const grupos = new Map();
  for (const calificacion of calificaciones) {
    for (const item of calificacion.competencias ?? []) {
      const clave = `${calificacion.matriculaId}:${calificacion.asignacionId}:${item.competenciaId}`;
      const grupo = grupos.get(clave) ?? [];
      grupo.push({ nivelLogro: item.nivelLogro, modificadoEn: calificacion.modificadoEn });
      grupos.set(clave, grupo);
    }
  }
  return calificaciones.map((calificacion) => ({
    ...calificacion,
    competencias: calificacion.competencias?.map((item) => {
      const clave = `${calificacion.matriculaId}:${calificacion.asignacionId}:${item.competenciaId}`;
      return {
        ...item,
        logroConsolidado: consolidar(grupos.get(clave) ?? [], calificacion.regla?.metodo),
      };
    }),
  }));
}

export async function listarSalones(actor) {
  requireDocente(actor);
  const salones = await repository.listSalones(actor.docenteId);
  return salones.map((salon) => ({
    id: salon.id,
    nombre: `${salon.grado.nombre} ${salon.nombre}`,
    anioAcademicoId: salon.anioAcademicoId,
    anioAcademico: salon.anioAcademico.codigo,
  }));
}

export async function listarAlumnos(seccionId, actor) {
  requireDocente(actor);
  const asignaciones = await repository.listAsignaciones(seccionId, actor.docenteId);
  if (!asignaciones.length) fail(403, 'FORBIDDEN', 'Solo puedes consultar tus propios salones.');
  const matriculas = await repository.listAlumnos(seccionId);
  return matriculas.map(({ id, estudiante }) => ({
    matriculaId: id,
    codigo: estudiante.codigoEstudiante,
    nombre: `${estudiante.persona.nombres} ${estudiante.persona.apellidos}`,
  }));
}

// Resuelve qué cursos puede calificar el docente a este alumno en el bimestre.
async function resolverCursos(matriculaId, bimestreId, actor, db) {
  requireDocente(actor);
  const [matricula, bimestre] = await Promise.all([
    repository.findMatricula(matriculaId, db),
    repository.findBimestre(bimestreId, db),
  ]);
  if (!matricula?.activo)
    fail(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe o está inactiva.');
  const asignaciones = await repository.listAsignaciones(matricula.seccionId, actor.docenteId, db);
  if (!asignaciones.length)
    fail(403, 'FORBIDDEN', 'Solo puedes calificar a alumnos de tus salones.');
  if (!bimestre?.activo || bimestre.anioAcademicoId !== matricula.anioAcademicoId)
    fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año académico del salón.');
  const reglas = await repository.listReglasVigentes(
    {
      gradoId: matricula.seccion.gradoId,
      cursoIds: asignaciones.map(({ curso }) => curso.id),
    },
    db,
  );
  // Vienen ordenadas por versión descendente: la primera de cada curso es la vigente.
  const reglaDe = (cursoId) => reglas.find((regla) => regla.cursoId === cursoId) ?? null;
  return {
    bimestre,
    seccionId: matricula.seccionId,
    cursos: asignaciones.map(({ id, curso }) => ({
      asignacionId: id,
      curso,
      regla: reglaDe(curso.id),
    })),
  };
}

export async function obtenerCalificaciones(matriculaId, { bimestreId }, actor) {
  const { bimestre, seccionId, cursos } = await resolverCursos(matriculaId, bimestreId, actor);
  const [niveles, publicado] = await Promise.all([
    repository.listNiveles({
      matriculaId,
      seccionId,
      cursoIds: cursos.map(({ curso }) => curso.id),
    }),
    estaPublicada({ bimestreId, seccionId }),
  ]);
  const nivelDe = new Map(
    niveles
      .filter((item) => item.calificacion.bimestreId === bimestreId)
      .map((item) => [item.competenciaId, item]),
  );
  const nivelesPorCompetencia = new Map();
  for (const nivel of niveles) {
    const anteriores = nivelesPorCompetencia.get(nivel.competenciaId) ?? [];
    anteriores.push(nivel);
    nivelesPorCompetencia.set(nivel.competenciaId, anteriores);
  }
  return {
    bimestre: { id: bimestre.id, nombre: bimestre.nombre, publicado },
    cursos: cursos.map(({ curso, regla }) => ({
      id: curso.id,
      nombre: curso.nombre,
      regla: regla && { id: regla.id, nombre: regla.nombre },
      competencias: curso.competencias.map((competencia) => ({
        ...competencia,
        nivelLogro: nivelDe.get(competencia.id)?.nivelLogro ?? null,
        conclusionDescriptiva: nivelDe.get(competencia.id)?.conclusionDescriptiva ?? null,
        calificacionCompetenciaId: nivelDe.get(competencia.id)?.id ?? null,
        totalEvidencias: nivelDe.get(competencia.id)?._count.evidencias ?? 0,
        logroConsolidado: consolidar(
          nivelesPorCompetencia.get(competencia.id) ?? [],
          regla?.metodo ?? 'frecuencia',
        ),
      })),
    })),
  };
}

export async function guardarCalificaciones(matriculaId, input, actor, requestId) {
  return repository.transaction(async (db) => {
    const { seccionId, cursos } = await resolverCursos(matriculaId, input.bimestreId, actor, db);
    await exigirSeccionSinPublicar({ bimestreId: input.bimestreId, seccionId }, db);
    const destinos = new Map(
      cursos.flatMap((destino) =>
        destino.curso.competencias.map((competencia) => [competencia.id, destino]),
      ),
    );
    const resultados = [];
    for (const { competenciaId, nivelLogro, conclusionDescriptiva } of input.calificaciones) {
      const destino = destinos.get(competenciaId);
      if (!destino)
        fail(
          400,
          'INVALID_COMPETENCY_CONTEXT',
          'Solo puedes calificar competencias activas de los cursos que dictas en este salón.',
        );
      if (!destino.regla)
        fail(
          404,
          'RULE_NOT_FOUND',
          `El curso ${destino.curso.nombre} no tiene una regla de consolidación vigente.`,
        );
      // Tras reasignar el curso, la nota sigue en la asignación anterior: duplicarla dejaría a la
      // evidencia sustentando una nota distinta de la vigente.
      const existente = await repository.findCalificacionDelCurso(
        { matriculaId, bimestreId: input.bimestreId, cursoId: destino.curso.id },
        db,
      );
      const { calificacionId, anterior, nuevo } = await repository.guardarNivel(
        {
          matriculaId,
          bimestreId: input.bimestreId,
          asignacionId: existente?.asignacionId ?? destino.asignacionId,
          reglaId: destino.regla.id,
          competenciaId,
          nivelLogro,
          conclusionDescriptiva,
          actorId: actor.id,
        },
        db,
      );
      await registrarTransaccionCritica(db, {
        actorId: actor.id,
        evento: anterior ? 'NOTA_MODIFICADA' : 'NOTA_REGISTRADA',
        entidad: 'Calificacion',
        entidadId: calificacionId,
        anterior,
        nuevo,
        ...(anterior && { motivo: 'Actualización de calificación mediante carga masiva.' }),
        requestId,
      });
      resultados.push({ calificacionId, competenciaId, nivelLogro, conclusionDescriptiva });
    }
    return { total: resultados.length, resultados };
  });
}
