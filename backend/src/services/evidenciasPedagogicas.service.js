import * as repository from '../repositories/evidenciasPedagogicas.repository.js';
import * as planes from '../repositories/planesAcademicos.repository.js';
import * as libretas from '../repositories/libretas.repository.js';
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
  conArchivosEnDisco,
  leerArchivoRegistrado,
  prepararArchivos,
} from './archivosAdjuntos.service.js';
import { MAX_ARCHIVOS_EVIDENCIA } from '../domain/archivoEvidencia.js';
import { aTexto, estaCerrado, hoyEnLima, totalSemanas } from '../domain/semanasBimestre.js';
import { estaPublicada, estadoPublicacion } from '../domain/publicacionActividad.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const esFamilia = (actor) => actor.roles.some((rol) => ['ALUMNO', 'APODERADO'].includes(rol));
const texto = (valor) => valor && aTexto(valor);

const hoy = () => new Date(`${hoyEnLima()}T00:00:00.000Z`);

// Lo que un alumno o apoderado puede ver: lo publicado (hasta hoy) que la coordinación no
// observó. Una actividad programada aparece sola el día de su publicación.
const visibleParaFamilia = (evidencia) =>
  evidencia.activo &&
  estaPublicada(evidencia.publicadaDesde) &&
  evidencia.estadoRevision !== 'OBSERVADA';

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
  publicadaDesde: texto(evidencia.publicadaDesde),
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
  publicadaDesde: evidencia.publicadaDesde,
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

/**
 * Traduce lo que pide el formulario a la fecha que se guarda: undefined deja la publicación
 * como está, null la oculta. Programar admite fechas desde hoy hasta el fin del bimestre.
 */
function resolverPublicacion({ publicacion, publicadaDesde }, bimestre) {
  if (publicacion === undefined) return undefined;
  if (publicacion === 'OCULTA') return null;
  if (publicacion === 'AHORA') return hoy();
  if (publicadaDesde < hoyEnLima())
    fail(400, 'INVALID_PUBLICATION_DATE', 'La fecha de publicación no puede ser anterior a hoy.');
  if (publicadaDesde > aTexto(bimestre.fechaFin))
    fail(
      400,
      'INVALID_PUBLICATION_DATE',
      'La fecha de publicación debe estar dentro del bimestre.',
    );
  return new Date(`${publicadaDesde}T00:00:00.000Z`);
}

function eventoDePublicacion(antes, despues) {
  if (despues === undefined) return undefined;
  if (!despues) return antes ? 'EVIDENCIA_PEDAGOGICA_OCULTADA' : undefined;
  if (!antes || aTexto(antes) !== aTexto(despues)) return 'EVIDENCIA_PEDAGOGICA_PUBLICADA';
  return undefined;
}

function exigirCupo(total) {
  if (total > MAX_ARCHIVOS_EVIDENCIA)
    fail(
      400,
      'TOO_MANY_FILES',
      `Puedes adjuntar hasta ${MAX_ARCHIVOS_EVIDENCIA} archivos por actividad.`,
    );
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
    ? await repository.listEvidenciasPublicadas({ planId: plan.id, hasta: hoy() })
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
  resolverPublicacion(input, plan.bimestre);
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
          publicadaDesde: resolverPublicacion(input, actual.bimestre),
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
  const { motivo, publicacion, publicadaDesde, ...cambios } = input;
  const hayCambios = Object.values(cambios).some((valor) => valor !== undefined);
  if (!hayCambios && !publicacion && !archivos.length)
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
  resolverPublicacion({ publicacion, publicadaDesde }, encontrada.plan.bimestre);
  const preparados = prepararArchivos(archivos);
  return conArchivosEnDisco(preparados, actor, (registros) =>
    repository.transaction((db) =>
      cambiarEnTransaccion(
        id,
        { actor, motivo, requestId, evento: 'EVIDENCIA_PEDAGOGICA_MODIFICADA' },
        async (anterior, db) => {
          if (cambios.numeroSemana) exigirSemana(cambios.numeroSemana, anterior.plan.bimestre);
          exigirCupo(anterior._count.archivos + registros.length);
          const publicada = resolverPublicacion(
            { publicacion, publicadaDesde },
            anterior.plan.bimestre,
          );
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
              ...(publicada !== undefined && { publicadaDesde: publicada }),
              modificadoPorId: actor.id,
            },
            db,
          );
          return eventoDePublicacion(anterior.publicadaDesde, publicada);
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
    if (estadoPublicacion(anterior.publicadaDesde) !== 'PUBLICADA')
      fail(409, 'EVIDENCE_NOT_PUBLISHED', 'Solo se revisan actividades publicadas.');
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
  return leerArchivoRegistrado(archivo, {
    module: 'evidencias-pedagogicas',
    evidenciaId: id,
    archivoId,
  });
}
