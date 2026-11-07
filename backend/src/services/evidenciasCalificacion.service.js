import * as repository from '../repositories/evidenciasCalificacion.repository.js';
import * as almacen from '../integrations/almacenEvidencias.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import {
  comprobarSinPublicar,
  estaPublicada,
  exigirMotivoSiPublicada,
  exigirSeccionSinPublicar,
} from './publicacionSeccion.service.js';
import {
  MAX_ARCHIVOS_EVIDENCIA,
  detectarTipoArchivo,
  normalizarNombreArchivo,
} from '../domain/archivoEvidencia.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const esAdministrador = (actor) => actor.roles.includes('ADMINISTRADOR');

const ubicacion = (nota) => ({
  bimestreId: nota.calificacion.bimestreId,
  seccionId: nota.calificacion.matricula.seccionId,
});

function presentar(evidencia) {
  return {
    id: evidencia.id,
    titulo: evidencia.titulo,
    descripcion: evidencia.descripcion,
    nivelLogroRegistrado: evidencia.nivelLogroRegistrado,
    activo: evidencia.activo,
    creadoEn: evidencia.creadoEn,
    archivos: evidencia.archivos.map(({ id, nombreOriginal, tipoMime, tamanoBytes }) => ({
      id,
      nombre: nombreOriginal,
      tipoMime,
      tamanoBytes,
    })),
  };
}

function snapshot(evidencia) {
  return {
    id: evidencia.id,
    calificacionCompetenciaId: evidencia.calificacionCompetenciaId,
    titulo: evidencia.titulo,
    descripcion: evidencia.descripcion,
    nivelLogroRegistrado: evidencia.nivelLogroRegistrado,
    activo: evidencia.activo,
    archivos: evidencia.archivos.map(({ nombreOriginal }) => nombreOriginal),
  };
}

function contexto(nota) {
  const { calificacion, competencia } = nota;
  const { persona, codigoEstudiante } = calificacion.matricula.estudiante;
  return {
    alumno: { nombre: `${persona.nombres} ${persona.apellidos}`, codigo: codigoEstudiante },
    curso: calificacion.asignacion.curso,
    competencia,
    bimestre: calificacion.bimestre,
    nivelActual: nota.nivelLogro,
  };
}

// Vale el curso y la sección, no el id de asignación: reasignar un curso crea otra asignación y
// la nota sigue ligada a la anterior.
async function esDocenteVigente(nota, actor, db) {
  if (!actor.docenteId) return false;
  const total = await repository.contarAsignacionesVigentes(
    {
      docenteId: actor.docenteId,
      cursoId: nota.calificacion.asignacion.curso.id,
      seccionId: nota.calificacion.matricula.seccionId,
    },
    db,
  );
  return total > 0;
}

async function exigirConsulta(nota, actor) {
  if (!esAdministrador(actor) && !(await esDocenteVigente(nota, actor)))
    fail(403, 'FORBIDDEN', 'No tienes permiso para consultar esta evidencia.');
}

async function exigirDocenteVigente(nota, actor, db) {
  if (!(await esDocenteVigente(nota, actor, db)))
    fail(403, 'FORBIDDEN', 'Solo el docente del curso puede modificar esta evidencia.');
}

async function exigirNota(id, db) {
  const nota = await repository.findNota(id, db);
  if (!nota?.activo || !nota.calificacion.activo)
    fail(404, 'GRADE_DETAIL_NOT_FOUND', 'La calificación no existe o está inactiva.');
  return nota;
}

async function exigirEvidencia(id, db) {
  const evidencia = await repository.findEvidencia(id, db);
  if (!evidencia) fail(404, 'EVIDENCE_NOT_FOUND', 'La evidencia no existe.');
  return evidencia;
}

function exigirActiva(evidencia) {
  if (!evidencia.activo)
    fail(409, 'EVIDENCE_INACTIVE', 'Esta evidencia fue dada de baja y ya no se puede modificar.');
}

function exigirContenido({ descripcion, totalArchivos }) {
  if (!descripcion && !totalArchivos)
    fail(400, 'EVIDENCE_EMPTY', 'La evidencia necesita una descripción o al menos un archivo.');
}

