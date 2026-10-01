# Arquitectura, fuentes y decisiones del prototipo

## Fuentes y trazabilidad

Se revisaron el Plan de Proyecto (19 páginas), las tres hojas de Backlog (2).xlsx (24 historias), SAGE_Diagrama_Clases_expanded.svg, Documentacion_Diagrama_Clases.pdf (8 páginas), las tres imágenes adjuntas y el repositorio inicial. El usuario aplazó el documento separado de arquitectura y el estándar de programación. Las decisiones de stack/capas de este prototipo provienen de sus instrucciones posteriores de implementación.

La revisión previa precedió al código. El alcance inicial era Login + Asistencia; la ampliación solicitada permite crear todo su contexto académico sin seed. El flujo de pagos continúa como contexto futuro. De matrícula se implementan registro y asignación, sin baja ni traslado.

| Fuente                                           | Requisito                                                                | Realización                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Backlog, Historia de usuario A4:M4, US-001, Must | Validar credenciales, opciones por rol, registrar intentos fallidos      | bcrypt/JWT, menú DOCENTE, requireAuth/requireRole, Winston               |
| Backlog, A14:M14, US-014, Must                   | Presente, tardanza o inasistencia por alumno/sesión, fecha/sección/curso | Pantallas de sesión/asistencia, transacción y relaciones Prisma          |
| US-014 depende de US-001 y US-005                | Contar con usuarios y matrículas                                         | Alta de alumnos y matrícula única por año desde administración           |
| Retroalimentación y US-002                       | Crear/editar/desactivar cuentas y varios roles por usuario               | Usuario N:M Rol, perfiles independientes, administración y revocación    |
| US-021                                           | Asignar curso/docente/aula en horario visual                             | Matriz semanal por año/sección/docente/aula y creación de sesiones       |
| US-022                                           | Evitar cruces de docente, aula y sección                                 | Validación transaccional de solapamientos, incluida concurrencia         |
| Retroalimentación                                | Auditoría consistente                                                    | Timestamps comunes, helpers auditCreate/auditUpdate y evento de guardado |
| Retroalimentación                                | Errores de login completos                                               | Bloques que crecen y ajustan líneas, sin truncado ni tooltips            |

