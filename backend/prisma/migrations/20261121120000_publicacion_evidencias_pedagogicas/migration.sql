-- La actividad del plan deja de ser planificada/realizada y pasa a subida/publicada: el
-- docente la sube con anticipación y la publica a mano o en una fecha. La visibilidad no se
-- almacena como estado, se deriva de "publicadaDesde" al consultar (null = subida, futura =
-- programada, hoy o antes = publicada), así no hace falta un proceso programado.

ALTER TABLE "EvidenciaPedagogica" ADD COLUMN "publicadaDesde" DATE;

-- Lo ya realizado se consideraba visible para la familia desde su fecha de realización.
UPDATE "EvidenciaPedagogica"
SET "publicadaDesde" = "fechaRealizacion"
WHERE "estado" = 'REALIZADA';

-- Ocultar una actividad ya revisada conserva su revisión, así que la revisión ya no exige que
-- esté publicada: eso lo comprueba el servicio al revisar.
ALTER TABLE "EvidenciaPedagogica"
  DROP CONSTRAINT "EvidenciaPedagogica_fecha_realizacion",
  DROP CONSTRAINT "EvidenciaPedagogica_revision_realizada";

ALTER TABLE "EvidenciaPedagogica" DROP COLUMN "estado", DROP COLUMN "fechaRealizacion";

-- DropEnum
DROP TYPE "EstadoActividadPedagogica";