function exigirCupo(total) {
  if (total > MAX_ARCHIVOS_EVIDENCIA)
    fail(
      400,
      'TOO_MANY_FILES',
      `Puedes adjuntar hasta ${MAX_ARCHIVOS_EVIDENCIA} archivos por evidencia.`,
    );
}

function prepararArchivos(archivos) {
  return archivos.map(({ buffer, originalname, size }) => {
    const tipoMime = detectarTipoArchivo(buffer);
    if (!tipoMime) fail(400, 'FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan archivos PDF, JPG o PNG.');
    return {
      contenido: buffer,
      nombreOriginal: normalizarNombreArchivo(originalname),
      tipoMime,
      tamanoBytes: size,
    };
  });
}

/**
 * Escribir hasta 15 MB dentro de una transacción arriesgaría su tiempo límite, así que los archivos
 * van primero a disco. Si la operación falla después, se borran para no dejar huérfanos.
 */
async function conArchivosEnDisco(archivos, actor, operacion) {
  const nombres = await almacen.guardarArchivos(archivos.map(({ contenido }) => contenido));
  const registros = archivos.map(({ nombreOriginal, tipoMime, tamanoBytes }, indice) => ({
    nombreOriginal,
    tipoMime,
    tamanoBytes,
    nombreAlmacenado: nombres[indice],
    creadoPorId: actor.id,
  }));
  try {
    return await operacion(registros);
  } catch (error) {
    await almacen.borrarArchivos(nombres);
    throw error;
  }
}

export async function listarEvidencias(calificacionCompetenciaId, actor) {
  const nota = await exigirNota(calificacionCompetenciaId);
  await exigirConsulta(nota, actor);
  const [evidencias, publicado] = await Promise.all([
    repository.listEvidencias(calificacionCompetenciaId),
    estaPublicada(ubicacion(nota)),
  ]);
  return { contexto: contexto(nota), publicado, evidencias: evidencias.map(presentar) };
}

export async function crearEvidencia(calificacionCompetenciaId, input, archivos, actor, requestId) {
  const nota = await exigirNota(calificacionCompetenciaId);
  await exigirDocenteVigente(nota, actor);
  await comprobarSinPublicar(ubicacion(nota));
  const descripcion = input.descripcion ?? null;
  exigirContenido({ descripcion, totalArchivos: archivos.length });
  const preparados = prepararArchivos(archivos);
  const creada = await conArchivosEnDisco(preparados, actor, (registros) =>
    repository.transaction(async (db) => {
      const actual = await exigirNota(calificacionCompetenciaId, db);
      await exigirSeccionSinPublicar(ubicacion(actual), db);
      const evidencia = await repository.createEvidencia(
        {
          calificacionCompetenciaId,
          titulo: input.titulo,
          descripcion,
          nivelLogroRegistrado: actual.nivelLogro,
          creadoPorId: actor.id,
          modificadoPorId: actor.id,
          archivos: registros,
        },
        db,
      );
      await registrarTransaccionCritica(db, {
        actorId: actor.id,
        evento: 'EVIDENCIA_CALIFICACION_REGISTRADA',
        entidad: 'EvidenciaCalificacion',
        entidadId: evidencia.id,
        nuevo: snapshot(evidencia),
        requestId,
      });
      return evidencia;
    }),
  );
  return presentar(creada);
}

// Secuencia común al cambiar una evidencia existente: permisos, bloqueos, cambio y auditoría.
async function modificarEnTransaccion(id, actor, requestId, operacion) {
  return repository.transaction(async (db) => {
    const encontrada = await exigirEvidencia(id, db);
    await exigirDocenteVigente(encontrada.calificacionCompetencia, actor, db);
    await exigirSeccionSinPublicar(ubicacion(encontrada.calificacionCompetencia), db);
    await repository.bloquearEvidencia(id, db);
    const anterior = await exigirEvidencia(id, db);
    exigirActiva(anterior);
    await operacion(anterior, db);
    const evidencia = await exigirEvidencia(id, db);
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'EVIDENCIA_CALIFICACION_MODIFICADA',
      entidad: 'EvidenciaCalificacion',
      entidadId: id,
      anterior: snapshot(anterior),
      nuevo: snapshot(evidencia),
      requestId,
    });
    return presentar(evidencia);
  });
}

