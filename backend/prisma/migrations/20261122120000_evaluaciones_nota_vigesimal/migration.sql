-- La letra del bimestre deja de elegirse a mano: se calcula desde las evaluaciones (nota 0–20
-- con el examen corregido de cada alumno) y una escala única. La evidencia de calificación
-- desaparece: el examen corregido pasa a ser el sustento de la nota.

-- 1. Evidencia de calificación. Sus archivos quedan en disco y no se borran aquí: la migración
--    no toca el sistema de archivos.
DROP TABLE "ArchivoEvidenciaCalificacion";
DROP TABLE "EvidenciaCalificacion";

-- 2. Lo no publicado se borra: esas letras se recalcularán con las notas nuevas. Lo publicado
--    conserva su letra, sin promedio.
DELETE FROM "CalificacionCompetencia" cc
USING "Calificacion" c, "Matricula" m
WHERE cc."calificacionId" = c."id"
  AND c."matriculaId" = m."id"
  AND NOT EXISTS (
    SELECT 1 FROM "PublicacionSeccion" p
    WHERE p."bimestreId" = c."bimestreId" AND p."seccionId" = m."seccionId"
  );

DELETE FROM "Calificacion" c
WHERE NOT EXISTS (SELECT 1 FROM "CalificacionCompetencia" cc WHERE cc."calificacionId" = c."id");

-- 3. La regla se fija al publicar y la letra puede faltar mientras no haya notas que cuenten.
ALTER TABLE "Calificacion" ALTER COLUMN "reglaId" DROP NOT NULL;

ALTER TABLE "CalificacionCompetencia" ADD COLUMN "promedio" DECIMAL(4,2),
ALTER COLUMN "nivelLogro" DROP NOT NULL;

-- Con promedio siempre hay letra; una letra sin promedio solo existe en lo publicado antes de
-- este cambio.
ALTER TABLE "CalificacionCompetencia" ADD CONSTRAINT "CalificacionCompetencia_promedio_letra"
  CHECK ("promedio" IS NULL OR "nivelLogro" IS NOT NULL);
ALTER TABLE "CalificacionCompetencia" ADD CONSTRAINT "CalificacionCompetencia_promedio_rango"
  CHECK ("promedio" >= 0 AND "promedio" <= 20);

-- 4. Evaluación: peso entero de 1 a 5 y sin estado (una evaluación cuenta desde que existe).
ALTER TABLE "Evaluacion" DROP CONSTRAINT "Evaluacion_peso_positivo";
ALTER TABLE "Evaluacion" DROP COLUMN "estado",
ALTER COLUMN "peso" SET DATA TYPE INTEGER USING LEAST(GREATEST(ROUND("peso"), 1), 5)::INTEGER,
ALTER COLUMN "peso" SET DEFAULT 1;
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_peso_rango" CHECK ("peso" BETWEEN 1 AND 5);
DROP TYPE "EstadoEvaluacion";

-- La evaluación ya no lleva archivo propio: el examen corregido va en el resultado de cada alumno.
DROP TABLE "ArchivoEvaluacion";

-- 5. Resultado: calificada (nota), no rindió (cuenta 0) o justificada (no cuenta, con motivo).
CREATE TYPE "CondicionResultado" AS ENUM ('CALIFICADA', 'NO_RINDIO', 'JUSTIFICADA');

ALTER TABLE "ResultadoEvaluacion" ADD COLUMN "condicion" "CondicionResultado" NOT NULL DEFAULT 'CALIFICADA',
ADD COLUMN "motivo" VARCHAR(300),
ALTER COLUMN "nota" DROP NOT NULL;
ALTER TABLE "ResultadoEvaluacion" ALTER COLUMN "condicion" DROP DEFAULT;

ALTER TABLE "ResultadoEvaluacion" ADD CONSTRAINT "ResultadoEvaluacion_condicion_nota"
  CHECK (("condicion" = 'CALIFICADA') = ("nota" IS NOT NULL));
ALTER TABLE "ResultadoEvaluacion" ADD CONSTRAINT "ResultadoEvaluacion_condicion_motivo"
  CHECK (("condicion" = 'JUSTIFICADA') = (COALESCE(BTRIM("motivo"), '') <> ''));

CREATE TABLE "ArchivoResultadoEvaluacion" (
    "id" SERIAL NOT NULL,
    "resultadoId" INTEGER NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "nombreAlmacenado" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivoResultadoEvaluacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArchivoResultadoEvaluacion_nombreAlmacenado_key" ON "ArchivoResultadoEvaluacion"("nombreAlmacenado");
CREATE INDEX "ArchivoResultadoEvaluacion_resultadoId_activo_idx" ON "ArchivoResultadoEvaluacion"("resultadoId", "activo");
ALTER TABLE "ArchivoResultadoEvaluacion" ADD CONSTRAINT "ArchivoResultadoEvaluacion_resultadoId_fkey" FOREIGN KEY ("resultadoId") REFERENCES "ResultadoEvaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Escala única, con historial de versiones y una sola vigente.
CREATE TABLE "EscalaCalificacion" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "minimoAD" INTEGER NOT NULL,
    "minimoA" INTEGER NOT NULL,
    "minimoB" INTEGER NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteHasta" TIMESTAMP(3),
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalaCalificacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EscalaCalificacion_version_key" ON "EscalaCalificacion"("version");
CREATE UNIQUE INDEX "EscalaCalificacion_vigente_unica" ON "EscalaCalificacion" ((true)) WHERE "vigenteHasta" IS NULL;
ALTER TABLE "EscalaCalificacion" ADD CONSTRAINT "EscalaCalificacion_orden"
  CHECK (20 >= "minimoAD" AND "minimoAD" > "minimoA" AND "minimoA" > "minimoB" AND "minimoB" > 0);

INSERT INTO "EscalaCalificacion" ("version", "minimoAD", "minimoA", "minimoB") VALUES (1, 18, 14, 11);

-- 7. La regla de consolidación solo calcula lo anual; su mínimo pasa a contar notas.
UPDATE "ReglaConsolidacion"
SET "metodo" = ((("metodo")::jsonb - 'minimoEvidencias')
  || jsonb_build_object('minimoNotas', ("metodo")::jsonb -> 'minimoEvidencias'))::text
WHERE "metodo" LIKE '{%' AND ("metodo")::jsonb ? 'minimoEvidencias';
