import * as repository from '../repositories/evaluaciones.repository.js';
import * as planes from '../repositories/planesAcademicos.repository.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import { escalaParaCalcular } from './escalaCalificacion.service.js';
import { recalcularCompetencia, recalcularLogro } from './logros.service.js';
import { estaPublicada, exigirSeccionSinPublicar } from './publicacionSeccion.service.js';
import { exigirFechasBimestre } from './planesAcademicos.service.js';
import {
  conArchivosEnDisco,
  leerArchivoRegistrado,
  prepararArchivos,
} from './archivosAdjuntos.service.js';
import { MAX_ARCHIVOS_EVIDENCIA } from '../domain/archivoEvidencia.js';
import { NOTA_MAXIMA } from '../domain/notaVigesimal.js';
import { aTexto } from '../domain/semanasBimestre.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message, details) => {
  throw new AppError(status, code, message, details);
};

const esAdministrador = (actor) => actor.roles.includes('ADMINISTRADOR');
const aFecha = (texto) => new Date(`${texto}T00:00:00.000Z`);
const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

function exigirDocente(actor) {
  if (!actor.docenteId)
    fail(403, 'NO_TEACHER_PROFILE', 'Tu cuenta no tiene un perfil docente asociado.');
}

// El dueño de una evaluación es el docente que hoy dicta la clase, no el que la creó:
// reasignar un curso crea otra asignación.
async function esDocenteVigente({ cursoId, seccionId }, actor, db) {
  if (!actor.docenteId) return false;
  return (
    (await planes.contarAsignacionesVigentes(
      { docenteId: actor.docenteId, cursoId, seccionId },
      db,
    )) > 0
  );
}

async function exigirGestion(evaluacion, actor, db) {
  exigirDocente(actor);
  if (!(await esDocenteVigente(evaluacion, actor, db)))
    fail(403, 'FORBIDDEN', 'Solo el docente que dicta esta clase gestiona sus evaluaciones.');
}

async function exigirEvaluacion(id, db) {
  const evaluacion = await repository.findEvaluacion(id, db);
  if (!evaluacion?.activo)
    fail(404, 'EVALUATION_NOT_FOUND', 'La evaluación no existe o fue eliminada.');
  return evaluacion;
}

function exigirFechaEnBimestre(fecha, bimestre) {
  exigirFechasBimestre(bimestre);
  if (fecha < aTexto(bimestre.fechaInicio) || fecha > aTexto(bimestre.fechaFin))
    fail(
      400,
      'INVALID_EVALUATION_DATE',
      `La fecha debe estar dentro del ${bimestre.nombre} (${aTexto(bimestre.fechaInicio)} a ${aTexto(bimestre.fechaFin)}).`,
    );
}

async function exigirCompetenciaDelCurso(competenciaId, cursoId, db) {
  const competencia = await repository.findCompetencia(competenciaId, db);
  if (!competencia?.activo || competencia.cursoId !== cursoId)
    fail(400, 'INVALID_COMPETENCY_CONTEXT', 'La competencia debe ser activa y del curso evaluado.');
}

const snapshotEvaluacion = (evaluacion) => ({
  id: evaluacion.id,
  cursoId: evaluacion.cursoId,
  seccionId: evaluacion.seccionId,
  bimestreId: evaluacion.bimestreId,
  competenciaId: evaluacion.competenciaId,
  titulo: evaluacion.titulo,
  descripcion: evaluacion.descripcion,
  fecha: aTexto(evaluacion.fecha),
  peso: evaluacion.peso,
  activo: evaluacion.activo,
});

const presentarEvaluacion = (evaluacion, totalAlumnos) => ({
  id: evaluacion.id,
  competenciaId: evaluacion.competenciaId,
  titulo: evaluacion.titulo,
  descripcion: evaluacion.descripcion,
  fecha: aTexto(evaluacion.fecha),
  peso: evaluacion.peso,
  avance: { registrados: evaluacion._count.resultados, total: totalAlumnos },
});

const archivosPublicos = (archivos) =>
  archivos.map(({ id, nombreOriginal, tipoMime, tamanoBytes }) => ({
    id,
    nombre: nombreOriginal,
    tipoMime,
    tamanoBytes,
  }));