export function modificarEvidencia(id, input, actor, requestId) {
  return modificarEnTransaccion(id, actor, requestId, async (anterior, db) => {
    const descripcion = input.descripcion === undefined ? anterior.descripcion : input.descripcion;
    exigirContenido({ descripcion, totalArchivos: anterior.archivos.length });
    await repository.updateEvidencia(
      id,
      {
        ...(input.titulo !== undefined && { titulo: input.titulo }),
        descripcion,
        modificadoPorId: actor.id,
      },
      db,
    );
  });
}

export async function agregarArchivos(id, archivos, actor, requestId) {
  if (!archivos.length) fail(400, 'VALIDATION_ERROR', 'Adjunta al menos un archivo.');
  const encontrada = await exigirEvidencia(id);
  await exigirDocenteVigente(encontrada.calificacionCompetencia, actor);
  await comprobarSinPublicar(ubicacion(encontrada.calificacionCompetencia));
  exigirActiva(encontrada);
  exigirCupo(encontrada.archivos.length + archivos.length);
  const preparados = prepararArchivos(archivos);
  return conArchivosEnDisco(preparados, actor, (registros) =>
    modificarEnTransaccion(id, actor, requestId, async (anterior, db) => {
      exigirCupo(anterior.archivos.length + registros.length);
      await repository.createArchivos(
        registros.map((registro) => ({ ...registro, evidenciaId: id })),
        db,
      );
      await repository.updateEvidencia(id, { modificadoPorId: actor.id }, db);
    }),
  );
}

export function quitarArchivo(id, archivoId, actor, requestId) {
  return modificarEnTransaccion(id, actor, requestId, async (anterior, db) => {
    if (!anterior.archivos.some((archivo) => archivo.id === archivoId))
      fail(404, 'FILE_NOT_FOUND', 'El archivo no existe o ya fue retirado.');
    exigirContenido({
      descripcion: anterior.descripcion,
      totalArchivos: anterior.archivos.length - 1,
    });
    await repository.darDeBajaArchivo(archivoId, db);
    await repository.updateEvidencia(id, { modificadoPorId: actor.id }, db);
  });
}

export async function darDeBajaEvidencia(id, motivo, actor, requestId) {
  return repository.transaction(async (db) => {
    const encontrada = await exigirEvidencia(id, db);
    const nota = encontrada.calificacionCompetencia;
    if (esAdministrador(actor)) await exigirMotivoSiPublicada({ ...ubicacion(nota), motivo }, db);
    else {
      await exigirDocenteVigente(nota, actor, db);
      await exigirSeccionSinPublicar(ubicacion(nota), db);
    }
    await repository.bloquearEvidencia(id, db);
    const anterior = await exigirEvidencia(id, db);
    exigirActiva(anterior);
    const evidencia = await repository.updateEvidencia(
      id,
      { activo: false, modificadoPorId: actor.id },
      db,
    );
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'EVIDENCIA_CALIFICACION_DADA_DE_BAJA',
      entidad: 'EvidenciaCalificacion',
      entidadId: id,
      anterior: snapshot(anterior),
      nuevo: snapshot(evidencia),
      motivo,
      requestId,
    });
    return presentar(evidencia);
  });
}

export async function descargarArchivo(id, archivoId, actor) {
  const evidencia = await exigirEvidencia(id);
  await exigirConsulta(evidencia.calificacionCompetencia, actor);
  const archivo = evidencia.archivos.find((item) => item.id === archivoId);
  if (!archivo) fail(404, 'FILE_NOT_FOUND', 'El archivo no existe o ya fue retirado.');
  const contenido = await almacen.leerArchivo(archivo.nombreAlmacenado);
  if (!contenido) {
    logger.error('Falta en disco un archivo de evidencia', {
      module: 'evidencias',
      evidenciaId: id,
      archivoId,
    });
    fail(404, 'FILE_NOT_FOUND', 'El archivo no está disponible.');
  }
  return { contenido, nombre: archivo.nombreOriginal, tipoMime: archivo.tipoMime };
}
