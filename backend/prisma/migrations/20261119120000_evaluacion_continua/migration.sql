-- EvidenciaPedagogica era el informe de avance de un docente sobre un plan, no una
-- evaluación: no tenía alumno, competencia ni nota. Se reemplaza por la evaluación
-- continua. La tabla no tenía datos que conservar.
-- DropForeignKey
ALTER TABLE "EvidenciaPedagogica" DROP CONSTRAINT "EvidenciaPedagogica_docenteId_fkey";

-- DropForeignKey
ALTER TABLE "EvidenciaPedagogica" DROP CONSTRAINT "EvidenciaPedagogica_planId_fkey";

-- DropForeignKey
ALTER TABLE "EvidenciaPedagogica" DROP CONSTRAINT "EvidenciaPedagogica_revisorId_fkey";

-- DropTable
DROP TABLE "EvidenciaPedagogica";

-- DropEnum
DROP TYPE "EstadoEvidenciaPedagogica";

-- CreateEnum
CREATE TYPE "EstadoEvaluacion" AS ENUM ('BORRADOR', 'REGISTRADA');

-- CreateTable
CREATE TABLE "Evaluacion" (
    "id" SERIAL NOT NULL,
    "asignacionId" INTEGER NOT NULL,
    "cursoId" INTEGER NOT NULL,
    "seccionId" INTEGER NOT NULL,
    "bimestreId" INTEGER NOT NULL,
    "competenciaId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" DATE NOT NULL,
    "peso" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "estado" "EstadoEvaluacion" NOT NULL DEFAULT 'BORRADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoEvaluacion" (
    "id" SERIAL NOT NULL,
    "evaluacionId" INTEGER NOT NULL,
    "matriculaId" INTEGER NOT NULL,
    "nota" DECIMAL(4,2) NOT NULL,
    "comentario" VARCHAR(500),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultadoEvaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivoEvaluacion" (
    "id" SERIAL NOT NULL,
    "evaluacionId" INTEGER NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "nombreAlmacenado" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivoEvaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evaluacion_cursoId_seccionId_bimestreId_activo_idx" ON "Evaluacion"("cursoId", "seccionId", "bimestreId", "activo");

-- CreateIndex
CREATE INDEX "ResultadoEvaluacion_evaluacionId_activo_idx" ON "ResultadoEvaluacion"("evaluacionId", "activo");

-- CreateIndex
CREATE INDEX "ResultadoEvaluacion_matriculaId_idx" ON "ResultadoEvaluacion"("matriculaId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoEvaluacion_nombreAlmacenado_key" ON "ArchivoEvaluacion"("nombreAlmacenado");

-- CreateIndex
CREATE INDEX "ArchivoEvaluacion_evaluacionId_activo_idx" ON "ArchivoEvaluacion"("evaluacionId", "activo");

-- Destinos de las FK compuestas de Evaluacion. Son redundantes como unicidad (id ya
-- es único), pero PostgreSQL exige un índice único sobre las columnas referenciadas.
-- CreateIndex
CREATE UNIQUE INDEX "Competencia_id_cursoId_key" ON "Competencia"("id", "cursoId");

-- CreateIndex
CREATE UNIQUE INDEX "CursoSeccionDocente_id_cursoId_seccionId_key" ON "CursoSeccionDocente"("id", "cursoId", "seccionId");

-- La asignación y la competencia deben ser del mismo curso y sección que la evaluación.
-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_asignacionId_cursoId_seccionId_fkey" FOREIGN KEY ("asignacionId", "cursoId", "seccionId") REFERENCES "CursoSeccionDocente"("id", "cursoId", "seccionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_bimestreId_fkey" FOREIGN KEY ("bimestreId") REFERENCES "BimestreAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_competenciaId_cursoId_fkey" FOREIGN KEY ("competenciaId", "cursoId") REFERENCES "Competencia"("id", "cursoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoEvaluacion" ADD CONSTRAINT "ResultadoEvaluacion_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoEvaluacion" ADD CONSTRAINT "ResultadoEvaluacion_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivoEvaluacion" ADD CONSTRAINT "ArchivoEvaluacion_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Escala vigesimal: la nota de cada resultado va de 0 a 20.
ALTER TABLE "ResultadoEvaluacion" ADD CONSTRAINT "ResultadoEvaluacion_nota_rango" CHECK ("nota" >= 0 AND "nota" <= 20);

-- El peso pondera el promedio del bimestre; cero o negativo no tiene sentido.
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_peso_positivo" CHECK ("peso" > 0);

-- Un solo resultado activo por alumno y evaluación. Es parcial para que un resultado
-- dado de baja se conserve como fila propia y el alumno pueda recibir otra nota.
-- Prisma no modela índices parciales, por eso vive aquí.
CREATE UNIQUE INDEX "ResultadoEvaluacion_activo_unico" ON "ResultadoEvaluacion"("evaluacionId", "matriculaId") WHERE "activo" = true;