export const presentarResultado = (resultado) =>
  resultado && {
    id: resultado.id,
    condicion: resultado.condicion,
    nota: numero(resultado.nota),
    motivo: resultado.motivo,
    comentario: resultado.comentario,
    archivos: archivosPublicos(resultado.archivos),
  };

const snapshotResultado = (resultado) => ({
  id: resultado.id,
  evaluacionId: resultado.evaluacionId,
  matriculaId: resultado.matriculaId,
  condicion: resultado.condicion,
  nota: numero(resultado.nota),
  motivo: resultado.motivo,
  comentario: resultado.comentario,
  activo: resultado.activo,
  archivos: resultado.archivos.map(({ nombreOriginal }) => nombreOriginal),
});

/** Datos de la clase y el bimestre: comunes a la lista y al alta. */
async function resolverClase({ seccionId, bimestreId }, db) {
  const [seccion, bimestre] = await Promise.all([
    repository.findSeccion(seccionId, db),
    repository.findBimestre(bimestreId, db),
  ]);
  if (!seccion) fail(404, 'SECTION_NOT_FOUND', 'La sección no existe.');
  if (!bimestre?.activo || bimestre.anioAcademicoId !== seccion.anioAcademicoId)
    fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año académico del salón.');
  return { seccion, bimestre };
}

function agruparCursos(asignaciones) {
  const cursos = new Map();
  for (const { curso } of asignaciones) if (!cursos.has(curso.id)) cursos.set(curso.id, curso);
  return [...cursos.values()];
}

export async function listarEvaluaciones({ seccionId, bimestreId, cursoId }, actor) {
  exigirDocente(actor);
  const asignaciones = await repository.listCursosDelDocente({
    docenteId: actor.docenteId,
    seccionId,
  });
  if (!asignaciones.length) fail(403, 'FORBIDDEN', 'Solo puedes consultar tus propios salones.');
  const { bimestre } = await resolverClase({ seccionId, bimestreId });
  const cursos = agruparCursos(asignaciones).filter(({ id }) => !cursoId || id === cursoId);
  const [evaluaciones, totalAlumnos, publicado] = await Promise.all([
    repository.listEvaluaciones({ seccionId, bimestreId, cursoIds: cursos.map(({ id }) => id) }),
    repository.countMatriculasActivas(seccionId),
    estaPublicada({ bimestreId, seccionId }),
  ]);
  return {
    bimestre: {
      id: bimestre.id,
      nombre: bimestre.nombre,
      fechaInicio: bimestre.fechaInicio && aTexto(bimestre.fechaInicio),
      fechaFin: bimestre.fechaFin && aTexto(bimestre.fechaFin),
      publicado,
    },
    totalAlumnos,
    cursos: cursos.map((curso) => ({
      id: curso.id,
      codigo: curso.codigo,
      nombre: curso.nombre,
      competencias: curso.competencias.map((competencia) => ({
        ...competencia,
        evaluaciones: evaluaciones
          .filter((item) => item.competenciaId === competencia.id)
          .map((item) => presentarEvaluacion(item, totalAlumnos)),
      })),
    })),
  };
}

export async function crearEvaluacion(input, actor, requestId) {
  exigirDocente(actor);
  const { bimestre } = await resolverClase(input);
  exigirFechaEnBimestre(input.fecha, bimestre);
  await exigirCompetenciaDelCurso(input.competenciaId, input.cursoId);
  return repository.transaction(async (db) => {
    await exigirSeccionSinPublicar(input, db);
    const asignacion = await repository.findAsignacionVigente(
      { docenteId: actor.docenteId, cursoId: input.cursoId, seccionId: input.seccionId },
      db,
    );
    if (!asignacion)
      fail(
        403,
        'FORBIDDEN',
        'Solo puedes crear evaluaciones de los cursos que dictas en este salón.',
      );
    const evaluacion = await repository.createEvaluacion(
      {
        asignacionId: asignacion.id,
        cursoId: input.cursoId,
        seccionId: input.seccionId,
        bimestreId: input.bimestreId,
        competenciaId: input.competenciaId,
        titulo: input.titulo,
        descripcion: input.descripcion ?? null,
        fecha: aFecha(input.fecha),
        peso: input.peso,
        creadoPorId: actor.id,
        modificadoPorId: actor.id,
      },
      db,
    );
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'EVALUACION_CREADA',
      entidad: 'Evaluacion',
      entidadId: evaluacion.id,
      nuevo: snapshotEvaluacion(evaluacion),
      requestId,
    });
    return presentarEvaluacion(
      evaluacion,
      await repository.countMatriculasActivas(input.seccionId, db),
    );
  });
}

