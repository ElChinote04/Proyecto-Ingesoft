-- Migración aditiva: conserva cuentas, clases y asistencias existentes.
ALTER TABLE "Usuario" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "Instalacion" (
  "id" INTEGER NOT NULL,
  "completadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Instalacion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Instalacion_unica" CHECK ("id" = 1)
);
