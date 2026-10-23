-- CreateTable
CREATE TABLE "AsistenciaDocente" (
    "id" SERIAL NOT NULL,
    "docenteId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "condicion" "CondicionAsistencia" NOT NULL,
    "observacion" VARCHAR(300) NOT NULL DEFAULT '',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,

    CONSTRAINT "AsistenciaDocente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AsistenciaDocente_fecha_idx" ON "AsistenciaDocente"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaDocente_docenteId_fecha_key" ON "AsistenciaDocente"("docenteId", "fecha");

-- AddForeignKey
ALTER TABLE "AsistenciaDocente" ADD CONSTRAINT "AsistenciaDocente_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaDocente" ADD CONSTRAINT "AsistenciaDocente_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaDocente" ADD CONSTRAINT "AsistenciaDocente_modificadoPorId_fkey" FOREIGN KEY ("modificadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
