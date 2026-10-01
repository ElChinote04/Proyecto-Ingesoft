-- Solo lectura. Ejecutar con psql y ON_ERROR_STOP=1.
-- Opcionales: -v docente='...' -v documento='...'
\if :{?docente}
\else
\set docente 'docente.verificacion@sage.local'
\endif
\if :{?documento}
\else
\set documento 'VER-EST-01'
\endif
\pset pager off
BEGIN READ ONLY;

\echo '1. Cuenta, persona, roles y perfil docente (sin hashes ni contrasenas)'
SELECT u.id AS usuario_id, u.identificador, u.activo, u.version,
       p.id AS persona_id, p.nombres, p.apellidos, d.id AS docente_id,
       string_agg(r.nombre::text, ', ' ORDER BY r.nombre::text) AS roles
FROM "Usuario" u JOIN "Persona" p ON p.id = u."personaId"
JOIN "UsuarioRol" ur ON ur."usuarioId" = u.id JOIN "Rol" r ON r.id = ur."rolId"
LEFT JOIN "Docente" d ON d."personaId" = p.id
WHERE u.identificador = :'docente'
GROUP BY u.id, p.id, d.id;

\echo '2. Sesiones de autenticacion vigentes (despues del login del docente)'
SELECT u.identificador, count(sa.id) AS sesiones_vigentes
FROM "Usuario" u LEFT JOIN "SesionAuth" sa ON sa."usuarioId" = u.id AND sa."expiraEn" > now()
WHERE u.identificador = :'docente' GROUP BY u.id;

\echo '3. Estudiante, matricula, grado, seccion y anio'
SELECT e.id AS estudiante_id, e."codigoEstudiante", p."numeroDocumento", p.nombres, p.apellidos,
       m.id AS matricula_id, m.activo, a.codigo AS anio, g.nombre AS grado, s.nombre AS seccion,
       m."anioAcademicoId" = s."anioAcademicoId" AS anio_coherente
FROM "Estudiante" e JOIN "Persona" p ON p.id = e."personaId"
LEFT JOIN "Matricula" m ON m."estudianteId" = e.id
LEFT JOIN "Seccion" s ON s.id = m."seccionId"
LEFT JOIN "Grado" g ON g.id = s."gradoId"
LEFT JOIN "AnioAcademico" a ON a.id = s."anioAcademicoId"
WHERE p."numeroDocumento" = :'documento' ORDER BY a.codigo;

\echo '4. Asignacion academica, bloque y sesion del docente'
SELECT u.identificador, cd.id AS asignacion_id, c.nombre AS curso, a.codigo AS anio,
       g.nombre AS grado, s.nombre AS seccion, b.id AS bloque_id, au.codigo AS aula,
       b."diaSemana", b."horaInicio", b."horaFin", sc.id AS sesion_id, sc.fecha, sc.version
FROM "Usuario" u JOIN "Docente" d ON d."personaId" = u."personaId"
JOIN "CursoSeccionDocente" cd ON cd."docenteId" = d.id
JOIN "Curso" c ON c.id = cd."cursoId" JOIN "Seccion" s ON s.id = cd."seccionId"
JOIN "Grado" g ON g.id = s."gradoId" JOIN "AnioAcademico" a ON a.id = s."anioAcademicoId"
JOIN "CursoSeccionDocenteAula" b ON b."asignacionId" = cd.id
JOIN "Aula" au ON au.id = b."aulaId" LEFT JOIN "SesionClase" sc ON sc."bloqueId" = b.id
WHERE u.identificador = :'docente' ORDER BY sc.fecha, b."horaInicio";

\echo '5. Padron efectivo y asistencia persistida (NULL antes de guardar)'
SELECT sc.id AS sesion_id, sc.fecha, p.nombres, p.apellidos, m.id AS matricula_id,
       ae.id AS asistencia_id, ae.condicion, ae.observacion,
       creador.identificador AS creado_por, modificador.identificador AS modificado_por,
       ae."creadoEn", ae."modificadoEn", sc.version
