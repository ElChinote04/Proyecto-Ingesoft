-- Los bloques de fin de semana se retiran sin borrar sus sesiones ni asistencias.
UPDATE "CursoSeccionDocenteAula"
SET "activo" = false
WHERE "diaSemana" NOT BETWEEN 1 AND 5 AND "activo";

-- Los registros retirados se conservan para consultar su historial.
ALTER TABLE "CursoSeccionDocenteAula"
ADD CONSTRAINT "CursoSeccionDocenteAula_dia_laborable_activo"
CHECK (NOT "activo" OR "diaSemana" BETWEEN 1 AND 5);
