-- CreateEnum
CREATE TYPE "NombreRol" AS ENUM ('ADMINISTRADOR', 'DOCENTE', 'ALUMNO', 'APODERADO');

-- CreateEnum
CREATE TYPE "CondicionAsistencia" AS ENUM ('PRESENTE', 'TARDANZA', 'AUSENTE');

-- CreateTable
CREATE TABLE "Persona" (
    "id" SERIAL NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "identificador" TEXT NOT NULL,
    "hashContrasena" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" SERIAL NOT NULL,
    "nombre" "NombreRol" NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioRol" (
    "usuarioId" INTEGER NOT NULL,
    "rolId" INTEGER NOT NULL,

    CONSTRAINT "UsuarioRol_pkey" PRIMARY KEY ("usuarioId","rolId")
);

-- CreateTable
CREATE TABLE "SesionAuth" (
    "id" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Docente" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "codigoDocente" TEXT NOT NULL,

    CONSTRAINT "Docente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estudiante" (
    "id" SERIAL NOT NULL,
    "personaId" INTEGER NOT NULL,
    "codigoEstudiante" TEXT NOT NULL,

    CONSTRAINT "Estudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnioAcademico" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,

    CONSTRAINT "AnioAcademico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grado" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Grado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seccion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "gradoId" INTEGER NOT NULL,
    "anioAcademicoId" INTEGER NOT NULL,

    CONSTRAINT "Seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matricula" (
    "id" SERIAL NOT NULL,
    "estudianteId" INTEGER NOT NULL,
    "seccionId" INTEGER NOT NULL,
    "anioAcademicoId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CursoSeccionDocente" (
    "id" SERIAL NOT NULL,
    "cursoId" INTEGER NOT NULL,
    "seccionId" INTEGER NOT NULL,
    "docenteId" INTEGER NOT NULL,

    CONSTRAINT "CursoSeccionDocente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aula" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,

    CONSTRAINT "Aula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CursoSeccionDocenteAula" (
    "id" SERIAL NOT NULL,
    "asignacionId" INTEGER NOT NULL,
    "aulaId" INTEGER NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,

    CONSTRAINT "CursoSeccionDocenteAula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionClase" (
    "id" SERIAL NOT NULL,
    "bloqueId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesionClase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsistenciaEstudiante" (
    "id" SERIAL NOT NULL,
    "sesionId" INTEGER NOT NULL,
    "matriculaId" INTEGER NOT NULL,
    "condicion" "CondicionAsistencia" NOT NULL,
    "observacion" VARCHAR(300) NOT NULL DEFAULT '',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,
    "creadoPorId" INTEGER NOT NULL,
    "modificadoPorId" INTEGER NOT NULL,

    CONSTRAINT "AsistenciaEstudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipoEvento" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "detalle" JSONB NOT NULL,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Persona_numeroDocumento_key" ON "Persona"("numeroDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_personaId_key" ON "Usuario"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_identificador_key" ON "Usuario"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "Rol"("nombre");

-- CreateIndex
CREATE INDEX "SesionAuth_expiraEn_idx" ON "SesionAuth"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "Docente_personaId_key" ON "Docente"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "Docente_codigoDocente_key" ON "Docente"("codigoDocente");

-- CreateIndex
CREATE UNIQUE INDEX "Estudiante_personaId_key" ON "Estudiante"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "Estudiante_codigoEstudiante_key" ON "Estudiante"("codigoEstudiante");

-- CreateIndex
CREATE UNIQUE INDEX "AnioAcademico_codigo_key" ON "AnioAcademico"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Grado_nombre_key" ON "Grado"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Seccion_gradoId_anioAcademicoId_nombre_key" ON "Seccion"("gradoId", "anioAcademicoId", "nombre");

-- CreateIndex
CREATE INDEX "Matricula_seccionId_activo_idx" ON "Matricula"("seccionId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "Matricula_estudianteId_anioAcademicoId_key" ON "Matricula"("estudianteId", "anioAcademicoId");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_codigo_key" ON "Curso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CursoSeccionDocente_cursoId_seccionId_docenteId_key" ON "CursoSeccionDocente"("cursoId", "seccionId", "docenteId");

-- CreateIndex
CREATE UNIQUE INDEX "Aula_codigo_key" ON "Aula"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CursoSeccionDocenteAula_asignacionId_aulaId_diaSemana_horaI_key" ON "CursoSeccionDocenteAula"("asignacionId", "aulaId", "diaSemana", "horaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "SesionClase_bloqueId_fecha_key" ON "SesionClase"("bloqueId", "fecha");

-- CreateIndex
CREATE INDEX "AsistenciaEstudiante_matriculaId_idx" ON "AsistenciaEstudiante"("matriculaId");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaEstudiante_sesionId_matriculaId_key" ON "AsistenciaEstudiante"("sesionId", "matriculaId");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidadId_fechaHora_idx" ON "RegistroAuditoria"("entidadId", "fechaHora");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionAuth" ADD CONSTRAINT "SesionAuth_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Docente" ADD CONSTRAINT "Docente_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estudiante" ADD CONSTRAINT "Estudiante_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_gradoId_fkey" FOREIGN KEY ("gradoId") REFERENCES "Grado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_anioAcademicoId_fkey" FOREIGN KEY ("anioAcademicoId") REFERENCES "AnioAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_anioAcademicoId_fkey" FOREIGN KEY ("anioAcademicoId") REFERENCES "AnioAcademico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CursoSeccionDocente" ADD CONSTRAINT "CursoSeccionDocente_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CursoSeccionDocente" ADD CONSTRAINT "CursoSeccionDocente_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CursoSeccionDocente" ADD CONSTRAINT "CursoSeccionDocente_docenteId_fkey" FOREIGN KEY ("docenteId") REFERENCES "Docente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CursoSeccionDocenteAula" ADD CONSTRAINT "CursoSeccionDocenteAula_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "CursoSeccionDocente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CursoSeccionDocenteAula" ADD CONSTRAINT "CursoSeccionDocenteAula_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionClase" ADD CONSTRAINT "SesionClase_bloqueId_fkey" FOREIGN KEY ("bloqueId") REFERENCES "CursoSeccionDocenteAula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaEstudiante" ADD CONSTRAINT "AsistenciaEstudiante_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionClase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaEstudiante" ADD CONSTRAINT "AsistenciaEstudiante_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaEstudiante" ADD CONSTRAINT "AsistenciaEstudiante_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaEstudiante" ADD CONSTRAINT "AsistenciaEstudiante_modificadoPorId_fkey" FOREIGN KEY ("modificadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
