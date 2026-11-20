import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

export const listBimestresDelAnioActivo = (db = prisma) =>
  db.bimestreAcademico.findMany({
    where: { activo: true, anioAcademico: { activo: true } },
    orderBy: [{ anioAcademicoId: 'asc' }, { numero: 'asc' }],
  });

export const findBimestre = (id, db = prisma) =>
  db.bimestreAcademico.findUnique({ where: { id }, include: { anioAcademico: true } });

// Serializa los cambios de fechas de un año: sin esto, dos bimestres editados a la vez
// podrían solaparse aunque cada uno se validara por separado.
export const bloquearBimestresDelAnio = (anioAcademicoId, db) =>
  db.$queryRaw`SELECT "id" FROM "BimestreAcademico" WHERE "anioAcademicoId" = ${anioAcademicoId} FOR UPDATE`;

export const listOtrosBimestres = ({ anioAcademicoId, excluirId }, db) =>
  db.bimestreAcademico.findMany({
    where: { anioAcademicoId, id: { not: excluirId } },
    orderBy: { numero: 'asc' },
  });

// Bloquea los planes activos del bimestre para que nadie registre una actividad en una
// semana que el cambio de fechas está a punto de eliminar.
export const bloquearPlanesDelBimestre = (bimestreId, db) =>
  db.$queryRaw`SELECT "id" FROM "PlanAcademico" WHERE "bimestreId" = ${bimestreId} AND "activo" = true FOR UPDATE`;

export const listSemanasOcupadas = ({ bimestreId, desdeSemana }, db) =>
  db.evidenciaPedagogica.findMany({
    where: {
      activo: true,
      numeroSemana: { gte: desdeSemana },
      plan: { bimestreId, activo: true },
    },
    select: {
      numeroSemana: true,
      plan: {
        select: {
          id: true,
          curso: { select: { nombre: true } },
          seccion: { select: { nombre: true, grado: { select: { nombre: true } } } },
        },
      },
    },
    orderBy: [{ planId: 'asc' }, { numeroSemana: 'asc' }],
  });

export const updateFechas = (id, data, db) => db.bimestreAcademico.update({ where: { id }, data });
