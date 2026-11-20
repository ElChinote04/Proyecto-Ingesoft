-- CreateTable
CREATE TABLE "EvidenciaCalificacion" (
    "id" SERIAL NOT NULL,
    "calificacionCompetenciaId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "nivelLogroRegistrado" "NivelLogro" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenciaCalificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivoEvidenciaCalificacion" (
    "id" SERIAL NOT NULL,
    "evidenciaId" INTEGER NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "nombreAlmacenado" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivoEvidenciaCalificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicacionSeccion" (
    "id" SERIAL NOT NULL,
    "bimestreId" INTEGER NOT NULL,
    "seccionId" INTEGER NOT NULL,
    "publicadoPorId" INTEGER NOT NULL,
    "publicadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicacionSeccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenciaCalificacion_calificacionCompetenciaId_activo_idx" ON "EvidenciaCalificacion"("calificacionCompetenciaId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoEvidenciaCalificacion_nombreAlmacenado_key" ON "ArchivoEvidenciaCalificacion"("nombreAlmacenado");

-- CreateIndex
CREATE INDEX "ArchivoEvidenciaCalificacion_evidenciaId_activo_idx" ON "ArchivoEvidenciaCalificacion"("evidenciaId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "PublicacionSeccion_bimestreId_seccionId_key" ON "PublicacionSeccion"("bimestreId", "seccionId");

-- AddForeignKey
ALTER TABLE "EvidenciaCalificacion" ADD CONSTRAINT "EvidenciaCalificacion_calificacionCompetenciaId_fkey" FOREIGN KEY ("calificacionCompetenciaId") REFERENCES "CalificacionCompetencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivoEvidenciaCalificacion" ADD CONSTRAINT "ArchivoEvidenciaCalificacion_evidenciaId_fkey" FOREIGN KEY ("evidenciaId") REFERENCES "EvidenciaCalificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicacionSeccion" ADD CONSTRAINT "PublicacionSeccion_bimestreId_fkey" FOREIGN KEY ("bimestreId") REFERENCES "BimestreAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicacionSeccion" ADD CONSTRAINT "PublicacionSeccion_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lo publicado antes de esta migración era por bimestre completo: cada sección del año queda
-- publicada para que ninguna libreta visible desaparezca.
INSERT INTO "PublicacionSeccion" ("bimestreId", "seccionId", "publicadoPorId", "publicadoEn")
SELECT DISTINCT ON (b."id", s."id") b."id", s."id", r."usuarioId", r."fechaHora"
FROM "RegistroAuditoria" r
JOIN "BimestreAcademico" b ON b."id" = r."entidadId"
JOIN "Seccion" s ON s."anioAcademicoId" = b."anioAcademicoId"
WHERE r."tipoEvento" = 'NOTA_PUBLICADA'
  AND r."entidad" = 'BimestreAcademico'
  AND r."usuarioId" IS NOT NULL
ORDER BY b."id", s."id", r."fechaHora";
