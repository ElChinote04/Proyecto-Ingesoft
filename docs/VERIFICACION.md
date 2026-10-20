# Verificación de entrega

## Instalación local simplificada (20 de octubre de 2026)

- **54/54 pruebas aprobadas**: las 46 anteriores y 8 nuevas de instalación.
  Se verificaron producción sin clave/clave incorrecta, configuración protegida
  incompleta, escucha en red, origen remoto, loopback IPv4/IPv6, alta local sin
  clave, dos solicitudes simultáneas y cierre permanente de la instalación.
- La suite administrativa también comprueba el alta protegida con clave válida
  en modo producción. No se afirma un despliegue público real.
- `Start-Sage.ps1` ejecutado contra una BD temporal inicialmente vacía:
  Docker healthy, Prisma generado, cuatro migraciones aplicadas y ambos servidores
  iniciados desde ese único comando. La prueba usa dependencias ya instaladas;
  no equivale a una prueba en una PC Windows recién instalada.
- Formulario local comprobado sin campo de clave ni instrucciones setup:key.
  El primer administrador sigue eligiendo sus datos y contraseña. No se introduce
  una cuenta predefinida ni se ejecuta seed. No hay cambios de esquema ni migraciones nuevas.
- Alta por API sin clave: 201; login: 200; GET de instalación posterior:
  requerido=false. En navegador se comprobó el formulario, su cierre después del
  alta y el acceso a Administración con la cuenta creada. Evidencias:
  [formulario local](evidencias/SAGE_instalacion_local.png) y
  [instalación cerrada](evidencias/SAGE_instalacion_cerrada.png).
- Código y API documentados en README, API, arquitectura y contexto del proyecto.
  Las verificaciones anteriores se conservan a continuación como evidencia histórica.
- Se corrigió una respuesta de /auth/me que podía restaurar el panel después del
  logout. Prueba de navegador con un proxy temporal de latencia: la consulta se
  validó antes del logout y se entregó dos segundos después. El login permaneció
  visible y Administración oculta. [Evidencia](evidencias/SAGE_logout_respuesta_tardia.png).
  El proxy pertenece solo a la prueba; no forma parte de la aplicación ni del arranque.

## Verificación del 20 de octubre de 2026: US-001 y US-023

- **46/46 pruebas de integración aprobadas**, sin omisiones: API 20,
  administración sin seed 18 y perfiles/horarios 8. Las tres suites usan PostgreSQL
  real en bases temporales independientes. El seed opcional conserva su regresión.
- PER-01 a PER-08 de [la ampliación](ITERACION_1_ACCESO_HORARIOS.md) terminaron
  **aprobados**. Incluyen cambio inicial/contraseña propia, bloqueo temporal,
  inactividad sin renovación automática, privacidad entre familias, revocación de
  vínculos, horario personal, edición/retiro/recreación, asistencia visible en portal,
  año activo e inmutabilidad de auditoría de seguridad.
- Migración nueva aplicada en `sage`: comparación de cantidad y SHA-256 del
  contenido de las columnas originales de **las 19 tablas preexistentes** idéntica
  antes/después. Se conservaron 9 usuarios, 5 matrículas, 7 sesiones de clase,
  3 asistencias y 77 eventos anteriores. Se añadieron perfiles familiares y campos;
  las contraseñas existentes no se restablecieron ni se ejecutó seed.
- Interfaz contrastada con el Figma confirmado gCuuBOpsdHJhx289Udq40E:
  horarios personales docente/alumno, paneles alumno/apoderado y cambio inicial.
  Las comprobaciones de navegador usan datos ficticios en una BD temporal distinta
  de `sage`. El cambio de contraseña se ejecuta por pruebas HTTP; en navegador
  se comprueba el formulario obligatorio, sin introducir nuevas credenciales.
- Guardado de horario por formulario comprobado: PUT aceptado con confirmación;
  consulta del alumno recuperó el cambio. Una segunda actualización administrativa
  cambió 09:00–10:00 a 11:00–12:00 y la matriz personal la mostró automáticamente
  sin recargar. También se observó el cierre por inactividad al retomar la prueba.
- Vista estrecha: ancho de página y contenido de 537 px CSS, sin desbordamiento
  horizontal de la página; la matriz conserva desplazamiento dentro de su contenedor.
