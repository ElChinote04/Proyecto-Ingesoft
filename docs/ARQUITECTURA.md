# Arquitectura, fuentes y decisiones del prototipo

## Fuentes y trazabilidad

Se revisaron el Plan de Proyecto (19 páginas), las tres hojas de Backlog (2).xlsx (24 historias), SAGE_Diagrama_Clases_expanded.svg, Documentacion_Diagrama_Clases.pdf (8 páginas), las imágenes adjuntas y el repositorio. La ampliación del 20 de octubre también aplica los Estándares de Interfaz Gráfica, Estándares de Programación de SAGE y los requisitos funcionales aportados. Las decisiones de stack/capas provienen de las instrucciones expresas de implementación.

La revisión previa precedió al código. El alcance inicial era Login + Asistencia; la ampliación solicitada permite crear todo su contexto académico sin seed. El flujo de pagos continúa como contexto futuro. De matrícula se implementan registro y asignación, sin baja ni traslado.

| Fuente                            | Requisito                                                                | Realización                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| US-001, Must                      | Validar credenciales, opciones por rol, registrar intentos fallidos      | Cuatro perfiles, acceso privado alumno/familia, cambio inicial, bloqueo por cuenta, inactividad, permisos y auditoría de seguridad |
| US-023, Should                    | Horario semanal docente/alumno de solo lectura                           | Consulta personalizada por año activo, actualización automática y matriz semanal                                                   |
| Backlog, A14:M14, US-014, Must    | Presente, tardanza o inasistencia por alumno/sesión, fecha/sección/curso | Pantallas de sesión/asistencia, transacción y relaciones Prisma                                                                    |
| US-014 depende de US-001 y US-005 | Contar con usuarios y matrículas                                         | Alta de alumnos y matrícula única por año desde administración                                                                     |
| Retroalimentación y US-002        | Crear/editar/desactivar cuentas y varios roles por usuario               | Usuario N:M Rol, perfiles independientes, administración y revocación                                                              |
| US-021                            | Asignar curso/docente/aula en horario visual                             | Matriz semanal por año/sección/docente/aula y creación de sesiones                                                                 |
| US-022                            | Evitar cruces de docente, aula y sección                                 | Validación transaccional de solapamientos, incluida concurrencia                                                                   |
| Retroalimentación                 | Auditoría consistente                                                    | Timestamps comunes, helpers auditCreate/auditUpdate y evento de guardado                                                           |
| Retroalimentación                 | Errores de login completos                                               | Bloques que crecen y ajustan líneas, sin truncado ni tooltips                                                                      |

