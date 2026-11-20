import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

const planDeLaEvidencia = {
  select: {
    id: true,
    activo: true,
    cursoId: true,
    seccionId: true,
    bimestreId: true,
    bimestre: { select: { id: true, nombre: true, fechaInicio: true, fechaFin: true } },
    curso: { select: { id: true, nombre: true } },
    seccion: { select: { id: true, nombre: true, grado: { select: { nombre: true } } } },
  },
};

const evidencia = {
  id: true,
  planId: true,
  numeroSemana: true,
  tipo: true,
  titulo: true,
  descripcion: true,
  estado: true,
  fechaRealizacion: true,
  enlaces: true,
  estadoRevision: true,
  observacionesRevision: true,
  fechaRevision: true,
  activo: true,
  creadoEn: true,
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
  _count: { select: { archivos: { where: { activo: true } } } },
};

export const findEvidencia = (id, db = prisma) =>
  db.evidenciaPedagogica.findUnique({
    where: { id },
    select: { ...evidencia, plan: planDeLaEvidencia },
  });

export const listEvidencias = (where, db = prisma) =>
  db.evidenciaPedagogica.findMany({
    where: { activo: true, ...where },
    select: evidencia,
    orderBy: [{ numeroSemana: 'asc' }, { creadoEn: 'asc' }, { id: 'asc' }],
  });

export const createEvidencia = ({ archivos, ...datos }, db) =>
  db.evidenciaPedagogica.create({
    data: { ...datos, archivos: { create: archivos } },
    select: evidencia,
  });

export const updateEvidencia = (id, data, db) =>
  db.evidenciaPedagogica.update({ where: { id }, data, select: evidencia });

export const createArchivos = (archivos, db) =>
  db.archivoEvidenciaPedagogica.createMany({ data: archivos });

export const darDeBajaArchivo = (id, db) =>
  db.archivoEvidenciaPedagogica.update({ where: { id }, data: { activo: false } });

// Serializa los cambios de una actividad: sin esto, dos subidas simultáneas superarían el
// límite de archivos o una edición pisaría una revisión.
export const bloquearEvidencia = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "EvidenciaPedagogica" WHERE "id" = ${id} FOR UPDATE`;
