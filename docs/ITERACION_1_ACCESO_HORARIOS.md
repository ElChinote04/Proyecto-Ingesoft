# Iteración 1: acceso por roles y horario personal

Actualización: 20 de octubre de 2026. Alcance autorizado: **US-001 y US-023**.
El propietario excluyó expresamente **US-003**. No se implementaron notas, pagos ni
su auditoría; esa historia sigue pendiente. La auditoría de seguridad de acceso
pertenece a los requisitos de autenticación y se conserva.

## Fuentes y criterios aplicados

- Backlog (2).xlsx: US-001 (Must) y US-023 (Should).
- Plan de Proyecto actualizado: Iteración 1 corresponde a los Must; US-023 se
  completa adicionalmente por solicitud expresa. Esto no da por cerrados los demás Must.
- Requisitos aportados: RF49–53 (horario personal), RF55–60 (coherencia con el año
  activo), RF61–64, RF68, RF71–82 y RF84 (seguridad y acceso), RF94–95 (consulta
  privada de asistencia). No se declara implementado todo el listado de requisitos.
- Estándares de Interfaz Gráfica y Estándares de Programación de SAGE.
- [Figma confirmado por el propietario](https://www.figma.com/design/gCuuBOpsdHJhx289Udq40E/SAGE-%E2%80%94-Prototipo-Completo?node-id=2003-2).
  Se revisaron las pantallas de alumno 2006:193, apoderado 2006:257, cambio inicial
  2051:2677 y horarios personales 2137:4051 y 2184:4996.

Las nuevas vistas reutilizan Inter, los SVG locales, navegación de 240 px,
barra superior de 64 px, morado #4C1D95, superficies, campos de 40 px y estados
del estándar. La matriz sigue el formato de Figma con curso/sección, docente,
aula e intervalo. Las cifras de muestra de pagos y notas del diseño no se muestran
como si fueran datos implementados. No se modificó el archivo de Figma.

## US-001: comportamiento implementado

| Perfil        | Opciones disponibles                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Administrador | Usuarios/roles, catálogos y año activo, alumnos/matrículas y vínculos familiares, horarios/sesiones, auditoría existente |
| Docente       | Sus sesiones de asistencia y su horario semanal                                                                          |
| Alumno        | Su información académica, asistencia e horario semanal de su sección                                                     |
| Apoderado     | Información académica y asistencia de estudiantes vinculados por administración                                          |
| Todos         | Cambio de contraseña propia y cierre de sesión                                                                           |

Una cuenta puede combinar roles. Persona conserva perfiles independientes Docente,
Estudiante y Apoderado; no se introduce herencia excluyente. Tener un rol no concede
matrícula, representación familiar ni asignaciones de clase automáticamente.

Las cuentas nuevas y contraseñas restablecidas por administración deben cambiar su
contraseña antes de usar módulos. El primer administrador elige su contraseña en la
instalación y no recibe esta restricción. Las cuentas anteriores se conservan.
El cambio exige la contraseña actual, mínimo 10 caracteres, máximo 72 bytes y una
clave diferente. Revoca todas las sesiones y exige ingresar nuevamente.

El backend vuelve a comprobar cuenta, perfiles, roles y propiedad en cada solicitud.
Ocultar botones no sustituye esa validación. Credenciales inválidas, cuenta bloqueada
o desactivada reciben 401 genérico; un recurso ajeno recibe 403.

Parámetros nuevos de `backend/.env` (opcionales; tienen valores predeterminados):

```dotenv
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_SECONDS=900
SESSION_IDLE_SECONDS=1800
```

Se conserva `JWT_EXPIRES_IN=1h` para vencimiento absoluto y el límite de 30 intentos
por IP cada 15 minutos. El bloqueo consecutivo se aplica por cuenta en PostgreSQL.
Las consultas automáticas no renuevan la actividad. El servidor conserva la fecha
de última actividad; el navegador también vuelve al login cuando vence la inactividad.

Login exitoso/fallido y accesos denegados dejan evento de seguridad, resultado,
usuario cuando existe, origen y requestId. Nunca contraseña, hash o JWT. Los intentos
de cuentas inexistentes usan usuario nulo. Un trigger impide UPDATE y DELETE sobre
eventos. El administrador consulta los últimos 100; no hay edición pública.

## US-023: comportamiento implementado

- `#/horario`: matriz semanal de solo lectura. Docente ve sus asignaciones;
  alumno ve las de su matrícula activa en el año académico activo.
- Si combina DOCENTE y ALUMNO, puede elegir el perfil a consultar.
- Se muestra el año activo y el docente o sección; no permite consultar otro
  usuario cambiando parámetros. Sin año, matrícula o asignaciones hay un estado vacío.
- Consulta al abrir, recuperar foco y cada 10 segundos mientras la pestaña está
  visible. La siguiente consulta refleja altas, cambios y retiros. No utiliza WebSocket.
- Por defecto muestra lunes a viernes; añade sábado/domingo si existen clases.
  Los intervalos provienen de los bloques reales, sin inventar horas de clase.
- Administración activa un único año. La primera anualidad creada queda activa;
  las posteriores requieren activación explícita. Años anteriores quedan para consulta.
- Se añadió edición PUT y retiro DELETE de bloques del año activo. El retiro es
  lógico (`activo=false`), conserva sesiones/asistencias y permite recrear el mismo horario.
- Un bloque con sesiones fechadas no se edita: se retira y se crea otro para conservar
  el historial. Tampoco se crean sesiones nuevas en un año inactivo.
- Se conservan validaciones de docente activo, referencias, intervalo y cruces
  de docente, aula o sección. No hay contadores de versión ni campos `success`.

## Recorrido manual sin seed

1. Ejecuta Setup y Start según README. Configura el primer administrador si la BD
   está vacía. Una instalación existente conserva sus cuentas y datos.
2. Administrador → Usuarios: crea una cuenta DOCENTE y otra APODERADO, o una cuenta
   con ambos roles. El listado devuelve los perfiles creados y `requiereCambioContrasena`.
3. Ingresa con cada cuenta nueva: debe aparecer el formulario de cambio inicial.
   Completa el cambio, vuelve a ingresar y verifica sus opciones. Durante el cambio
   inicial los endpoints académicos responden 403 `PASSWORD_CHANGE_REQUIRED`.
4. Administrador → Catálogos: crea año, grado, sección, curso y aula. Comprueba
   **Año académico activo** y activa el año del recorrido si ya existían otros.
5. Registra un estudiante y su matrícula. Para darle acceso, crea una cuenta ALUMNO
   usando exactamente el mismo documento, nombres y apellidos. Se reutiliza Persona
   y Estudiante. No se duplica al alumno ni su matrícula.
6. Alumnos y matrículas → Vincular apoderado y estudiante: elige perfil, estudiante,
   parentesco y estado Activo. Un apoderado sin vínculo ve un mensaje informativo.
7. Horarios y sesiones: crea la asignación con docente, curso, sección, aula y horas.
   Crea una sesión fechada compatible si también probarás asistencia.
8. Ingresa como alumno: su panel muestra su matrícula. **Mi horario** muestra su
   sección y clases. Ingresa como docente: **Mi horario** muestra solo sus asignaciones.
9. En otra sesión administrativa, edita un bloque sin sesiones fechadas: el cambio
   debe aparecer en el horario personal visible dentro de 10 segundos. Si ya tiene
   sesiones, comprueba el rechazo 409 y la alternativa de retirar/crear otro bloque.
10. Toma asistencia con el docente; alumno y apoderado vinculado pueden consultar
    el registro. El apoderado no puede consultar estudiantes de otra familia.
11. Desactiva el vínculo familiar: la siguiente consulta del apoderado ya no permite
    acceder al estudiante. Activa otro año: los horarios personales cambian a ese año.
12. Cierra sesión, recarga y comprueba que la sesión anterior no permite seguir operando.

Para ver HTTP, usa F12 → Network → Fetch/XHR. Los nuevos endpoints y cuerpos se
documentan en [API](API.md). Los errores deben leerse completos, sin tooltips.

## Comprobaciones SQL de solo lectura

Abre PostgreSQL desde la raíz:

```powershell
docker compose exec db psql -U sage -d sage
```

```sql
SELECT u.id, u.identificador, u.activo, u."requiereCambioContrasena",
       array_agg(r.nombre ORDER BY r.nombre) AS roles
FROM "Usuario" u JOIN "UsuarioRol" ur ON ur."usuarioId"=u.id
JOIN "Rol" r ON r.id=ur."rolId" GROUP BY u.id ORDER BY u.id;

SELECT id, codigo, activo FROM "AnioAcademico" ORDER BY codigo;
SELECT * FROM "ApoderadoEstudiante";
SELECT id, "usuarioId", "ultimaActividad", "expiraEn" FROM "SesionAuth";
SELECT id, "tipoEvento", resultado, "usuarioId", "requestId", "fechaHora"
FROM "RegistroAuditoria" ORDER BY id DESC LIMIT 30;
```

No es necesario mostrar hashes ni cookies. Las asociaciones académicas y asistencias
se verifican también con [verificar_flujo.sql](sql/verificar_flujo.sql).

## Casos automatizados asociados

`npm.cmd test` ejecuta tres suites en bases PostgreSQL temporales independientes.
La suite administrativa y la de perfiles empiezan vacías y no usan seed.

| Caso   | Historia | Resultado esperado                                                                                   |
| ------ | -------- | ---------------------------------------------------------------------------------------------------- |
| PER-01 | US-001   | Cuatro perfiles, múltiples roles, cambio inicial obligatorio, permisos y contraseña propia validados |
| PER-02 | US-001   | Bloqueo por cuenta, recuperación tras plazo y auditoría sin secretos                                 |
| PER-03 | US-001   | Sesión inactiva rechazada y borrada; consultas automáticas no renuevan actividad                     |
| PER-04 | US-001   | Alumno propio y familia vinculada; IDs ajenos y vínculos retirados rechazados                        |
| PER-05 | US-023   | Horario personal docente/alumno, datos completos y sin permisos de escritura                         |
| PER-06 | US-023   | Cambios/retiros reflejados; recreación del horario y asistencia histórica coherentes                 |
| PER-07 | US-023   | Único año activo, consulta actualizada y escrituras históricas rechazadas                            |
| PER-08 | US-001   | Auditoría de seguridad exclusiva de administrador, correlacionada e inmutable                        |

La ejecución y evidencias se registran en [VERIFICACION](VERIFICACION.md). Las otras
38 pruebas mantienen la regresión de instalación, administración y asistencia.

## Actualización y límites

`Start-Sage.ps1` genera Prisma y aplica migraciones antes de arrancar. La migración
`20261020120000_acceso_horarios_auditoria` añade perfiles familiares, seguridad,
año activo y retiro lógico de bloques. Conserva datos previos; no requiere seed.
La unicidad del año activo y de los bloques activos usa índices parciales SQL.

Esta ampliación no implementa notas, pagos, recuperación por correo, notificaciones
ni el resto del backlog. El portal utiliza datos académicos y asistencia disponibles;
no sustituye futuras pantallas de evaluaciones o boletas. US-003 sigue pendiente.