- `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run format:check` y
  `git diff --check` completados correctamente. La sintaxis Prisma fue formateada.
  `prisma migrate diff` entre PostgreSQL local y el esquema produjo una migración
  vacía: claves foráneas, nulabilidad e índices declarables coinciden. Los índices
  parciales y el trigger de protección se mantienen explícitos en la migración SQL.
- Evidencias actuales: [horario alumno](evidencias/SAGE_horario_alumno.png),
  [horario docente](evidencias/SAGE_horario_docente.png),
  [panel apoderado](evidencias/SAGE_portal_apoderado.png) y
  [cambio inicial](evidencias/SAGE_cambio_inicial.png).
  También: [edición confirmada](evidencias/SAGE_edicion_horario.png) y
  [vista estrecha](evidencias/SAGE_horario_estrecho.png).
- **US-003 excluida por el propietario**: no se afirma auditoría de notas ni pagos.
  Los eventos de seguridad de US-001 y los eventos de operaciones previas se mantienen.

Los apartados siguientes conservan la evidencia histórica de octubre 1/2. Para el
estado funcional actual prevalecen esta sección, API.md y la ampliación enlazada.

Última comprobación del refactor: 2 de octubre de 2026. Las evidencias de navegador que siguen son del 1 de octubre y se identifican como históricas. Windows x64, Node 24.21.0 local al proyecto, Docker Desktop y PostgreSQL 18.6. Rama: feat/prototipo-arquitectura-sage.

## Refactor: PUT sin contadores de edición

- 38 pruebas de integración aprobadas sobre PostgreSQL: 20 de API y 18 administrativas. Se utiliza también el constructor de FormData real del frontend para crear cuentas y editarlas con/sin cambio de contraseña.
- Dos guardados de asistencia válidos responden 200, incluso simultáneos. PUT repetido conserva IDs y no duplica filas; el último padrón completo prevalece. Auditoría registra estados anteriores coherentes.
- Se comprobó ausencia de success en respuestas normales y errores, y de version en cuentas, sesiones y auditoría expuesta por API. Un evento antiguo conserva su contador en la BD, pero no lo expone por HTTP.
- Migración aplicada a la base local sage: comparación por conteos y SHA-256 del contenido de las 19 tablas antes/después (excluyendo únicamente las columnas retiradas) idéntica. No se borraron usuarios, matrículas, sesiones, asistencias ni eventos.
- Lint y build del frontend correctos. Esta revisión no sustituye la evidencia histórica de clics por una nueva prueba de navegador.

## Ampliación: recorrido sin seed

| Comprobación | Resultado observado                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Migraciones  | Tres migraciones aplicadas, incluida eliminación de contadores; datos previos conservados                        |
| Integración  | 38/38 aprobadas: 20 de regresión y 18 administrativas, sin fallos ni omisiones                                   |
| Inicio vacío | La suite administrativa verifica cero cuentas/roles/años antes de usar HTTP; no importa seed                     |
| Concurrencia | Solo una instalación o asignación solapada prospera; dos ediciones válidas mediante PUT se aceptan               |
| Permisos     | Docente sin administración; acceso restringido a sus clases; cambios de roles efectivos en la siguiente petición |
| Revocación   | Desactivar o cambiar contraseña invalida las sesiones anteriores                                                 |
| Identidad    | Un usuario multirrol y perfiles reutilizados sin duplicar Persona                                                |
| Matrícula    | Una por estudiante/año; año derivado de la sección, referencias válidas                                          |
| Horarios     | Cruces de docente, aula y sección rechazados; bloques contiguos admitidos                                        |
| Sesiones     | Fecha real y día/año coherentes con bloque; horas derivadas; duplicados rechazados                               |
| Guardado     | Asistencia y auditoría atómicas; nueva lectura recupera estado/observación                                       |
| Logs         | Eventos físicos comprobados; sin contraseñas, hashes, claves ni JWT; suite administrativa sin errores 500        |
| Frontend     | Lint sin errores; build correcto; formularios comprobados en navegador                                           |
| SQL          | Script de solo lectura ejecutado con ON_ERROR_STOP; cuatro comprobaciones de incongruencias en cero              |

Las dos suites usan bases PostgreSQL aleatorias distintas, ambas migradas desde cero. Los logs se aíslan en backend/logs/tests. La suite anterior conserva la regresión del seed opcional y el error 500 controlado; el recorrido nuevo no depende de ninguno de ellos.