/**
 * Secuencia común para cambiar una evaluación: candados en el mismo orden que el registro de
 * resultados (sección, escala, evaluación), cambio, recálculo y auditoría en una transacción.
 */
async function cambiarEvaluacion(id, actor, operacion) {
  await exigirGestion(await exigirEvaluacion(id), actor);
  return repository.transaction(async (db) => {
    const encontrada = await exigirEvaluacion(id, db);
    await exigirSeccionSinPublicar(encontrada, db);
    const escala = await escalaParaCalcular(db);
    await repository.bloquearEvaluacion(id, db);
    const anterior = await exigirEvaluacion(id, db);
    await exigirGestion(anterior, actor, db);
    const recalcular = async (evaluacion) => {
      const matriculas = await repository.listMatriculasActivas(evaluacion.seccionId, db);
      return recalcularCompetencia(
        {
          bimestreId: evaluacion.bimestreId,
          cursoId: evaluacion.cursoId,
          seccionId: evaluacion.seccionId,
          competenciaId: evaluacion.competenciaId,
          asignacionId: evaluacion.asignacionId,
        },
        matriculas.map(({ id: matriculaId }) => matriculaId),
        escala,
        actor,
        db,
      );
    };
    return operacion({ anterior, db, recalcular });
  });
}

export function modificarEvaluacion(id, input, actor, requestId) {
  return cambiarEvaluacion(id, actor, async ({ anterior, db, recalcular }) => {
    if (input.fecha) exigirFechaEnBimestre(input.fecha, anterior.bimestre);
    if (input.competenciaId && input.competenciaId !== anterior.competenciaId) {
      if (anterior._count.resultados)
        fail(
          409,
          'EVALUATION_HAS_RESULTS',
          'La evaluación ya tiene resultados: no se puede cambiar su competencia.',
        );
      await exigirCompetenciaDelCurso(input.competenciaId, anterior.cursoId, db);
    }
    const evaluacion = await repository.updateEvaluacion(
      id,
      {
        ...Object.fromEntries(Object.entries(input).filter(([, valor]) => valor !== undefined)),
        ...(input.fecha && { fecha: aFecha(input.fecha) }),
        modificadoPorId: actor.id,
      },
      db,
    );
    const letrasRecalculadas = evaluacion.peso !== anterior.peso ? await recalcular(evaluacion) : 0;
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'EVALUACION_MODIFICADA',
      entidad: 'Evaluacion',
      entidadId: id,
      anterior: snapshotEvaluacion(anterior),
      nuevo: snapshotEvaluacion(evaluacion),
      contexto: { letrasRecalculadas },
      requestId,
    });
    return presentarEvaluacion(
      evaluacion,
      await repository.countMatriculasActivas(evaluacion.seccionId, db),
    );
  });
}

export function eliminarEvaluacion(id, actor, requestId) {
  return cambiarEvaluacion(id, actor, async ({ anterior, db, recalcular }) => {
    const resultadosDesactivados = await repository.darDeBajaResultadosDeEvaluacion(
      id,
      actor.id,
      db,
    );
    const evaluacion = await repository.updateEvaluacion(
      id,
      { activo: false, modificadoPorId: actor.id },
      db,
    );
    const letrasRecalculadas = await recalcular(evaluacion);
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'EVALUACION_DADA_DE_BAJA',
      entidad: 'Evaluacion',
      entidadId: id,
      anterior: snapshotEvaluacion(anterior),
      nuevo: snapshotEvaluacion(evaluacion),
      contexto: { resultadosDesactivados, letrasRecalculadas },
      requestId,
    });
  });
}

