import * as repository from '../repositories/evidenciasPedagogicas.repository.js';
import * as planes from '../repositories/planesAcademicos.repository.js';
import * as libretas from '../repositories/libretas.repository.js';
import * as almacen from '../integrations/almacenEvidencias.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import { filtrosEstudiantesAutorizados } from './portal.service.js';
import {
  agruparPorSemana,
  esAdministrador,
  esDocenteVigente,
  exigirConsultaPlan,
  exigirFechasBimestre,
  exigirGestionPlan,
  exigirPlanActivo,
  presentarBimestre,
  presentarClase,
  presentarEvidenciaResumida,
} from './planesAcademicos.service.js';
import {
  MAX_ARCHIVOS_EVIDENCIA,
  detectarTipoArchivo,
  normalizarNombreArchivo,
} from '../domain/archivoEvidencia.js';
import { aTexto, estaCerrado, hoyEnLima, totalSemanas } from '../domain/semanasBimestre.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const esFamilia = (actor) => actor.roles.some((rol) => ['ALUMNO', 'APODERADO'].includes(rol));
const texto = (valor) => valor && aTexto(valor);

// Lo que un alumno o apoderado puede ver: lo realizado que la coordinación no observó.
const VISIBLE_PARA_FAMILIA = { estado: 'REALIZADA', estadoRevision: { not: 'OBSERVADA' } };
const visibleParaFamilia = (evidencia) =>
  evidencia.activo && evidencia.estado === 'REALIZADA' && evidencia.estadoRevision !== 'OBSERVADA';

const archivosPublicos = (evidencia) =>
  evidencia.archivos.map(({ id, nombreOriginal, tipoMime, tamanoBytes }) => ({
    id,
    nombre: nombreOriginal,
    tipoMime,
    tamanoBytes,
  }));

function presentar(evidencia) {
  return {
    ...presentarEvidenciaResumida(evidencia),
    planId: evidencia.planId,
    enlaces: evidencia.enlaces,
    fechaRevision: evidencia.fechaRevision,
    activo: evidencia.activo,
    archivos: archivosPublicos(evidencia),
  };
}

// Salida mínima para la familia: sin datos de la revisión ni del docente.
const presentarParaFamilia = (evidencia) => ({
  id: evidencia.id,
  numeroSemana: evidencia.numeroSemana,
  tipo: evidencia.tipo,
  titulo: evidencia.titulo,
  descripcion: evidencia.descripcion,
  fechaRealizacion: texto(evidencia.fechaRealizacion),
  enlaces: evidencia.enlaces,
  archivos: archivosPublicos(evidencia),
});

const snapshot = (evidencia) => ({
  id: evidencia.id,
  planId: evidencia.planId,
  numeroSemana: evidencia.numeroSemana,
  tipo: evidencia.tipo,
  titulo: evidencia.titulo,
  descripcion: evidencia.descripcion,
  estado: evidencia.estado,
  fechaRealizacion: evidencia.fechaRealizacion,
  enlaces: evidencia.enlaces,
  estadoRevision: evidencia.estadoRevision,
  observacionesRevision: evidencia.observacionesRevision,
  activo: evidencia.activo,
  archivos: evidencia.archivos.map(({ nombreOriginal }) => nombreOriginal),
});

async function exigirEvidencia(id, db) {
  const evidencia = await repository.findEvidencia(id, db);
  if (!evidencia) fail(404, 'EVIDENCE_NOT_FOUND', 'La actividad no existe.');
  return evidencia;
}

function exigirActiva(evidencia) {
  if (!evidencia.activo || !evidencia.plan.activo)
    fail(409, 'EVIDENCE_INACTIVE', 'Esta actividad fue dada de baja y ya no se puede modificar.');
}

function exigirSemana(numeroSemana, bimestre) {
  exigirFechasBimestre(bimestre);
  const total = totalSemanas(bimestre);
  if (numeroSemana > total)
    fail(400, 'INVALID_WEEK', `El ${bimestre.nombre} tiene ${total} semanas.`);
}

/**
 * Pasado el fin del bimestre, el docente ya no cambia nada; el administrador sí, pero
 * dejando el motivo en la auditoría. Una actividad validada solo la cambia el administrador.
 */
