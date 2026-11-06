import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

const nota = {
  select: {
    id: true,
    activo: true,
    nivelLogro: true,
    competencia: { select: { id: true, codigo: true, nombre: true } },
    calificacion: {
      select: {
        activo: true,
        bimestreId: true,
        bimestre: { select: { id: true, nombre: true } },
        matricula: {
          select: {
            id: true,
            seccionId: true,
            estudiante: {
              select: {
                codigoEstudiante: true,
                persona: { select: { nombres: true, apellidos: true } },
              },
            },
          },
        },
        asignacion: { select: { curso: { select: { id: true, nombre: true } } } },
      },
    },
  },
};

const evidencia = {
  id: true,
  calificacionCompetenciaId: true,
  titulo: true,
  descripcion: true,
  nivelLogroRegistrado: true,
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
};

export const findNota = (id, db = prisma) =>
  db.calificacionCompetencia.findUnique({ where: { id }, ...nota });

export const contarAsignacionesVigentes = ({ docenteId, cursoId, seccionId }, db = prisma) =>
  db.cursoSeccionDocente.count({
    where: { docenteId, cursoId, seccionId, activo: true, curso: { activo: true } },
  });

export const listEvidencias = (calificacionCompetenciaId, db = prisma) =>
  db.evidenciaCalificacion.findMany({
    where: { calificacionCompetenciaId },
    select: evidencia,
    orderBy: [{ activo: 'desc' }, { creadoEn: 'desc' }, { id: 'desc' }],
  });

export const findEvidencia = (id, db = prisma) =>
  db.evidenciaCalificacion.findUnique({
    where: { id },
    select: { ...evidencia, calificacionCompetencia: nota },
  });

export const createEvidencia = ({ archivos, ...datos }, db) =>
  db.evidenciaCalificacion.create({
    data: { ...datos, archivos: { create: archivos } },
    select: evidencia,
  });

export const updateEvidencia = (id, data, db) =>
  db.evidenciaCalificacion.update({ where: { id }, data, select: evidencia });

export const createArchivos = (archivos, db) =>
  db.archivoEvidenciaCalificacion.createMany({ data: archivos });

export const darDeBajaArchivo = (id, db) =>
  db.archivoEvidenciaCalificacion.update({ where: { id }, data: { activo: false } });

// Serializa los cambios de contenido de una evidencia: sin esto, dos subidas simultáneas
// superarían el límite de archivos, o dos retiros la dejarían vacía.
export const bloquearEvidencia = (id, db) =>
  db.$queryRaw`SELECT "id" FROM "EvidenciaCalificacion" WHERE "id" = ${id} FOR UPDATE`;
