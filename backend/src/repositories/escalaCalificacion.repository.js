import { prisma } from '../config/database.js';

export const transaction = (operation) => prisma.$transaction(operation);

// Candado de la escala: cada cálculo de letra lo toma compartido y el cambio de escala en
// exclusiva. No se bloquea la fila vigente porque el cambio la cierra y crea otra: quien
// esperaba esa fila no vería la nueva. 7311001 es la clave fija de este candado.

export const bloquearEscalaCompartida = (db) =>
  db.$executeRaw`SELECT pg_advisory_xact_lock_shared(7311001)`;

export const bloquearEscalaExclusiva = (db) =>
  db.$executeRaw`SELECT pg_advisory_xact_lock(7311001)`;

const escala = {
  id: true,
  version: true,
  minimoAD: true,
  minimoA: true,
  minimoB: true,
  vigenteDesde: true,
};

export const findEscalaVigente = (db = prisma) =>
  db.escalaCalificacion.findFirst({ where: { vigenteHasta: null }, select: escala });

export const cerrarEscala = (id, db) =>
  db.escalaCalificacion.update({ where: { id }, data: { vigenteHasta: new Date() } });

export const createEscala = (data, db) => db.escalaCalificacion.create({ data, select: escala });

// Toma compartidas todas las secciones: ninguna se publica mientras se recalculan sus letras.
export const bloquearSeccionesCompartido = (db) =>
  db.$queryRaw`SELECT "id" FROM "Seccion" ORDER BY "id" FOR SHARE`;

// Prisma no correlaciona el bimestre de la nota con la publicación de su sección.
export const listLogrosSinPublicar = (db) =>
  db.$queryRaw`
    SELECT cc."id", cc."promedio"::text AS "promedio", cc."nivelLogro"::text AS "nivelLogro"
    FROM "CalificacionCompetencia" cc
    JOIN "Calificacion" c ON c."id" = cc."calificacionId"
    JOIN "Matricula" m ON m."id" = c."matriculaId"
    WHERE cc."activo" AND c."activo" AND cc."promedio" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "PublicacionSeccion" p
        WHERE p."bimestreId" = c."bimestreId" AND p."seccionId" = m."seccionId"
      )`;

export const updateLetras = (ids, nivelLogro, modificadoPorId, db) =>
  db.calificacionCompetencia.updateMany({
    where: { id: { in: ids } },
    data: { nivelLogro, modificadoPorId },
  });