Figma: [Prototipo SAGE](https://www.figma.com/design/gCuuBOpsdHJhx289Udq40E/SAGE-%E2%80%94-Prototipo-Completo?node-id=2003-2). Se inspeccionaron SEC 01–03 y ASI 01–03, incluyendo los nodos 2005:7, 2013:1022, 2013:1109 y 2013:1229. Se conservaron Inter, morado #4c1d95, navegación lateral, formulario, tabla de estados y confirmación. Los vectores de radio/menú/chevron se sirven localmente. Se retiraron controles de simulación del diseño; cantidades y resultados se calculan con datos reales. Los mensajes no tienen altura fija.

## Capas

- **Presentación:** routes, controllers y middleware. Lee HTTP, valida con Zod, aplica autenticación/autorización, serializa JSON. El middleware global normaliza errores y registra diagnóstico seguro.
- **Negocio:** services. Comprueba propiedad de la sesión, matrícula activa, cobertura de todos los alumnos, estados válidos, duplicados. Genera DTOs sin datos sensibles.
- **Datos:** repositories. Centraliza consultas Prisma y transacciones. config/database.js es el punto de construcción del cliente y del adaptador PostgreSQL.

El seed opcional y las pruebas acceden al ORM para preparar/verificar datos. La suite administrativa crea sus datos exclusivamente mediante HTTP. El arranque importa la conexión únicamente para cerrarla ordenadamente. Los controllers y React no acceden al ORM.

## Modelo de dominio

Se mantiene **Estudiante**, nombre del diagrama. En asistencia, `alumnoId` representa su ID. Persona tiene asociaciones opcionales con Usuario, Docente, Estudiante y Apoderado. No hay herencia excluyente. ADMINISTRADOR es un rol; APODERADO puede coexistir con DOCENTE sin crear otra Persona. ApoderadoEstudiante vincula perfiles con parentesco y actividad; permite acceso privado a información y asistencia de estudiantes vinculados.

AsistenciaEstudiante → Matricula → Estudiante/Seccion. AsistenciaEstudiante → SesionClase → CursoSeccionDocenteAula → CursoSeccionDocente → Curso/Seccion/Docente. Seccion → Grado/AnioAcademico. Esas relaciones conservan el contexto del modelo suministrado y evitan copiar curso, docente o fecha en cada fila de asistencia.

No se crea una tabla base Asistencia sin uso: los atributos requeridos por la única especialización implementada están en AsistenciaEstudiante. El enum usa PRESENTE/TARDANZA/AUSENTE, como exige el alcance explícito. JUSTIFICADA y el flujo de justificación del modelo amplio quedan fuera de este prototipo.

La combinación sesión/matrícula es única; la matrícula estudiante/año también. Las claves foráneas mantienen las relaciones. El alta de matrícula deriva el año de su sección. El alta de sesión deriva horas del bloque y valida su día y año. Docente se crea/reutiliza al asignar DOCENTE; los cursos, horarios y sesiones requieren asignación posterior explícita.

## Guardado y auditoría

PUT /sesiones/:id/asistencias guarda el padrón completo. Una transacción READ COMMITTED toma un bloqueo interno de la sesión antes de leerla, valida permisos y padrón, hace upsert de cada asistencia y añade un RegistroAuditoria. Un error revierte toda la operación. No se compara ninguna versión del cliente: ambos guardados válidos se aceptan y prevalece el último. El bloqueo interno evita mezclar dos padrones o registrar un estado anterior incorrecto en auditoría; no exige recargar ni reenviar al usuario.

`creadoEn`/`modificadoEn` representan el estado actual del registro. `creadoPorId`/`modificadoPorId` se asignan mediante helpers reutilizables. RegistroAuditoria conserva eventos históricos con autor, instante, sesión y transiciones de estado; no repite una copia completa de cada entidad ni de las observaciones. No hay endpoints para modificar eventos. Los eventos anteriores al refactor conservan su detalle original en BD; la API omite el antiguo contador version al devolverlos.

## Autenticación

JWT firmado HS256 con subject, issuer, audience y jti; el servidor guarda el identificador de sesión y su vencimiento. La cookie HttpOnly contiene el token y el frontend nunca lo lee. La BD permite revocar inmediatamente al cerrar sesión y rechazar cuentas desactivadas. Los roles se consultan en cada petición. Los tokens vencidos/manipulados y las sesiones revocadas devuelven 401; rol o sesión ajena, 403.

Se usa bcrypt con costo 12 y comparación equivalente para identificadores inexistentes. La contraseña nunca sale en un DTO. Además del límite de 30 solicitudes por IP/15 min, hay bloqueo por intentos consecutivos por cuenta y vencimiento por inactividad, configurables. Las altas y restablecimientos administrativos exigen cambiar contraseña; se revocan todas las sesiones al hacerlo. Los usuarios previos mantienen sus credenciales. La sesión absoluta conserva JWT_EXPIRES_IN.

Los eventos de acceso incluyen resultado, origen y requestId; usuario puede ser nulo si la cuenta no existe. Un trigger impide modificar/eliminar eventos. Esto satisface seguridad de acceso de US-001; **US-003 no se implementó**, por indicación del propietario, y continúa pendiente con los módulos de notas y pagos.

## Decisiones menores

- node:test + Supertest: suficientes para integrar API, Prisma y PostgreSQL sin introducir otra capa de configuración.
- Hash routing: login, instalación, administración y asistencia funcionan sin configuración especial del servidor estático.
- Fecha de sesión almacenada como DATE; hora del bloque como HH:mm; instantes de auditoría en UTC y mostrados en hora de Lima, coherente con el proyecto.
- PUT reemplaza los estados y observaciones del padrón activo completo; repetirlo mantiene una fila por matrícula/sesión. Cada solicitud conserva su evento de auditoría.
- Logs rotados y JSON para revisión; sin cuerpos de solicitud, tokens ni mensajes libres del driver que puedan incluir secretos.
- CSS y JavaScript ESM/JSX, sin TypeScript ni framework adicional de interfaz.

## Límites de esta arquitectura de demostración

Una instancia de backend, limitador por IP en memoria y PostgreSQL local Docker. No hay despliegue público, balanceador, TLS configurado, recuperación por correo ni todos los módulos del plan. Catálogos, matrículas y sesiones tienen creación/consulta; traslados y bajas académicas siguen pendientes. Los bloques del año activo admiten PUT y retiro lógico; si ya tienen sesiones no se editan para preservar su historial. Las cuentas admiten edición administrativa y cambio de contraseña propia. Los nombres y documentos existentes no se cambian desde esa pantalla.

## Instalación y administración sin seed

En desarrollo local no se solicita INITIAL_SETUP_KEY: el backend exige NODE_ENV=development, escucha en loopback y conexión real de loopback. En producción/test o acceso por red se conserva la clave, generada por Setup y consultable por el operador mediante setup:key; se compara con tiempo constante. No se acepta una bandera del cliente para omitirla. Bajo una transacción se verifica ausencia de administrador/marcador, se crea la cuenta y se cierra Instalacion. El marcador impide reabrir el alta aunque se retiren roles. No se distribuye una cuenta administradora con contraseña predefinida. Start-Sage.ps1 prepara una copia nueva automáticamente y arranca el sistema sin seed con un solo comando.

Las mutaciones administrativas adquieren un advisory lock transaccional común antes de leer invariantes, con aislamiento READ COMMITTED. Las solicitudes que esperan leen el estado comprometido más reciente al obtenerlo. Esto permite comprobar cruces, última cuenta administradora e instalación única sin carreras; también funciona entre procesos que utilicen el mismo repositorio contra la misma BD. Es una serialización deliberada del pequeño volumen administrativo de este prototipo. Escrituras SQL externas que evadan el servicio no están cubiertas por esta validación.

Los bloques se solapan cuando inicioA < finB e inicioB < finA, en el mismo día/año, y comparten docente, aula o sección. Se permiten intervalos contiguos. No se generan horarios automáticamente. La edición de usuarios usa PUT sin contador de edición; desactivar/cambiar contraseña revoca SesionAuth. Se mantienen los perfiles e historial al retirar un rol.

Cada mutación guarda RegistroAuditoria en la misma transacción. El log de éxito se emite después del commit. Se reutiliza el historial existente y no se introducen entidades de auditoría duplicadas. La consulta administrativa muestra los últimos 100 eventos, sin editar/eliminar.

Se inspeccionaron también las referencias Figma de usuarios (2007:263), matrícula (2010:672), matriz horaria (2017:1623) y asignación (2019:1746). Se adaptaron a varios roles, catálogos reales y los pasos necesarios para una instalación vacía; se conservaron paleta, tipografía, navegación y formularios. No se incorporaron controles de simulación.

## Horario personal y año activo

La migración del 20 de octubre añade AnioAcademico.activo y fechas opcionales de inicio/fin (ambas presentes y ordenadas si se envían). Un índice parcial SQL permite un único año activo; otro limita duplicados de bloques activos, permitiendo conservar los retirados. El primer año nuevo queda activo y los posteriores requieren activación administrativa. Para datos anteriores se elige el año calendario si existe y, en su defecto, el más reciente.

El repositorio del portal consulta solo asignaciones del docente o de la matrícula activa del alumno en ese año. La API no admite un ID de otra persona. React muestra el formato semanal de Figma y actualiza cada 10 segundos con la pestaña visible, al abrir y recuperar foco. Estas lecturas no prolongan la sesión por inactividad. No hay WebSockets ni permisos de edición en la consulta personal.

Los nodos Figma 2137:4051, 2184:4996, 2006:193, 2006:257 y 2051:2677 se revisaron con contexto y captura. El portal muestra solo datos implementados, sin cifras simuladas de notas o pagos. Contratos, reglas, casos y límites: [US-001 y US-023](ITERACION_1_ACCESO_HORARIOS.md).
