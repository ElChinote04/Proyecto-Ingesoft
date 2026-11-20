import * as repository from '../repositories/publicacionSeccion.repository.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import {
  estadoSeccion,
  evaluarSeccion,
  ESTADOS_PUBLICACION,
} from '../domain/publicacionSeccion.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message, details) => {
  throw new AppError(status, code, message, details);
};

const RAZONES_OMISION = {
  PUBLICATION_INCOMPLETE: 'CON_PENDIENTES',
  GRADES_NOT_FOUND: 'SIN_DATOS',
  INVALID_TERM_CONTEXT: 'OTRO_ANIO_ACADEMICO',
  SECTION_NOT_FOUND: 'NO_ENCONTRADA',
};

const nombreSeccion = ({ nombre, grado }) => `${grado.nombre} ${nombre}`;

export const estaPublicada = async ({ bimestreId, seccionId }, db) =>
  Boolean(await repository.findPublicacion({ bimestreId, seccionId }, db));

// Solo da un mensaje temprano; la garantía es exigirSeccionSinPublicar.
export async function comprobarSinPublicar({ bimestreId, seccionId }, db) {
  if (await estaPublicada({ bimestreId, seccionId }, db))
    fail(
      409,
      'TERM_PUBLISHED',
      'La libreta de este salón ya fue publicada: las notas y la evidencia están en modo consulta.',
    );
}

/**
 * Debe llamarse dentro de la transacción de la escritura: conserva el bloqueo compartido de la
 * sección hasta el final, y por eso la comprobación no puede perder la carrera con una publicación.
 */
export async function exigirSeccionSinPublicar({ bimestreId, seccionId }, db) {
  await repository.bloquearSeccionCompartido(seccionId, db);
  await comprobarSinPublicar({ bimestreId, seccionId }, db);
}

export async function exigirMotivoSiPublicada({ bimestreId, seccionId, motivo }, db) {
  if (!motivo && (await estaPublicada({ bimestreId, seccionId }, db)))
    fail(
      400,
      'CORRECTION_REASON_REQUIRED',
      'La libreta de este salón ya fue publicada: indica el motivo de la corrección.',
    );
}

async function exigirBimestre(id, db) {
  const bimestre = await repository.findBimestre(id, db);
  if (!bimestre?.activo) fail(404, 'TERM_NOT_FOUND', 'El bimestre no existe o está inactivo.');
  return bimestre;
}

async function evaluarSecciones(secciones, bimestreId, db) {
  const [notas, reglas] = await Promise.all([
    repository.listNotasConEvidencias(
      { bimestreId, seccionIds: secciones.map(({ id }) => id) },
      db,
    ),
    repository.listReglasVigentes([...new Set(secciones.map(({ gradoId }) => gradoId))], db),
  ]);
  const evidenciasPorNota = new Map();
  for (const { competenciaId, calificacion, _count } of notas) {
    const clave = `${calificacion.matriculaId}:${competenciaId}`;
    evidenciasPorNota.set(clave, Math.max(evidenciasPorNota.get(clave) ?? 0, _count.evidencias));
  }
  const reglasVigentes = new Set(reglas.map(({ gradoId, cursoId }) => `${gradoId}:${cursoId}`));
  return secciones.map((seccion) => ({
    seccion,
    ...evaluarSeccion({ seccion, evidenciasPorNota, reglasVigentes }),
  }));
}

