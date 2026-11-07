-- CreateEnum
CREATE TYPE "EstadoEvidenciaPedagogica" AS ENUM ('PENDIENTE_REVISION', 'OBSERVADA', 'VALIDADA');

-- AlterTable
ALTER TABLE "BimestreAcademico" ADD COLUMN     "fechaFin" DATE,
ADD COLUMN     "fechaInicio" DATE;

-- AlterTable
ALTER TABLE "Docente" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Curso" ADD COLUMN     "creadoPorId" INTEGER,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "modificadoPorId" INTEGER;

-- AlterTable
ALTER TABLE "CursoSeccionDocente" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PlanAcademico" (
    "id" SERIAL NOT NULL,
    "bimestreId" INTEGER NOT NULL,
    "asignacionId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanAcademico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenciaPedagogica" (
    "id" SERIAL NOT NULL,
    "docenteId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "revisorId" INTEGER,
    "fechaRegistro" DATE NOT NULL,
    "fechaEntrega" DATE,
    "descripcionAvance" TEXT NOT NULL,
    "archivos" TEXT[],
    "observacionesRevision" TEXT,
    "estadoRevision" "EstadoEvidenciaPedagogica" NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "fechaRevision" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenciaPedagogica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompetenciaToPlanAcademico" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CompetenciaToPlanAcademico_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "PlanAcademico_asignacionId_activo_idx" ON "PlanAcademico"("asignacionId", "activo");

-- CreateIndex
CREATE INDEX "EvidenciaPedagogica_planId_activo_idx" ON "EvidenciaPedagogica"("planId", "activo");

-- CreateIndex
CREATE INDEX "_CompetenciaToPlanAcademico_B_index" ON "_CompetenciaToPlanAcademico"("B");

-- AddForeignKey
ALTER TABLE "PlanAcademico" ADD CONSTRAINT "PlanAcademico_bimestreId_fkey" FOREIGN KEY ("bimestreId") REFERENCES "BimestreAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAcademico" ADD CONSTRAINT "PlanAcademico_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "CursoSeccionDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenciaPedagogica" ADD CONSTRAINT "EvidenciaPedagogica_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenciaPedagogica" ADD CONSTRAINT "EvidenciaPedagogica_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenciaPedagogica" ADD CONSTRAINT "EvidenciaPedagogica_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetenciaToPlanAcademico" ADD CONSTRAINT "_CompetenciaToPlanAcademico_A_fkey" FOREIGN KEY ("A") REFERENCES "Competencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetenciaToPlanAcademico" ADD CONSTRAINT "_CompetenciaToPlanAcademico_B_fkey" FOREIGN KEY ("B") REFERENCES "PlanAcademico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