También se repitió `Setup-Sage.ps1` completo: instalación de los tres lockfiles, auditorías npm sin vulnerabilidades reportadas, Docker healthy, Prisma generado y ninguna migración pendiente. Terminó sin ejecutar seed y conservó las cuentas, las seis matrículas/asistencias y los eventos anteriores. `Start-Sage.ps1` volvió a levantar ambos servidores. Los controles finales de lint, build, formato, sintaxis JS y whitespace de Git terminaron correctamente.

## Recorrido histórico ejecutado en navegador (1 de octubre)

En la base local existente se conservaron los cinco alumnos y asistencias anteriores. Se creó por formularios un conjunto independiente, sin ejecutar el seed:

1. Administrador inicial; cierre del alta pública e inicio de sesión.
2. Elena Verificación, cuenta docente.verificacion@sage.local con DOCENTE y APODERADO y perfil Docente #2.
3. Año 2027, grado 4.°, sección V, curso Comunicación y aula V101.
4. Lucía Verificación (documento VER-EST-01), Estudiante #6 y matrícula #6.
5. Asignación y bloque #2, viernes 09:00–09:45; sesión #2 para 2027-10-01.
6. Login docente, selección de su clase y padrón que incorpora automáticamente a Lucía.
7. TARDANZA y observación; guardado, confirmación y recarga completa del navegador.
8. Auditoría visible para el administrador y lectura SQL de todos los vínculos.

PostgreSQL confirmó Usuario #4, ambos roles, matrícula/año coherentes, sesión con asistencia guardada, una asistencia nueva con el docente como creador/modificador y evento ASISTENCIA_GUARDADA #13. Los logs incluyen el mismo guardado y su requestId. Los IDs describen este entorno local; no son constantes de la aplicación.

También se envió un formulario sin roles: mostró “Los datos enviados no son válidos. Selecciona al menos un rol.” completo. En viewport de 360 px no hubo desbordamiento horizontal de la página (ancho del contenido 345 px por scrollbar). El navegador no reportó errores ni advertencias de consola en el recorrido comprobado.

Evidencias: [asistencia nueva después de recargar](evidencias/SAGE_flujo_sin_seed.png), [auditoría administrativa](evidencias/SAGE_auditoria_sin_seed.png).

## Cobertura automatizada

La suite administrativa verifica instalación protegida y simultánea, cuenta multirrol/perfil, hashing, duplicados sin filas parciales, permisos, catálogos, matrícula, reutilización de identidad ALUMNO, asignación, los tres tipos de cruce por separado, concurrencia, bloques contiguos, fechas, padrón, persistencia/auditoría, retiro/restauración de roles, edición mediante PUT, revocación y ausencia de secretos.

La suite de 20 pruebas previa mantiene health, autenticación/cookies, login fallido, 401/403, propiedad de sesión, padrón, guardado, enums, matrícula ajena, reload por GET, duplicados/PUT repetido, validaciones, guardados simultáneos, múltiples roles, actividad/tokens, CORS/JSON, seed idempotente, logout y error 500 seguro.

## Evidencia de la entrega inicial

Las capturas originales siguen disponibles: [selección](evidencias/SAGE_sesiones.png), [asistencia](evidencias/SAGE_asistencia.png), [confirmación](evidencias/SAGE_confirmacion.png), [error de login](evidencias/SAGE_login_error.png). Corresponden a la demostración inicial basada en seed.

En ese recorrido se comprobaron 5 asistencias: Carlos PRESENTE, Lucía TARDANZA, Diego AUSENTE, Valeria PRESENTE, Mateo PRESENTE. Esa información se conservó al aplicar la ampliación. El error.log local contiene errores 500 controlados de pruebas anteriores a la separación de logs; no representan un fallo del nuevo flujo.

## Alcance de la verificación

Verificación local con PostgreSQL real y navegador. No se afirma ejecución de CI remoto ni despliegue AWS/HTTPS. La prueba de base vacía es de integración HTTP; la prueba visual se hizo sobre un conjunto nuevo en la base existente, conservando datos previos.

En la verificación inicial solo había altas/consultas académicas. La ampliación del 20 de octubre añade edición y retiro lógico de bloques, año activo, acceso privado y contraseña propia. Pagos, notas, bajas/traslados de matrículas, justificaciones y recuperación por correo continúan pendientes. Esta ampliación sí revisa los estándares de programación/interfaz aportados.

Para reproducir el proceso y comprobar cada clic: [Flujo completo](FLUJO_COMPLETO.md) y [consultas SQL](sql/verificar_flujo.sql).