export async function listarPendientes(id, actor) {
  const evaluacion = await exigirEvaluacion(id);
  await exigirGestion(evaluacion, actor);
  const matriculas = await repository.listMatriculasPendientes({
    evaluacionId: id,
    seccionId: evaluacion.seccionId,
  });
  return matriculas.map(({ id: matriculaId, estudiante }) => ({
    matriculaId,
    codigo: estudiante.codigoEstudiante,
    nombre: `${estudiante.persona.nombres} ${estudiante.persona.apellidos}`,
  }));
}

/** La nota llega como texto del formulario: de 0 a 20, con hasta dos decimales. */
function leerNota(nota) {
  const texto = String(nota ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(texto) || Number(texto) > NOTA_MAXIMA)
    fail(
      400,
      'INVALID_GRADE',
      `La nota debe ser un número de 0 a ${NOTA_MAXIMA} con hasta dos decimales.`,
    );
  return texto;
}

function validarEntradaResultado(input, archivos) {
  if (input.condicion === 'CALIFICADA') return { nota: leerNota(input.nota), motivo: null };
  if (archivos.length)
    fail(400, 'VALIDATION_ERROR', 'Solo una evaluación calificada lleva el examen corregido.');
  if (input.condicion === 'JUSTIFICADA' && !input.motivo)
    fail(400, 'REASON_REQUIRED', 'Escribe el motivo de la justificación.');
  return { nota: null, motivo: input.condicion === 'JUSTIFICADA' ? input.motivo : null };
}

// Los archivos que quedarán activos tras el cambio. Una nota exige de 1 a 3; las demás
// condiciones no llevan ninguno.
function exigirArchivosFinales({ condicion, existentes, quitados, nuevos }) {
  const desconocido = quitados.find((id) => !existentes.some((archivo) => archivo.id === id));
  if (desconocido) fail(404, 'FILE_NOT_FOUND', 'El archivo no existe o ya fue retirado.');
  if (condicion !== 'CALIFICADA') return;
  const total = existentes.length - quitados.length + nuevos;
  if (!total)
    fail(400, 'FILE_REQUIRED', 'Adjunta el examen corregido del alumno para registrar su nota.');
  if (total > MAX_ARCHIVOS_EVIDENCIA)
    fail(
      400,
      'TOO_MANY_FILES',
      `Puedes adjuntar hasta ${MAX_ARCHIVOS_EVIDENCIA} archivos por nota.`,
    );
}

async function exigirMatriculaDeLaClase(matriculaId, evaluacion, db) {
  const matricula = await repository.findMatricula(matriculaId, db);
  if (!matricula?.activo || matricula.seccionId !== evaluacion.seccionId)
    fail(
      400,
      'INVALID_ENROLLMENT_CONTEXT',
      'El alumno no está matriculado en el salón de esta evaluación.',
    );
}

const claseDeLogro = (evaluacion, matriculaId) => ({
  matriculaId,
  bimestreId: evaluacion.bimestreId,
  cursoId: evaluacion.cursoId,
  seccionId: evaluacion.seccionId,
  competenciaId: evaluacion.competenciaId,
  asignacionId: evaluacion.asignacionId,
});

/** Sección, escala, evaluación y alumno: el orden en que toda escritura de notas toma candados. */
async function conResultadoBloqueado(evaluacionId, matriculaId, actor, operacion) {
  return repository.transaction(async (db) => {
    const encontrada = await exigirEvaluacion(evaluacionId, db);
    await exigirSeccionSinPublicar(encontrada, db);
    const escala = await escalaParaCalcular(db);
    await repository.bloquearEvaluacionCompartida(evaluacionId, db);
    const evaluacion = await exigirEvaluacion(evaluacionId, db);
    await exigirGestion(evaluacion, actor, db);
    await exigirMatriculaDeLaClase(matriculaId, evaluacion, db);
    await repository.bloquearResultado({ evaluacionId, matriculaId }, db);
    const anterior = await repository.findResultadoActivo({ evaluacionId, matriculaId }, db);
    return operacion({ db, escala, evaluacion, anterior });
  });
}

