CREATE TYPE "NivelLogro" AS ENUM ('AD', 'A', 'B', 'C');

ALTER TABLE "Curso" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "BimestreAcademico" (
  "id" SERIAL PRIMARY KEY,
  "anioAcademicoId" INTEGER NOT NULL REFERENCES "AnioAcademico"("id"),
  "numero" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX "BimestreAcademico_anioAcademicoId_numero_key"
  ON "BimestreAcademico" ("anioAcademicoId", "numero");

INSERT INTO "BimestreAcademico" ("anioAcademicoId", "numero", "nombre")
SELECT a."id", b."numero", b."nombre"
FROM "AnioAcademico" a
CROSS JOIN (VALUES
  (1, 'I Bimestre'),
  (2, 'II Bimestre'),
  (3, 'III Bimestre'),
  (4, 'IV Bimestre')
) AS b("numero", "nombre");

CREATE TABLE "Competencia" (
  "id" SERIAL PRIMARY KEY,
  "cursoId" INTEGER NOT NULL REFERENCES "Curso"("id"),
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "Calificacion" (
  "id" SERIAL PRIMARY KEY,
  "matriculaId" INTEGER NOT NULL REFERENCES "Matricula"("id"),
  "bimestreId" INTEGER NOT NULL REFERENCES "BimestreAcademico"("id"),
  "asignacionId" INTEGER NOT NULL REFERENCES "CursoSeccionDocente"("id"),
  "reglaId" INTEGER NOT NULL REFERENCES "ReglaConsolidacion"("id"),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoPorId" INTEGER NOT NULL,
  "modificadoPorId" INTEGER NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modificadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Calificacion_matriculaId_bimestreId_asignacionId_key"
  ON "Calificacion" ("matriculaId", "bimestreId", "asignacionId");

CREATE TABLE "CalificacionCompetencia" (
  "id" SERIAL PRIMARY KEY,
  "calificacionId" INTEGER NOT NULL REFERENCES "Calificacion"("id"),
  "competenciaId" INTEGER NOT NULL REFERENCES "Competencia"("id"),
  "nivelLogro" "NivelLogro" NOT NULL,
  "conclusionDescriptiva" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoPorId" INTEGER NOT NULL,
  "modificadoPorId" INTEGER NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modificadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "CalificacionCompetencia_calificacionId_competenciaId_key"
  ON "CalificacionCompetencia" ("calificacionId", "competenciaId");
