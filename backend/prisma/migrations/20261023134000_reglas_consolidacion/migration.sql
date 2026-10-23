CREATE TABLE "ReglaConsolidacion" (
  "id" SERIAL PRIMARY KEY,
  "gradoId" INTEGER NOT NULL REFERENCES "Grado"("id"),
  "cursoId" INTEGER NOT NULL REFERENCES "Curso"("id"),
  "nombre" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "metodo" TEXT NOT NULL,
  "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vigenteHasta" TIMESTAMP(3),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoPorId" INTEGER NOT NULL REFERENCES "Usuario"("id"),
  "modificadoPorId" INTEGER NOT NULL REFERENCES "Usuario"("id"),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modificadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ReglaConsolidacion_gradoId_cursoId_version_key"
  ON "ReglaConsolidacion" ("gradoId", "cursoId", "version");

CREATE INDEX "ReglaConsolidacion_gradoId_cursoId_activo_idx"
  ON "ReglaConsolidacion" ("gradoId", "cursoId", "activo");
