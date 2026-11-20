import { prisma } from '../config/database.js';

// Se usa el "db" de la transacción del módulo que audita: la operación y su registro se
// guardan juntos o no se guarda ninguno.
export const registrarEvento = (datos, db) => db.registroAuditoria.create({ data: datos });

export async function buscarEventos(where, pagina, limite) {
  const [total, registros] = await prisma.$transaction([
    prisma.registroAuditoria.count({ where }),
    prisma.registroAuditoria.findMany({
      where,
      skip: (pagina - 1) * limite,
      take: limite,
      include: { usuario: { select: { identificador: true } } },
      orderBy: { id: 'desc' },
    }),
  ]);
  return { total, registros };
}

const SOLO_NOMBRE_PERSONA = {
  id: true,
  persona: { select: { nombres: true, apellidos: true } },
};
const nombrePersona = ({ persona }) => `${persona.nombres} ${persona.apellidos}`;
const indexarPorId = (filas, obtenerNombre) =>
  Object.fromEntries(filas.map((fila) => [fila.id, obtenerNombre(fila)]));

export async function obtenerNombres({ apoderadoId, estudianteId, competenciaId }) {
  const [apoderados, estudiantes, competencias] = await Promise.all([
    prisma.apoderado.findMany({
      where: { id: { in: [...apoderadoId] } },
      select: SOLO_NOMBRE_PERSONA,
    }),
    prisma.estudiante.findMany({
      where: { id: { in: [...estudianteId] } },
      select: SOLO_NOMBRE_PERSONA,
    }),
    prisma.competencia.findMany({
      where: { id: { in: [...competenciaId] } },
      select: { id: true, nombre: true },
    }),
  ]);
  return {
    apoderadoId: indexarPorId(apoderados, nombrePersona),
    estudianteId: indexarPorId(estudiantes, nombrePersona),
    competenciaId: indexarPorId(competencias, (competencia) => competencia.nombre),
  };
}

export async function obtenerDatosDeNotas(calificacionIds, detalleIds) {
  const filas = await prisma.calificacion.findMany({
    where: {
      OR: [{ id: { in: calificacionIds } }, { competencias: { some: { id: { in: detalleIds } } } }],
    },
    select: {
      id: true,
      competencias: { where: { id: { in: detalleIds } }, select: { id: true } },
      bimestre: { select: { nombre: true } },
      asignacion: { select: { curso: { select: { nombre: true } } } },
      matricula: { select: { estudiante: { select: SOLO_NOMBRE_PERSONA } } },
    },
  });
  return filas.map((fila) => ({
    calificacionId: fila.id,
    detalleIds: fila.competencias.map((detalle) => detalle.id),
    estudiante: nombrePersona(fila.matricula.estudiante),
    curso: fila.asignacion.curso.nombre,
    bimestre: fila.bimestre.nombre,
  }));
}

export const buscarGuardadosDeNotas = (tipoEvento, calificacionIds) =>
  prisma.registroAuditoria.findMany({
    where: { tipoEvento, entidadId: { in: calificacionIds } },
    select: { id: true, entidadId: true, detalle: true },
    orderBy: { id: 'asc' },
  });

export async function obtenerTiposEvento() {
  const filas = await prisma.registroAuditoria.findMany({
    distinct: ['tipoEvento'],
    select: { tipoEvento: true },
    orderBy: { tipoEvento: 'asc' },
  });
  return filas.map((fila) => fila.tipoEvento);
}
