# Arquitectura, fuentes y decisiones del prototipo

## Fuentes y trazabilidad

Se revisaron el Plan de Proyecto (19 páginas), las tres hojas de Backlog (2).xlsx (24 historias), SAGE_Diagrama_Clases_expanded.svg, Documentacion_Diagrama_Clases.pdf (8 páginas), las tres imágenes adjuntas y el repositorio inicial. El usuario aplazó el documento separado de arquitectura y el estándar de programación. Las decisiones de stack/capas de este prototipo provienen de sus instrucciones posteriores de implementación.

La revisión previa precedió al código. Los flujos adjuntos de pago y matrícula se consideraron contexto del dominio; el alcance posterior excluye implementarlos.

| Fuente                                           | Requisito                                                                | Realización                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Backlog, Historia de usuario A4:M4, US-001, Must | Validar credenciales, opciones por rol, registrar intentos fallidos      | bcrypt/JWT, menú DOCENTE, requireAuth/requireRole, Winston               |
| Backlog, A14:M14, US-014, Must                   | Presente, tardanza o inasistencia por alumno/sesión, fecha/sección/curso | Pantallas de sesión/asistencia, transacción y relaciones Prisma          |
| US-014 depende de US-001 y US-005                | Contar con usuarios y matrículas                                         | Autenticación real y matrículas demo persistidas; no CRUD de matrícula   |
| Retroalimentación y US-002                       | Varios roles por usuario                                                 | Usuario N:M Rol mediante UsuarioRol; prueba DOCENTE + APODERADO          |
| Retroalimentación                                | Auditoría consistente                                                    | Timestamps comunes, helpers auditCreate/auditUpdate y evento de guardado |
| Retroalimentación                                | Errores de login completos                                               | Bloques que crecen y ajustan líneas, sin truncado ni tooltips            |

Figma: [Prototipo SAGE](https://www.figma.com/design/gCuuBOpsdHJhx289Udq40E/SAGE-%E2%80%94-Prototipo-Completo?node-id=2003-2). Se inspeccionaron SEC 01–03 y ASI 01–03, incluyendo los nodos 2005:7, 2013:1022, 2013:1109 y 2013:1229. Se conservaron Inter, morado #4c1d95, navegación lateral, formulario, tabla de estados y confirmación. Los vectores de radio/menú/chevron se sirven localmente. Se retiraron controles de simulación del diseño; cantidades y resultados se calculan con datos reales. Los mensajes no tienen altura fija.

## Capas

- **Presentación:** routes, controllers y middleware. Lee HTTP, valida con Zod, aplica autenticación/autorización, serializa JSON. El middleware global normaliza errores y registra diagnóstico seguro.
- **Negocio:** services. Comprueba propiedad de la sesión, matrícula activa, cobertura de todos los alumnos, estados válidos, duplicados y versión. Genera DTOs sin datos sensibles.
- **Datos:** repositories. Centraliza consultas Prisma y transacciones. config/database.js es el punto de construcción del cliente y del adaptador PostgreSQL.

Seed y pruebas acceden al ORM para preparar/verificar datos. El arranque importa la conexión únicamente para cerrarla ordenadamente. Los controllers y React no acceden al ORM.

## Modelo de dominio

Se mantiene **Estudiante**, nombre del diagrama. En el contrato HTTP se usa `alumnoId`, que representa su ID. Persona se relaciona opcionalmente con Usuario, Docente y Estudiante mediante composición. No hay herencia excluyente de roles. APODERADO y ADMINISTRADOR son roles disponibles; sus módulos/perfiles específicos no se necesitan para este flujo.

AsistenciaEstudiante → Matricula → Estudiante/Seccion. AsistenciaEstudiante → SesionClase → CursoSeccionDocenteAula → CursoSeccionDocente → Curso/Seccion/Docente. Seccion → Grado/AnioAcademico. Esas relaciones conservan el contexto del modelo suministrado y evitan copiar curso, docente o fecha en cada fila de asistencia.

No se crea una tabla base Asistencia sin uso: los atributos requeridos por la única especialización implementada están en AsistenciaEstudiante. El enum usa PRESENTE/TARDANZA/AUSENTE, como exige el alcance explícito. JUSTIFICADA y el flujo de justificación del modelo amplio quedan fuera de este prototipo.

La combinación sesión/matrícula es única; la matrícula estudiante/año también. Las claves foráneas mantienen las relaciones. La matrícula demo y el bloque de aula son datos de apoyo, sin implementar los módulos de matrícula u horarios.

## Guardado, auditoría y concurrencia

Una transacción serializable valida la sesión y el padrón, compara la versión, incrementa SesionClase.version, hace upsert de cada asistencia y añade un RegistroAuditoria. Un error revierte toda la operación. Una versión antigua o conflicto concurrente devuelve 409 para que el usuario recargue.

`creadoEn`/`modificadoEn` representan el estado actual del registro. `creadoPorId`/`modificadoPorId` se asignan mediante helpers reutilizables. RegistroAuditoria conserva eventos históricos con autor, instante, sesión, versión y transiciones de estado; no repite una copia completa de cada entidad ni de las observaciones. No hay endpoints para modificar eventos.

## Autenticación

JWT firmado HS256 con subject, issuer, audience y jti; el servidor guarda el identificador de sesión y su vencimiento. La cookie HttpOnly contiene el token y el frontend nunca lo lee. La BD permite revocar inmediatamente al cerrar sesión y rechazar cuentas desactivadas. Los roles se consultan en cada petición. Los tokens vencidos/manipulados y las sesiones revocadas devuelven 401; rol o sesión ajena, 403.

Se usa bcrypt con costo 12 y comparación de costo equivalente para identificadores inexistentes. La contraseña nunca sale en un DTO. El límite de 30 solicitudes de login por IP/15 min es una protección técnica local, no una política académica inferida de la pantalla de bloqueo de Figma.

## Decisiones menores

- node:test + Supertest: suficientes para integrar API, Prisma y PostgreSQL sin introducir otra capa de configuración.
- Hash routing: las cuatro pantallas funcionan sin configuración especial de rutas del servidor estático.
- Fecha de sesión almacenada como DATE; hora del bloque como HH:mm; instantes de auditoría en UTC y mostrados en hora de Lima, coherente con el proyecto.
- `version` en el POST evita pérdida silenciosa de cambios simultáneos.
- Logs rotados y JSON para revisión; sin cuerpos de solicitud, tokens ni mensajes libres del driver que puedan incluir secretos.
- CSS y JavaScript ESM/JSX, sin TypeScript ni framework adicional de interfaz.

## Límites de esta arquitectura de demostración

Una instancia de backend, limitador de login en memoria y PostgreSQL local Docker. No hay despliegue público, balanceador, TLS configurado, recuperación de contraseña, roles administrables desde pantallas ni todos los módulos del plan global. El modelo admite varios roles; la cuenta docente demo tiene DOCENTE y la coexistencia se verifica en pruebas aisladas. El prototipo satisface el flujo solicitado sin dar por implementadas esas funciones futuras.