export async function registrarResultado(
  evaluacionId,
  matriculaId,
  input,
  archivos,
  actor,
  requestId,
) {
  const evaluacion = await exigirEvaluacion(evaluacionId);
  await exigirGestion(evaluacion, actor);
  await exigirMatriculaDeLaClase(matriculaId, evaluacion);
  const { nota, motivo } = validarEntradaResultado(input, archivos);
  const preparados = prepararArchivos(archivos);
  return conArchivosEnDisco(preparados, actor, (registros) =>
    conResultadoBloqueado(
      evaluacionId,
      matriculaId,
      actor,
      async ({ db, escala, evaluacion, anterior }) => {
        exigirArchivosFinales({
          condicion: input.condicion,
          existentes: anterior?.archivos ?? [],
          quitados: input.archivosQuitados,
          nuevos: registros.length,
        });
        const datos = {
          condicion: input.condicion,
          nota,
          motivo,
          comentario: input.comentario ?? null,
          modificadoPorId: actor.id,
        };
        const { id } = anterior
          ? await repository.updateResultado(anterior.id, datos, db)
          : await repository.createResultado(
              { ...datos, evaluacionId, matriculaId, creadoPorId: actor.id },
              db,
            );
        if (anterior) {
          // Sin nota no hay examen: cambiar a otra condición retira los archivos.
          const ids = input.condicion === 'CALIFICADA' ? input.archivosQuitados : undefined;
          if (!ids || ids.length) await repository.darDeBajaArchivos({ resultadoId: id, ids }, db);
        }
        if (registros.length)
          await repository.createArchivos(
            registros.map((registro) => ({ ...registro, resultadoId: id })),
            db,
          );
        const logro = await recalcularLogro(
          claseDeLogro(evaluacion, matriculaId),
          escala,
          actor,
          db,
        );
        const resultado = await repository.findResultado(id, db);
        await registrarTransaccionCritica(db, {
          actorId: actor.id,
          evento: anterior ? 'RESULTADO_EVALUACION_MODIFICADO' : 'RESULTADO_EVALUACION_REGISTRADO',
          entidad: 'ResultadoEvaluacion',
          entidadId: id,
          anterior: anterior && snapshotResultado(anterior),
          nuevo: snapshotResultado(resultado),
          contexto: {
            competenciaId: evaluacion.competenciaId,
            logroAnterior: logro.anterior,
            logroNuevo: logro.nuevo,
          },
          requestId,
        });
        return { resultado: presentarResultado(resultado), logro: logro.nuevo };
      },
    ),
  );
}

export async function quitarResultado(evaluacionId, matriculaId, actor, requestId) {
  await exigirGestion(await exigirEvaluacion(evaluacionId), actor);
  return conResultadoBloqueado(
    evaluacionId,
    matriculaId,
    actor,
    async ({ db, escala, evaluacion, anterior }) => {
      if (!anterior)
        fail(404, 'RESULT_NOT_FOUND', 'El alumno no tiene un resultado en esta evaluación.');
      await repository.darDeBajaArchivos({ resultadoId: anterior.id }, db);
      await repository.updateResultado(
        anterior.id,
        { activo: false, modificadoPorId: actor.id },
        db,
      );
      const logro = await recalcularLogro(claseDeLogro(evaluacion, matriculaId), escala, actor, db);
      await registrarTransaccionCritica(db, {
        actorId: actor.id,
        evento: 'RESULTADO_EVALUACION_DADO_DE_BAJA',
        entidad: 'ResultadoEvaluacion',
        entidadId: anterior.id,
        anterior: snapshotResultado(anterior),
        nuevo: { ...snapshotResultado(anterior), activo: false, archivos: [] },
        contexto: {
          competenciaId: evaluacion.competenciaId,
          logroAnterior: logro.anterior,
          logroNuevo: logro.nuevo,
        },
        requestId,
      });
    },
  );
}

export async function descargarArchivo({ id, matriculaId, archivoId }, actor) {
  const evaluacion = await exigirEvaluacion(id);
  if (!esAdministrador(actor)) await exigirGestion(evaluacion, actor);
  const resultado = await repository.findResultadoActivo({ evaluacionId: id, matriculaId });
  const archivo = resultado?.archivos.find((item) => item.id === archivoId);
  if (!archivo) fail(404, 'FILE_NOT_FOUND', 'El archivo no existe o ya fue retirado.');
  return leerArchivoRegistrado(archivo, {
    module: 'evaluaciones',
    evaluacionId: id,
    matriculaId,
    archivoId,
  });
}
