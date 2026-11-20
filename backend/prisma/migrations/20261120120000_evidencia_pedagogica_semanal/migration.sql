-- La evidencia pedagógica vuelve como actividad semanal del plan de trabajo del docente
-- (20261119120000 la había retirado). No es una nota ni la sustenta.

-- CreateEnum
CREATE TYPE "TipoActividadPedagogica" AS ENUM ('EXPOSICION', 'EJERCICIO', 'VIDEO', 'AVANCE_PLAN', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoActividadPedagogica" AS ENUM ('PLANIFICADA', 'REALIZADA');

-- CreateEnum
CREATE TYPE "EstadoRevisionEvidencia" AS ENUM ('PENDIENTE_REVISION', 'OBSERVADA', 'VALIDADA');

-- El plan pasa a identificar su clase (curso y sección), que sobrevive a un cambio de
-- docente. Se rellena desde la asignación antes de volver obligatorias las columnas.
ALTER TABLE "PlanAcademico" ADD COLUMN "cursoId" INTEGER, ADD COLUMN "seccionId" INTEGER;

UPDATE "PlanAcademico" p
SET "cursoId" = a."cursoId", "seccionId" = a."seccionId"
FROM "CursoSeccionDocente" a
WHERE a."id" = p."asignacionId";

ALTER TABLE "PlanAcademico" ALTER COLUMN "cursoId" SET NOT NULL, ALTER COLUMN "seccionId" SET NOT NULL;

-- La FK simple a la asignación se reemplaza por la compuesta: curso y sección no pueden
-- contradecir a la asignación.
-- DropForeignKey
ALTER TABLE "PlanAcademico" DROP CONSTRAINT "PlanAcademico_asignacionId_fkey";

-- AddForeignKey
ALTER TABLE "PlanAcademico" ADD CONSTRAINT "PlanAcademico_asignacionId_cursoId_seccionId_fkey" FOREIGN KEY ("asignacionId", "cursoId", "seccionId") REFERENCES "CursoSeccionDocente"("id", "cursoId", "seccionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAcademico" ADD CONSTRAINT "PlanAcademico_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAcademico" ADD CONSTRAINT "PlanAcademico_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Antes del índice único: si una clase tiene varios planes activos en el mismo bimestre,
-- se conserva el más reciente y los demás quedan inactivos. No se borra nada.
UPDATE "PlanAcademico" SET "activo" = false
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "cursoId", "seccionId", "bimestreId"
      ORDER BY "modificadoEn" DESC, "id" DESC
    ) AS orden
    FROM "PlanAcademico"
    WHERE "activo" = true
  ) planes
  WHERE orden > 1
);

-- Un solo plan activo por clase y bimestre. Prisma no modela índices parciales.
CREATE UNIQUE INDEX "PlanAcademico_activo_unico" ON "PlanAcademico"("cursoId", "seccionId", "bimestreId") WHERE "activo" = true;

-- CreateTable
CREATE TABLE "EvidenciaPedagogica" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "numeroSemana" INTEGER NOT NULL,
    "tipo" "TipoActividadPedagogica" NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" VARCHAR(2000),
    "estado" "EstadoActividadPedagogica" NOT NULL DEFAULT 'PLANIFICADA',
    "fechaRealizacion" DATE,
    "enlaces" TEXT[],
    "estadoRevision" "EstadoRevisionEvidencia" NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "observacionesRevision" VARCHAR(2000),
    "revisorId" INTEGER,
    "fechaRevision" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenciaPedagogica_pkey" PRIMARY KEY ("id"),
    -- La semana empieza en 1; el máximo depende de las fechas del bimestre (servicio).
    CONSTRAINT "EvidenciaPedagogica_semana_positiva" CHECK ("numeroSemana" >= 1),
    -- Una actividad realizada tiene fecha de realización, y una planificada no.
    CONSTRAINT "EvidenciaPedagogica_fecha_realizacion" CHECK (("estado" = 'REALIZADA') = ("fechaRealizacion" IS NOT NULL)),
    -- Solo se revisa lo realizado.
    CONSTRAINT "EvidenciaPedagogica_revision_realizada" CHECK ("estadoRevision" = 'PENDIENTE_REVISION' OR "estado" = 'REALIZADA'),
    -- Observar exige decir qué hay que corregir.
    CONSTRAINT "EvidenciaPedagogica_observacion" CHECK ("estadoRevision" <> 'OBSERVADA' OR "observacionesRevision" IS NOT NULL),
    CONSTRAINT "EvidenciaPedagogica_max_enlaces" CHECK (cardinality("enlaces") <= 5)
);

-- CreateTable
CREATE TABLE "ArchivoEvidenciaPedagogica" (
    "id" SERIAL NOT NULL,
    "evidenciaId" INTEGER NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "nombreAlmacenado" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivoEvidenciaPedagogica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenciaPedagogica_planId_numeroSemana_activo_idx" ON "EvidenciaPedagogica"("planId", "numeroSemana", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoEvidenciaPedagogica_nombreAlmacenado_key" ON "ArchivoEvidenciaPedagogica"("nombreAlmacenado");

-- CreateIndex
CREATE INDEX "ArchivoEvidenciaPedagogica_evidenciaId_activo_idx" ON "ArchivoEvidenciaPedagogica"("evidenciaId", "activo");

-- AddForeignKey
ALTER TABLE "EvidenciaPedagogica" ADD CONSTRAINT "EvidenciaPedagogica_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenciaPedagogica" ADD CONSTRAINT "EvidenciaPedagogica_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivoEvidenciaPedagogica" ADD CONSTRAINT "ArchivoEvidenciaPedagogica_evidenciaId_fkey" FOREIGN KEY ("evidenciaId") REFERENCES "EvidenciaPedagogica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La tabla anterior del mismo nombre dejó auditoría con entidad 'EvidenciaPedagogica'. La
-- secuencia arranca después de su mayor id para que un registro nuevo no se confunda con uno
-- histórico al consultar la auditoría por entidad e id.
SELECT setval(
  pg_get_serial_sequence('"EvidenciaPedagogica"', 'id'),
  COALESCE(MAX("entidadId"), 0) + 1,
  false
)
FROM "RegistroAuditoria"
WHERE "entidad" = 'EvidenciaPedagogica';