function exigirEdicionPermitida({ bimestre, evidencia, actor, motivo }) {
  const cerrado = estaCerrado(bimestre);
  if (esAdministrador(actor)) {
    if (cerrado && !motivo)
      fail(400, 'REASON_REQUIRED', 'El bimestre ya terminó: indica el motivo del cambio.');
    return;
  }
  if (cerrado) fail(409, 'TERM_CLOSED', 'El bimestre ya terminó: el plan queda en solo lectura.');
  if (evidencia?.estadoRevision === 'VALIDADA')
    fail(
      409,
      'EVIDENCE_VALIDATED',
      'La coordinación ya validó esta actividad; no se puede modificar.',
    );
}

function exigirCupo(total) {
  if (total > MAX_ARCHIVOS_EVIDENCIA)
    fail(
      400,
      'TOO_MANY_FILES',
      `Puedes adjuntar hasta ${MAX_ARCHIVOS_EVIDENCIA} archivos por actividad.`,
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
 * Los archivos van primero a disco (escribirlos dentro de la transacción arriesgaría su
 * tiempo límite) y se borran si la operación falla después: nunca queda una fila sin su
 * archivo ni un archivo sin su fila.
 */
async function conArchivosEnDisco(archivos, actor, operacion) {
  if (!archivos.length) return operacion([]);
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

async function exigirMatriculaVisible(matriculaId, actor) {
  const filtros = filtrosEstudiantesAutorizados(actor);
  if (!filtros.length)
    fail(403, 'FORBIDDEN', 'Solo el alumno y su apoderado consultan estas actividades.');
  const matricula = await libretas.findMatricula(matriculaId);
  if (!matricula) fail(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe.');
  const autorizado = await libretas.countEstudiantes({ id: matricula.estudianteId, OR: filtros });
  if (!autorizado)
    fail(
      403,
      'STUDENT_FORBIDDEN',
      'Solo puedes consultar tus datos o los de tus hijos vinculados.',
    );
  return matricula;
}

async function listarParaFamilia({ matriculaId, cursoId, bimestreId }, actor) {
  if (!matriculaId || !cursoId || !bimestreId)
    fail(400, 'VALIDATION_ERROR', 'Indica la matrícula, el curso y el bimestre.');
  const matricula = await exigirMatriculaVisible(matriculaId, actor);
  const bimestre = await planes.findBimestre(bimestreId);
  if (!bimestre?.activo || bimestre.anioAcademicoId !== matricula.anioAcademicoId)
    fail(404, 'TERM_NOT_FOUND', 'El bimestre no corresponde a esta matrícula.');
  const plan = await planes.findPlanActivoDeClase({
    cursoId,
    seccionId: matricula.seccionId,
    bimestreId,
  });
  const evidencias = plan
    ? await repository.listEvidencias({ planId: plan.id, ...VISIBLE_PARA_FAMILIA })
    : [];
  return {
    bimestre: presentarBimestre(bimestre),
    curso: plan ? presentarClase(plan).curso : null,
    semanas: agruparPorSemana(bimestre, evidencias, presentarParaFamilia),
  };
}

export async function listarEvidencias(filtros, actor) {
  if (esFamilia(actor) && !esAdministrador(actor) && !actor.roles.includes('DOCENTE'))
    return listarParaFamilia(filtros, actor);
  if (!filtros.planId) fail(400, 'VALIDATION_ERROR', 'Indica el plan de trabajo.');
  const plan = await exigirPlanActivo(filtros.planId);
  await exigirConsultaPlan(plan, actor);
  const evidencias = await repository.listEvidencias({
    planId: plan.id,
    ...(filtros.numeroSemana && { numeroSemana: filtros.numeroSemana }),
    ...(filtros.estado && { estado: filtros.estado }),
  });
  return evidencias.map(presentar);
}

async function exigirConsulta(evidencia, actor) {
  if (esAdministrador(actor) || (await esDocenteVigente(evidencia.plan, actor))) return 'gestion';
  if (esFamilia(actor) && visibleParaFamilia(evidencia) && evidencia.plan.activo) {
    const filtros = filtrosEstudiantesAutorizados(actor);
    const autorizado = await libretas.countEstudiantes({
      OR: filtros,
      matriculas: { some: { seccionId: evidencia.plan.seccionId } },
    });
    if (autorizado) return 'familia';
  }
  fail(403, 'FORBIDDEN', 'No tienes permiso para consultar esta actividad.');
}

export async function obtenerEvidencia(id, actor) {
  const evidencia = await exigirEvidencia(id);
  const alcance = await exigirConsulta(evidencia, actor);
  return alcance === 'familia' ? presentarParaFamilia(evidencia) : presentar(evidencia);
}

export async function crearEvidencia(input, archivos, actor, requestId) {
  const plan = await exigirPlanActivo(input.planId);
  await exigirGestionPlan(plan, actor);
  exigirSemana(input.numeroSemana, plan.bimestre);
  exigirEdicionPermitida({ bimestre: plan.bimestre, actor, motivo: input.motivo });
  exigirCupo(archivos.length);
  const preparados = prepararArchivos(archivos);
  const creada = await conArchivosEnDisco(preparados, actor, (registros) =>
    planes.transaction(async (db) => {
      // Con el plan bloqueado, nadie cambia las fechas del bimestre ni lo desactiva a mitad.
      await planes.bloquearPlan(plan.id, db);
      const actual = await exigirPlanActivo(plan.id, db);
      await exigirGestionPlan(actual, actor, db);
      exigirSemana(input.numeroSemana, actual.bimestre);
      exigirEdicionPermitida({ bimestre: actual.bimestre, actor, motivo: input.motivo });
      const evidencia = await repository.createEvidencia(
        {
          planId: actual.id,
          numeroSemana: input.numeroSemana,
          tipo: input.tipo,
          titulo: input.titulo,
          descripcion: input.descripcion ?? null,
          enlaces: input.enlaces,
          ...(input.realizada && {
            estado: 'REALIZADA',
            fechaRealizacion: new Date(`${hoyEnLima()}T00:00:00.000Z`),
          }),
          creadoPorId: actor.id,
          modificadoPorId: actor.id,
          archivos: registros,
        },
        db,
      );
      await registrarTransaccionCritica(db, {
        actorId: actor.id,
        evento: 'EVIDENCIA_PEDAGOGICA_REGISTRADA',
        entidad: 'EvidenciaPedagogica',
        entidadId: evidencia.id,
        nuevo: snapshot(evidencia),
        motivo: input.motivo,
        requestId,
      });
      return evidencia;
    }),
  );
  return presentar(creada);
}

// Secuencia común para cambiar una actividad: permisos, bloqueo, cambio y auditoría, todo
// en la misma transacción.
async function cambiarEnTransaccion(id, { actor, motivo, requestId, evento }, operacion, db) {
  const encontrada = await exigirEvidencia(id, db);
  await exigirGestionPlan(encontrada.plan, actor, db);
  await repository.bloquearEvidencia(id, db);
  const anterior = await exigirEvidencia(id, db);
  exigirActiva(anterior);
  exigirEdicionPermitida({ bimestre: anterior.plan.bimestre, evidencia: anterior, actor, motivo });
  const eventoFinal = (await operacion(anterior, db)) ?? evento;
  const evidencia = await exigirEvidencia(id, db);
  await registrarTransaccionCritica(db, {
    actorId: actor.id,
    evento: eventoFinal,
    entidad: 'EvidenciaPedagogica',
    entidadId: id,
    anterior: snapshot(anterior),
    nuevo: snapshot(evidencia),
    motivo,
    requestId,
  });
  return presentar(evidencia);
}

export async function modificarEvidencia(id, input, archivos, actor, requestId) {
  const { motivo, estado, ...cambios } = input;
  const hayCambios = Object.values(cambios).some((valor) => valor !== undefined);
  if (!hayCambios && !estado && !archivos.length)
    fail(400, 'VALIDATION_ERROR', 'Indica al menos un dato para actualizar.');
  const encontrada = await exigirEvidencia(id);
  await exigirGestionPlan(encontrada.plan, actor);
  exigirActiva(encontrada);
  exigirEdicionPermitida({
    bimestre: encontrada.plan.bimestre,
    evidencia: encontrada,
    actor,
    motivo,
  });
  if (cambios.numeroSemana) exigirSemana(cambios.numeroSemana, encontrada.plan.bimestre);
  exigirCupo(encontrada._count.archivos + archivos.length);
  const preparados = prepararArchivos(archivos);
  return conArchivosEnDisco(preparados, actor, (registros) =>
    repository.transaction((db) =>
      cambiarEnTransaccion(
        id,
        { actor, motivo, requestId, evento: 'EVIDENCIA_PEDAGOGICA_MODIFICADA' },
        async (anterior, db) => {
          if (cambios.numeroSemana) exigirSemana(cambios.numeroSemana, anterior.plan.bimestre);
          exigirCupo(anterior._count.archivos + registros.length);
          const pasaARealizada = estado === 'REALIZADA' && anterior.estado !== 'REALIZADA';
          if (registros.length)
            await repository.createArchivos(
              registros.map((registro) => ({ ...registro, evidenciaId: id })),
              db,
            );
          await repository.updateEvidencia(
            id,
            {
              ...Object.fromEntries(
                Object.entries(cambios).filter(([, valor]) => valor !== undefined),
              ),
              ...(pasaARealizada && {
                estado: 'REALIZADA',
                fechaRealizacion: new Date(`${hoyEnLima()}T00:00:00.000Z`),
              }),
              modificadoPorId: actor.id,
            },
            db,
          );
          return pasaARealizada ? 'EVIDENCIA_PEDAGOGICA_REALIZADA' : undefined;
        },
        db,
      ),
    ),
  );
}

export async function revisarEvidencia(id, input, actor, requestId) {
  if (!esAdministrador(actor)) fail(403, 'FORBIDDEN', 'Solo la coordinación revisa actividades.');
  return repository.transaction(async (db) => {
    await exigirEvidencia(id, db);
    await repository.bloquearEvidencia(id, db);
    const anterior = await exigirEvidencia(id, db);
    exigirActiva(anterior);
    if (anterior.estado !== 'REALIZADA')
      fail(409, 'EVIDENCE_NOT_DONE', 'Solo se revisan actividades realizadas.');
    await repository.updateEvidencia(
      id,
      {
        estadoRevision: input.estadoRevision,
        observacionesRevision: input.observacionesRevision ?? null,
        revisorId: actor.id,
        fechaRevision: new Date(),
        modificadoPorId: actor.id,
      },
      db,
    );
    const evidencia = await exigirEvidencia(id, db);
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'EVIDENCIA_PEDAGOGICA_REVISADA',
      entidad: 'EvidenciaPedagogica',
      entidadId: id,
      anterior: snapshot(anterior),
      nuevo: snapshot(evidencia),
      requestId,
    });
    return presentar(evidencia);
  });
}

export function darDeBajaEvidencia(id, motivo, actor, requestId) {
  return repository.transaction((db) =>
    cambiarEnTransaccion(
      id,
      { actor, motivo, requestId, evento: 'EVIDENCIA_PEDAGOGICA_DADA_DE_BAJA' },
      async (_anterior, db) => {
        await repository.updateEvidencia(id, { activo: false, modificadoPorId: actor.id }, db);
      },
      db,
    ),
  );
}

export function quitarArchivo(id, archivoId, motivo, actor, requestId) {
  return repository.transaction((db) =>
    cambiarEnTransaccion(
      id,
      { actor, motivo, requestId, evento: 'EVIDENCIA_PEDAGOGICA_MODIFICADA' },
      async (anterior, db) => {
        if (!anterior.archivos.some((archivo) => archivo.id === archivoId))
          fail(404, 'FILE_NOT_FOUND', 'El archivo no existe o ya fue retirado.');
        await repository.darDeBajaArchivo(archivoId, db);
        await repository.updateEvidencia(id, { modificadoPorId: actor.id }, db);
      },
      db,
    ),
  );
}

export async function descargarArchivo(id, archivoId, actor) {
  const evidencia = await exigirEvidencia(id);
  await exigirConsulta(evidencia, actor);
  const archivo = evidencia.archivos.find((item) => item.id === archivoId);
  if (!archivo) fail(404, 'FILE_NOT_FOUND', 'El archivo no existe o ya fue retirado.');
  const contenido = await almacen.leerArchivo(archivo.nombreAlmacenado);
  if (!contenido) {
    logger.error('Falta en disco un archivo de actividad', {
      module: 'evidencias-pedagogicas',
      evidenciaId: id,
      archivoId,
    });
    fail(404, 'FILE_NOT_FOUND', 'El archivo no está disponible.');
  }
  return { contenido, nombre: archivo.nombreOriginal, tipoMime: archivo.tipoMime };
}