FROM "Usuario" u JOIN "Docente" d ON d."personaId" = u."personaId"
JOIN "CursoSeccionDocente" cd ON cd."docenteId" = d.id
JOIN "CursoSeccionDocenteAula" b ON b."asignacionId" = cd.id
JOIN "SesionClase" sc ON sc."bloqueId" = b.id AND sc.activo
JOIN "Matricula" m ON m."seccionId" = cd."seccionId" AND m.activo
JOIN "Estudiante" e ON e.id = m."estudianteId" JOIN "Persona" p ON p.id = e."personaId" AND p.activo
LEFT JOIN "AsistenciaEstudiante" ae ON ae."sesionId" = sc.id AND ae."matriculaId" = m.id
LEFT JOIN "Usuario" creador ON creador.id = ae."creadoPorId"
LEFT JOIN "Usuario" modificador ON modificador.id = ae."modificadoPorId"
WHERE u.identificador = :'docente' AND p."numeroDocumento" = :'documento'
ORDER BY sc.fecha;

\echo '6. Ultimos 30 eventos de auditoria'
SELECT ra.id, ra."fechaHora", u.identificador, ra."tipoEvento", ra."entidadId", ra.detalle
FROM "RegistroAuditoria" ra JOIN "Usuario" u ON u.id = ra."usuarioId"
ORDER BY ra.id DESC LIMIT 30;

\echo '7. Incongruencias: todas las cantidades deben ser cero'
SELECT 'Matriculas de anio distinto a su seccion' AS comprobacion, count(*) AS errores
FROM "Matricula" m JOIN "Seccion" s ON s.id = m."seccionId" WHERE m."anioAcademicoId" <> s."anioAcademicoId"
UNION ALL
SELECT 'Asistencias de alumno en otra seccion', count(*) FROM "AsistenciaEstudiante" ae
JOIN "Matricula" m ON m.id = ae."matriculaId" JOIN "SesionClase" sc ON sc.id = ae."sesionId"
JOIN "CursoSeccionDocenteAula" b ON b.id = sc."bloqueId" JOIN "CursoSeccionDocente" cd ON cd.id = b."asignacionId"
WHERE cd."seccionId" <> m."seccionId"
UNION ALL
SELECT 'Sesiones con fecha u horas ajenas al bloque', count(*) FROM "SesionClase" sc
JOIN "CursoSeccionDocenteAula" b ON b.id = sc."bloqueId"
JOIN "CursoSeccionDocente" cd ON cd.id = b."asignacionId" JOIN "Seccion" s ON s.id = cd."seccionId"
JOIN "AnioAcademico" a ON a.id = s."anioAcademicoId"
WHERE sc."horaInicio" <> b."horaInicio" OR sc."horaFin" <> b."horaFin"
   OR extract(isodow FROM sc.fecha) <> b."diaSemana" OR extract(year FROM sc.fecha)::text <> a.codigo
UNION ALL
SELECT 'Cruces de docente, aula o seccion', count(*) FROM "CursoSeccionDocenteAula" b1
JOIN "CursoSeccionDocente" cd1 ON cd1.id = b1."asignacionId" JOIN "Seccion" s1 ON s1.id = cd1."seccionId"
JOIN "CursoSeccionDocenteAula" b2 ON b2.id > b1.id AND b2."diaSemana" = b1."diaSemana"
  AND b1."horaInicio" < b2."horaFin" AND b1."horaFin" > b2."horaInicio"
JOIN "CursoSeccionDocente" cd2 ON cd2.id = b2."asignacionId" JOIN "Seccion" s2 ON s2.id = cd2."seccionId"
WHERE s1."anioAcademicoId" = s2."anioAcademicoId"
  AND (b1."aulaId" = b2."aulaId" OR cd1."docenteId" = cd2."docenteId" OR cd1."seccionId" = cd2."seccionId");
COMMIT;