export async function obtenerEstadoPublicacion(bimestreId, { pagina, limite }) {
  const bimestre = await exigirBimestre(bimestreId);
  const secciones = await repository.listSecciones(bimestre.anioAcademicoId);
  const [evaluadas, publicaciones] = await Promise.all([
    evaluarSecciones(secciones, bimestreId),
    repository.listPublicaciones([bimestreId]),
  ]);
  const publicadoEn = new Map(publicaciones.map((item) => [item.seccionId, item.publicadoEn]));
  const filas = evaluadas.map(({ seccion, totalEsperado, totalCompleto, pendientes }) => ({
    id: seccion.id,
    nombre: nombreSeccion(seccion),
    estado: estadoSeccion({
      publicada: publicadoEn.has(seccion.id),
      totalEsperado,
      pendientes,
    }),
    totalEsperado,
    totalCompleto,
    publicadoEn: publicadoEn.get(seccion.id) ?? null,
    pendientes,
  }));
  const contar = (estado) => filas.filter((fila) => fila.estado === estado).length;
  return {
    bimestre: { id: bimestre.id, nombre: bimestre.nombre },
    resumen: {
      publicadas: contar(ESTADOS_PUBLICACION.PUBLICADA),
      listas: contar(ESTADOS_PUBLICACION.LISTA),
      conPendientes: contar(ESTADOS_PUBLICACION.CON_PENDIENTES),
      sinDatos: contar(ESTADOS_PUBLICACION.SIN_DATOS),
    },
    seccionesListas: filas
      .filter(({ estado }) => estado === ESTADOS_PUBLICACION.LISTA)
      .map(({ id, nombre }) => ({ id, nombre })),
    secciones: filas.slice((pagina - 1) * limite, pagina * limite),
    paginacion: { pagina, limite, total: filas.length },
  };
}

async function publicarEnTransaccion({ bimestre, seccionId, actor, requestId, contexto }) {
  return repository.transaction(async (db) => {
    await repository.bloquearSeccionExclusivo(seccionId, db);
    const seccion = await repository.findSeccion(seccionId, db);
    if (!seccion) fail(404, 'SECTION_NOT_FOUND', 'La sección no existe.');
    if (seccion.anioAcademicoId !== bimestre.anioAcademicoId)
      fail(400, 'INVALID_TERM_CONTEXT', 'La sección no corresponde al año académico del bimestre.');
    if (await estaPublicada({ bimestreId: bimestre.id, seccionId }, db))
      return { publicado: true, yaPublicado: true };
    const [{ totalEsperado, totalCompleto, pendientes }] = await evaluarSecciones(
      [seccion],
      bimestre.id,
      db,
    );
    if (!totalEsperado)
      fail(404, 'GRADES_NOT_FOUND', 'Esta sección no tiene competencias que evaluar.');
    if (pendientes.length)
      fail(
        409,
        'PUBLICATION_INCOMPLETE',
        'Faltan notas o evidencias por registrar en esta sección.',
        { totalEsperado, totalCompleto },
      );
    const publicacion = await repository.createPublicacion(
      { bimestreId: bimestre.id, seccionId, publicadoPorId: actor.id },
      db,
    );
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'NOTA_PUBLICADA',
      entidad: 'PublicacionSeccion',
      entidadId: publicacion.id,
      nuevo: { bimestreId: bimestre.id, seccionId },
      contexto,
      requestId,
    });
    return { publicado: true, yaPublicado: false, publicadoEn: publicacion.publicadoEn };
  });
}

export async function publicarSeccion(bimestreId, seccionId, actor, requestId) {
  const bimestre = await exigirBimestre(bimestreId);
  return publicarEnTransaccion({ bimestre, seccionId, actor, requestId });
}

// Una transacción por sección: la que dejó de estar lista se omite sin detener a las demás, y
// repetir la operación tras una interrupción es seguro porque lo publicado se omite.
export async function publicarSecciones(bimestreId, seccionIds, actor, requestId) {
  const bimestre = await exigirBimestre(bimestreId);
  const nombres = new Map(
    (await repository.listNombresSecciones(seccionIds)).map((seccion) => [
      seccion.id,
      nombreSeccion(seccion),
    ]),
  );
  const publicadas = [];
  const omitidas = [];
  for (const id of seccionIds) {
    const nombre = nombres.get(id) ?? null;
    try {
      const { yaPublicado } = await publicarEnTransaccion({
        bimestre,
        seccionId: id,
        actor,
        requestId,
        contexto: { masiva: true },
      });
      if (yaPublicado) omitidas.push({ id, nombre, razon: 'YA_PUBLICADA' });
      else publicadas.push({ id, nombre });
    } catch (error) {
      if (!RAZONES_OMISION[error.code]) throw error;
      omitidas.push({ id, nombre, razon: RAZONES_OMISION[error.code] });
    }
  }
  return { publicadas, omitidas };
}
