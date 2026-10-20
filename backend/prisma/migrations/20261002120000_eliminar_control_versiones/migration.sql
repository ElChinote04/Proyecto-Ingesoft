-- Se elimina exclusivamente el contador técnico de edición.
-- Se conservan usuarios, sesiones, asistencias y toda la auditoría histórica.
ALTER TABLE "Usuario" DROP COLUMN "version";
ALTER TABLE "SesionClase" DROP COLUMN "version";