Figma: [Prototipo SAGE](https://www.figma.com/design/gCuuBOpsdHJhx289Udq40E/SAGE-%E2%80%94-Prototipo-Completo?node-id=2003-2). Se inspeccionaron SEC 01–03 y ASI 01–03, incluyendo los nodos 2005:7, 2013:1022, 2013:1109 y 2013:1229. Se conservaron Inter, morado #4c1d95, navegación lateral, formulario, tabla de estados y confirmación. Los vectores de radio/menú/chevron se sirven localmente. Se retiraron controles de simulación del diseño; cantidades y resultados se calculan con datos reales. Los mensajes no tienen altura fija.

## Capas

- **Presentación:** routes, controllers y middleware. Lee HTTP, valida con Zod, aplica autenticación/autorización, serializa JSON. El middleware global normaliza errores y registra diagnóstico seguro.
- **Negocio:** services. Comprueba propiedad de la sesión, matrícula activa, cobertura de todos los alumnos, estados válidos, duplicados y versión. Genera DTOs sin datos sensibles.
- **Datos:** repositories. Centraliza consultas Prisma y transacciones. config/database.js es el punto de construcción del cliente y del adaptador PostgreSQL.

El seed opcional y las pruebas acceden al ORM para preparar/verificar datos. La suite administrativa crea sus datos exclusivamente mediante HTTP. El arranque importa la conexión únicamente para cerrarla ordenadamente. Los controllers y React no acceden al ORM.

## Modelo de dominio

Se mantiene **Estudiante**, nombre del diagrama. En asistencia, `alumnoId` representa su ID. Persona se relaciona opcionalmente con Usuario, Docente y Estudiante mediante composición. No hay herencia excluyente. ADMINISTRADOR habilita gestión; APODERADO puede coexistir con DOCENTE sin crear otra Persona. No se implementa todavía vínculo de representación familiar porque este recorrido no lo utiliza.

AsistenciaEstudiante → Matricula → Estudiante/Seccion. AsistenciaEstudiante → SesionClase → CursoSeccionDocenteAula → CursoSeccionDocente → Curso/Seccion/Docente. Seccion → Grado/AnioAcademico. Esas relaciones conservan el contexto del modelo suministrado y evitan copiar curso, docente o fecha en cada fila de asistencia.

No se crea una tabla base Asistencia sin uso: los atributos requeridos por la única especialización implementada están en AsistenciaEstudiante. El enum usa PRESENTE/TARDANZA/AUSENTE, como exige el alcance explícito. JUSTIFICADA y el flujo de justificación del modelo amplio quedan fuera de este prototipo.

La combinación sesión/matrícula es única; la matrícula estudiante/año también. Las claves foráneas mantienen las relaciones. El alta de matrícula deriva el año de su sección. El alta de sesión deriva horas del bloque y valida su día y año. Docente se crea/reutiliza al asignar DOCENTE; los cursos, horarios y sesiones requieren asignación posterior explícita.

## Guardado, auditoría y concurrencia

Una transacción serializable valida la sesión y el padrón, compara la versión, incrementa SesionClase.version, hace upsert de cada asistencia y añade un RegistroAuditoria. Un error revierte toda la operación. Una versión antigua o conflicto concurrente devuelve 409 para que el usuario recargue.

`creadoEn`/`modificadoEn` representan el estado actual del registro. `creadoPorId`/`modificadoPorId` se asignan mediante helpers reutilizables. RegistroAuditoria conserva eventos históricos con autor, instante, sesión, versión y transiciones de estado; no repite una copia completa de cada entidad ni de las observaciones. No hay endpoints para modificar eventos.

## Autenticación

JWT firmado HS256 con subject, issuer, audience y jti; el servidor guarda el identificador de sesión y su vencimiento. La cookie HttpOnly contiene el token y el frontend nunca lo lee. La BD permite revocar inmediatamente al cerrar sesión y rechazar cuentas desactivadas. Los roles se consultan en cada petición. Los tokens vencidos/manipulados y las sesiones revocadas devuelven 401; rol o sesión ajena, 403.

Se usa bcrypt con costo 12 y comparación de costo equivalente para identificadores inexistentes. La contraseña nunca sale en un DTO. El límite de 30 solicitudes de login por IP/15 min es una protección técnica local, no una política académica inferida de la pantalla de bloqueo de Figma.

## Decisiones menores

- node:test + Supertest: suficientes para integrar API, Prisma y PostgreSQL sin introducir otra capa de configuración.
- Hash routing: login, instalación, administración y asistencia funcionan sin configuración especial del servidor estático.
- Fecha de sesión almacenada como DATE; hora del bloque como HH:mm; instantes de auditoría en UTC y mostrados en hora de Lima, coherente con el proyecto.
- `version` en el POST evita pérdida silenciosa de cambios simultáneos.
- Logs rotados y JSON para revisión; sin cuerpos de solicitud, tokens ni mensajes libres del driver que puedan incluir secretos.
- CSS y JavaScript ESM/JSX, sin TypeScript ni framework adicional de interfaz.

## Límites de esta arquitectura de demostración

Una instancia de backend, limitador de login en memoria y PostgreSQL local Docker. No hay despliegue público, balanceador, TLS configurado, recuperación de contraseña ni todos los módulos del plan global. Catálogos, matrículas, bloques y sesiones tienen creación/consulta; sus bajas, traslados y reprogramaciones no forman parte de este recorrido. Los usuarios sí permiten editar identificador, roles, actividad y contraseña. Los nombres y documentos de identidades existentes no se cambian desde esta pantalla.

## Instalación y administración sin seed

INITIAL_SETUP_KEY se genera localmente y se consulta mediante setup:key. El endpoint de instalación compara la clave con tiempo constante; bajo una transacción verifica ausencia de administrador/marcador, crea la cuenta y cierra Instalacion. Este marcador impide reabrir el alta inicial aunque posteriormente se alteren roles. No hay cuenta administradora con contraseña predefinida en la distribución.

Las mutaciones administrativas adquieren un advisory lock transaccional común antes de leer invariantes, con aislamiento READ COMMITTED. Las solicitudes que esperan leen el estado comprometido más reciente al obtenerlo. Esto permite comprobar cruces, última cuenta administradora e instalación única sin carreras; también funciona entre procesos que utilicen el mismo repositorio contra la misma BD. Es una serialización deliberada del pequeño volumen administrativo de este prototipo. Escrituras SQL externas que evadan el servicio no están cubiertas por esta validación.

Los bloques se solapan cuando inicioA < finB e inicioB < finA, en el mismo día/año, y comparten docente, aula o sección. Se permiten intervalos contiguos. No se generan horarios automáticamente. La edición de usuarios compara Usuario.version; desactivar/cambiar contraseña revoca SesionAuth. Se mantienen los perfiles e historial al retirar un rol.

Cada mutación guarda RegistroAuditoria en la misma transacción. El log de éxito se emite después del commit. Se reutiliza el historial existente y no se introducen entidades de auditoría duplicadas. La consulta administrativa muestra los últimos 100 eventos, sin editar/eliminar.

Se inspeccionaron también las referencias Figma de usuarios (2007:263), matrícula (2010:672), matriz horaria (2017:1623) y asignación (2019:1746). Se adaptaron a varios roles, catálogos reales y los pasos necesarios para una instalación vacía; se conservaron paleta, tipografía, navegación y formularios. No se incorporaron controles de simulación.
