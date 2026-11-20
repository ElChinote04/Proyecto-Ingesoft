
BEGIN;

DO $seed$
DECLARE
  v_seccion_id integer;
  v_anio_id integer;
  v_docente_id integer;
  v_usuario_id integer;
  v_curso_id integer;
  v_asignacion_id integer;
  v_aula_id integer;
  v_bloque_id integer;
  v_sesion_id integer;
  v_persona_id integer;
  v_estudiante_id integer;
  v_fecha date;
  v_dia integer;
  v_alumno record;
  v_estado "CondicionAsistencia";

BEGIN
  SELECT s.id, s."anioAcademicoId"
  INTO v_seccion_id, v_anio_id
  FROM "Seccion" s
  JOIN "Grado" g ON g.id = s."gradoId"
  JOIN "AnioAcademico" a
    ON a.id = s."anioAcademicoId"
  WHERE a.codigo = '2026'
    AND s.nombre = 'A'
    AND (
      g.nombre = '1'
      OR g.nombre LIKE '1.%'
      OR g.nombre LIKE '1°%'
      OR g.nombre LIKE '1º%'
    )
  ORDER BY s.id
  LIMIT 1;

  IF v_seccion_id IS NULL THEN
    RAISE EXCEPTION
      'No se encontro grado 1, seccion A, ano 2026.';
  END IF;

  SELECT id
  INTO v_docente_id
  FROM "Docente"
  ORDER BY id
  LIMIT 1;

  SELECT id
  INTO v_usuario_id
  FROM "Usuario"
  WHERE activo = true
  ORDER BY id
  LIMIT 1;

  IF v_docente_id IS NULL OR v_usuario_id IS NULL THEN
    RAISE EXCEPTION
      'Se necesita al menos un docente y un usuario activo.';
  END IF;

  INSERT INTO "Curso" (
    codigo,
    nombre,
    activo
  )
  VALUES (
    'MAT-US016',
    'Matematica - pruebas US016',
    true
  )
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id
  INTO v_curso_id
  FROM "Curso"
  WHERE codigo = 'MAT-US016';

  INSERT INTO "Aula" (codigo)
  VALUES ('AULA-US016')
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id
  INTO v_aula_id
  FROM "Aula"
  WHERE codigo = 'AULA-US016';

  INSERT INTO "CursoSeccionDocente" (
    "cursoId",
    "seccionId",
    "docenteId"
  )
  VALUES (
    v_curso_id,
    v_seccion_id,
    v_docente_id
  )
  ON CONFLICT (
    "cursoId",
    "seccionId",
    "docenteId"
  ) DO NOTHING;

  SELECT id
  INTO v_asignacion_id
  FROM "CursoSeccionDocente"
  WHERE "cursoId" = v_curso_id
    AND "seccionId" = v_seccion_id
    AND "docenteId" = v_docente_id;

  FOR v_alumno IN
    SELECT *
    FROM (
      VALUES
        (
          'US016-DOC-001',
          'Ana',
          'Torres',
          'US016-EST-001'
        ),
        (
          'US016-DOC-002',
          'Luis',
          'Ramirez',
          'US016-EST-002'
        ),
        (
          'US016-DOC-003',
          'Maria',
          'Lopez',
          'US016-EST-003'
        )
    ) AS x(
      documento,
      nombres,
      apellidos,
      codigo
    )

  LOOP
    INSERT INTO "Persona" (
      "numeroDocumento",
      nombres,
      apellidos,
      activo,
      "modificadoEn"
    )
    VALUES (
      v_alumno.documento,
      v_alumno.nombres,
      v_alumno.apellidos,
      true,
      NOW()
    )
    ON CONFLICT ("numeroDocumento") DO NOTHING;

    SELECT id
    INTO v_persona_id
    FROM "Persona"
    WHERE "numeroDocumento" = v_alumno.documento;

    INSERT INTO "Estudiante" (
      "personaId",
      "codigoEstudiante"
    )
    VALUES (
      v_persona_id,
      v_alumno.codigo
    )
    ON CONFLICT ("personaId") DO NOTHING;

    SELECT id
    INTO v_estudiante_id
    FROM "Estudiante"
    WHERE "personaId" = v_persona_id;

    INSERT INTO "Matricula" (
      "estudianteId",
      "seccionId",
      "anioAcademicoId",
      activo,
      "modificadoEn"
    )
    VALUES (
      v_estudiante_id,
      v_seccion_id,
      v_anio_id,
      true,
      NOW()
    )
    ON CONFLICT (
      "estudianteId",
      "anioAcademicoId"
    )
    DO UPDATE SET
      "seccionId" = EXCLUDED."seccionId",
      activo = true,
      "modificadoEn" = NOW();

  END LOOP;

  FOR v_fecha IN
    SELECT d::date
    FROM (
      VALUES
        ('2026-11-05'),
        ('2026-11-06')
    ) AS x(d)

  LOOP
    v_dia := EXTRACT(ISODOW FROM v_fecha)::integer;

    INSERT INTO "CursoSeccionDocenteAula" (
      "asignacionId",
      "aulaId",
      "diaSemana",
      "horaInicio",
      "horaFin",
      activo
    )
    SELECT
      v_asignacion_id,
      v_aula_id,
      v_dia,
      '16:30',
      '17:30',
      true
    WHERE NOT EXISTS (
      SELECT 1
      FROM "CursoSeccionDocenteAula"
      WHERE "asignacionId" = v_asignacion_id
        AND "diaSemana" = v_dia
        AND "horaInicio" = '16:30'
        AND "horaFin" = '17:30'
        AND activo = true
    );

    SELECT id
    INTO v_bloque_id
    FROM "CursoSeccionDocenteAula"
    WHERE "asignacionId" = v_asignacion_id
      AND "diaSemana" = v_dia
      AND "horaInicio" = '16:30'
      AND "horaFin" = '17:30'
      AND activo = true
    ORDER BY id
    LIMIT 1;

    INSERT INTO "SesionClase" (
      "bloqueId",
      fecha,
      "horaInicio",
      "horaFin",
      activo,
      "modificadoEn"
    )
    VALUES (
      v_bloque_id,
      v_fecha,
      '16:30',
      '17:30',
      true,
      NOW()
    )
    ON CONFLICT (
      "bloqueId",
      fecha
    ) DO NOTHING;

    SELECT id
    INTO v_sesion_id
    FROM "SesionClase"
    WHERE "bloqueId" = v_bloque_id
      AND fecha = v_fecha;

    FOR v_alumno IN
      SELECT
        m.id AS matricula_id,
        p."numeroDocumento" AS documento
      FROM "Matricula" m
      JOIN "Estudiante" e
        ON e.id = m."estudianteId"
      JOIN "Persona" p
        ON p.id = e."personaId"
      WHERE m."seccionId" = v_seccion_id
        AND m.activo = true
        AND p."numeroDocumento" IN (
          'US016-DOC-001',
          'US016-DOC-002',
          'US016-DOC-003'
        )

    LOOP
      v_estado := CASE
        WHEN v_fecha = DATE '2026-11-05' THEN
          CASE v_alumno.documento
            WHEN 'US016-DOC-001'
              THEN 'PRESENTE'::"CondicionAsistencia"
            WHEN 'US016-DOC-002'
              THEN 'TARDANZA'::"CondicionAsistencia"
            ELSE
              'AUSENTE'::"CondicionAsistencia"
          END
        ELSE
          CASE v_alumno.documento
            WHEN 'US016-DOC-001'
              THEN 'TARDANZA'::"CondicionAsistencia"
            WHEN 'US016-DOC-002'
              THEN 'AUSENTE'::"CondicionAsistencia"
            ELSE
              'PRESENTE'::"CondicionAsistencia"
          END
      END;

      INSERT INTO "AsistenciaEstudiante" (
        "sesionId",
        "matriculaId",
        condicion,
        observacion,
        "creadoPorId",
        "modificadoPorId",
        "modificadoEn"
      )
      VALUES (
        v_sesion_id,
        v_alumno.matricula_id,
        v_estado,
        'Dato de prueba US016',
        v_usuario_id,
        v_usuario_id,
        NOW()
      )
      ON CONFLICT (
        "sesionId",
        "matriculaId"
      )
      DO UPDATE SET
        condicion = EXCLUDED.condicion,
        observacion = EXCLUDED.observacion,
        "modificadoPorId" = EXCLUDED."modificadoPorId",
        "modificadoEn" = NOW();

    END LOOP;

  END LOOP;

  RAISE NOTICE
    'Datos US016 creados: seccion %, curso %, docente %',
    v_seccion_id,
    v_curso_id,
    v_docente_id;

END $seed$;

COMMIT;

SELECT
  ae.condicion,
  COUNT(*) AS registros
FROM "AsistenciaEstudiante" ae
JOIN "Matricula" m
  ON m.id = ae."matriculaId"
JOIN "Estudiante" e
  ON e.id = m."estudianteId"
JOIN "Persona" p
  ON p.id = e."personaId"
JOIN "SesionClase" sc
  ON sc.id = ae."sesionId"
WHERE p."numeroDocumento" LIKE 'US016-DOC-%'
  AND sc.fecha BETWEEN
    DATE '2026-11-05'
    AND DATE '2026-11-06'
GROUP BY ae.condicion
ORDER BY ae.condicion;
