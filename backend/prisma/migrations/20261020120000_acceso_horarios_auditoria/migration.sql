ALTER TABLE "Usuario" ADD COLUMN "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bloqueadoHasta" TIMESTAMP(3),
  ADD COLUMN "requiereCambioContrasena" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SesionAuth" ADD COLUMN "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AnioAcademico" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fechaInicio" DATE, ADD COLUMN "fechaFin" DATE;
-- Inicialización determinista: el año de calendario si existe, si no el más reciente.
UPDATE "AnioAcademico" SET "activo" = true WHERE id = (
  SELECT id FROM "AnioAcademico" ORDER BY
    (codigo = EXTRACT(YEAR FROM CURRENT_DATE)::text) DESC, codigo DESC LIMIT 1
);
CREATE UNIQUE INDEX "AnioAcademico_unico_activo" ON "AnioAcademico" (activo) WHERE activo;
ALTER TABLE "AnioAcademico" ADD CONSTRAINT "AnioAcademico_fechas_validas" CHECK
  (("fechaInicio" IS NULL AND "fechaFin" IS NULL) OR
   ("fechaInicio" IS NOT NULL AND "fechaFin" IS NOT NULL AND "fechaInicio" < "fechaFin"));
CREATE TABLE "Apoderado" (id SERIAL PRIMARY KEY, "personaId" INTEGER NOT NULL UNIQUE REFERENCES "Persona"(id));
CREATE TABLE "ApoderadoEstudiante" (
  "apoderadoId" INTEGER NOT NULL REFERENCES "Apoderado"(id),
  "estudianteId" INTEGER NOT NULL REFERENCES "Estudiante"(id),
  parentesco VARCHAR(50) NOT NULL, activo BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("apoderadoId", "estudianteId")
);
INSERT INTO "Apoderado" ("personaId") SELECT DISTINCT u."personaId"
FROM "Usuario" u JOIN "UsuarioRol" ur ON ur."usuarioId"=u.id JOIN "Rol" r ON r.id=ur."rolId"
WHERE r.nombre='APODERADO';
ALTER TABLE "RegistroAuditoria" ALTER COLUMN "usuarioId" DROP NOT NULL,
  ADD COLUMN entidad TEXT NOT NULL DEFAULT 'Registro',
  ADD COLUMN resultado TEXT NOT NULL DEFAULT 'EXITO', ADD COLUMN "requestId" TEXT;
CREATE INDEX "RegistroAuditoria_tipo_fecha" ON "RegistroAuditoria" ("tipoEvento", "fechaHora");
-- La evidencia histórica es de solo inserción, también frente a UPDATE/DELETE directos.
CREATE FUNCTION sage_proteger_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'La auditoría es inmutable'; END; $$;
CREATE TRIGGER "RegistroAuditoria_inmutable" BEFORE UPDATE OR DELETE ON "RegistroAuditoria"
FOR EACH ROW EXECUTE FUNCTION sage_proteger_auditoria();

ALTER TABLE "CursoSeccionDocenteAula" ADD COLUMN activo BOOLEAN NOT NULL DEFAULT true;
DROP INDEX "CursoSeccionDocenteAula_asignacionId_aulaId_diaSemana_horaI_key";
CREATE UNIQUE INDEX "CursoSeccionDocenteAula_activo_unico" ON "CursoSeccionDocenteAula"
  ("asignacionId", "aulaId", "diaSemana", "horaInicio") WHERE activo;
