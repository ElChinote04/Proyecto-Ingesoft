# API REST de SAGE

Base local: `http://localhost:3000/api/v1`. JSON UTF-8. El frontend usa `credentials: 'include'`. Las respuestas de negocio contienen `{ "success": true, "data": ... }`; el health check devuelve su estado directamente. Los IDs son ilustrativos: usa siempre los devueltos por las altas o GET. Los ejemplos de asistencia de la demo antigua siguen siendo válidos, pero el flujo normal crea los datos mediante la administración sin seed.

## Autenticación y cookies

El login envía `Set-Cookie: sage_session=...; HttpOnly; SameSite=Lax; Path=/api/v1; Expires=...`. El JWT no aparece en el cuerpo de respuesta. En producción se añade Secure. Un cliente API debe conservar y reenviar la cookie; no se usa Bearer en esta entrega.

### POST /auth/login

```json
{ "identificador": "docente@sage.local", "contrasena": "Docente123!" }
```

200:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "identificador": "docente@sage.local",
    "nombre": "Ana Torres",
    "roles": ["DOCENTE"],
    "docenteId": 1
  }
}
```

Identificador requerido, máximo 200 caracteres, normalizado a minúsculas y sin espacios externos. Contraseña requerida, máximo 72 caracteres. Se rechazan propiedades adicionales. Credenciales incorrectas, cuenta inactiva o sin roles: 401 con mensaje genérico. 400 si falta información. Más de 30 solicitudes por IP/15 min: 429.

### GET /auth/me

Sin body. Requiere cookie válida. 200 con el mismo usuario seguro del login; permite varios valores en `roles`. Sin sesión válida: 401.

### POST /auth/logout

Sin body. Requiere cookie válida. Revoca la sesión en PostgreSQL y expira la cookie.

```json
{ "success": true, "data": { "message": "Sesión cerrada." } }
```

Reutilizar el token después devuelve 401. Si la sesión ya venció se responde 401; el frontend vuelve al login igualmente.

## Sesiones de clase

Todos los endpoints siguientes requieren autenticación y rol DOCENTE. Se verifica además que el perfil docente sea propietario de la sesión. No se admite acceso solo por conocer un ID.

### GET /sesiones

Sin body. 200 con arreglo de sesiones activas asignadas al docente, ordenadas por fecha/hora; `[]` si no tiene ninguna.

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "curso": { "id": 1, "nombre": "Matemática" },
      "seccion": { "id": 1, "nombre": "3.° B" },
      "docente": { "id": 1, "nombre": "Ana Torres" },
      "anioAcademico": "2026",
      "fecha": "2026-10-02",
      "horaInicio": "08:00",
      "horaFin": "08:45",
      "aula": "A-203",
      "version": 0
    }
  ]
}
```

### GET /sesiones/:id

Sin body. 200 con `data` igual a un objeto de sesión del ejemplo anterior (sin arreglo). `id` debe ser entero positivo de 32 bits. Una sesión inexistente/inactiva devuelve 404; una sesión de otro docente, 403.

### GET /sesiones/:id/alumnos

200. `sesion` tiene exactamente la estructura del GET anterior. `alumnos` contiene las matrículas activas de estudiantes activos de esa sección; puede estar vacío.

```json
{
  "success": true,
  "data": {
    "sesion": {
      "id": 1,
      "curso": { "id": 1, "nombre": "Matemática" },
      "seccion": { "id": 1, "nombre": "3.° B" },
      "docente": { "id": 1, "nombre": "Ana Torres" },
      "anioAcademico": "2026",
      "fecha": "2026-10-02",
      "horaInicio": "08:00",
      "horaFin": "08:45",
      "aula": "A-203",
      "version": 0
    },
    "alumnos": [
      {
        "alumnoId": 1,
        "nombre": "Carlos Mendoza",
        "codigo": "EST-001",
        "estado": null,
        "observacion": ""
      },
      {
        "alumnoId": 2,
        "nombre": "Lucía Ramos",
        "codigo": "EST-002",
        "estado": null,
        "observacion": ""
      },
      {
        "alumnoId": 3,
        "nombre": "Diego Torres",
        "codigo": "EST-003",
        "estado": null,
        "observacion": ""
      },
      {
        "alumnoId": 4,
        "nombre": "Valeria Sánchez",
        "codigo": "EST-004",
        "estado": null,
        "observacion": ""
      },
      {
        "alumnoId": 5,
        "nombre": "Mateo Ruiz",
        "codigo": "EST-005",
        "estado": null,
        "observacion": ""
      }
    ]
  }
}
```

`estado: null` indica que aún no se registró asistencia. Después de guardar, devuelve el valor persistido y la observación; no se marca PRESENTE automáticamente.

### POST /sesiones/:id/asistencias

Enviar la versión recibida por el último GET y **todos** los alumnos de su respuesta:

```json
{
  "version": 0,
  "asistencias": [
    { "alumnoId": 1, "estado": "PRESENTE" },
    { "alumnoId": 2, "estado": "TARDANZA", "observacion": "Llegó a las 08:12" },
    { "alumnoId": 3, "estado": "AUSENTE" },
    { "alumnoId": 4, "estado": "PRESENTE" },
    { "alumnoId": 5, "estado": "PRESENTE" }
  ]
}
```

Reglas: versión entera no negativa, arreglo de 1 a 500 elementos, IDs enteros positivos, sin duplicados, matrícula activa de la sección, exactamente un registro por alumno. Solo PRESENTE/TARDANZA/AUSENTE. Observación opcional (predeterminada vacía), máximo 300 caracteres tras quitar espacios externos. No admite propiedades adicionales.

200, ejemplo de primer guardado:

```json
{
  "success": true,
  "data": {
    "fechaHora": "2026-10-01T04:57:00.000Z",
    "version": 1,
    "sesion": {
      "id": 1,
      "curso": { "id": 1, "nombre": "Matemática" },
      "seccion": { "id": 1, "nombre": "3.° B" },
      "docente": { "id": 1, "nombre": "Ana Torres" },
      "anioAcademico": "2026",
      "fecha": "2026-10-02",
      "horaInicio": "08:00",
      "horaFin": "08:45",
      "aula": "A-203",
      "version": 1
    },
    "total": 5,
    "resumen": { "PRESENTE": 3, "TARDANZA": 1, "AUSENTE": 1 },
    "registradoPor": "Ana Torres"
  }
}
```

La fecha/hora es la del evento real de guardado. La operación es transaccional y actualiza filas existentes sin duplicarlas. Otro guardado con versión antigua produce 409; recarga por GET antes de enviar nuevamente. No reintentes automáticamente con otra versión sin revisar los cambios del usuario.

## GET /health

Público, sin body. Ejecuta una consulta real a PostgreSQL antes de responder 200:

```json
{ "status": "ok", "database": "connected" }
```

Fallo de BD: 500 con el formato central de error. No declara conexión disponible mediante una constante independiente de la BD.

## Errores

Todas las respuestas de error tienen la misma envoltura. Ejemplo:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos.",
    "details": [{ "campo": "identificador", "mensaje": "Ingresa tu usuario o correo." }],
    "requestId": "id-de-correlacion-de-la-solicitud"
  }
}
```

`details` solo se incluye cuando hay detalles de validación. `X-Request-Id` permite correlacionar la respuesta con logs. Las respuestas usan `Cache-Control: no-store`.

| HTTP | Código posible                                                     | Motivo                                          |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------- |
| 400  | VALIDATION_ERROR, INVALID_JSON                                     | Datos, ID, enum o JSON inválidos                |
| 400  | STUDENT_NOT_ENROLLED, INCOMPLETE_ATTENDANCE                        | Alumno ajeno o padrón incompleto                |
| 401  | UNAUTHENTICATED, INVALID_CREDENTIALS, SESSION_EXPIRED              | Cookie ausente, credenciales o sesión inválidas |
| 403  | FORBIDDEN, NO_TEACHER_PROFILE, SESSION_FORBIDDEN, ORIGIN_FORBIDDEN | Rol, perfil, propiedad u origen no permitidos   |
| 404  | SESSION_NOT_FOUND, NOT_FOUND                                       | Sesión o ruta inexistente                       |
| 409  | DUPLICATE_STUDENT, STALE_VERSION, CONFLICT                         | Duplicado o guardado concurrente                |
| 413  | BODY_TOO_LARGE                                                     | JSON mayor de 100 KB                            |
| 429  | TOO_MANY_ATTEMPTS                                                  | Límite de login por IP                          |
| 500  | INTERNAL_ERROR                                                     | Error interno, detalles seguros solo en logs    |

No hay Swagger UI expuesta. Hay 26 combinaciones método/ruta: ocho originales, dos de instalación y dieciséis administrativas.

## Instalación inicial sin seed

### GET /instalacion

Público. 200 con `data: { requerido: true }` si no hay marcador de instalación ni un usuario con rol ADMINISTRADOR. No devuelve claves ni información de cuentas.

### POST /instalacion

Público, con el mismo límite de intentos del login. Body estricto:

```json
{
  "numeroDocumento": "ADMIN-01",
  "nombres": "María",
  "apellidos": "Dirección",
  "identificador": "admin@colegio.local",
  "contrasena": "UnaClaveDeEjemplo123!",
  "claveInstalacion": "valor-local-obtenido-con-setup:key"
}
```

201 con DTO seguro del usuario. Crea cuatro roles, Persona, Usuario ADMINISTRADOR activo, UsuarioRol, marcador Instalacion y evento de auditoría en una transacción. Rechaza clave inválida (403 INVALID_SETUP_KEY), configuración ausente (503 SETUP_NOT_CONFIGURED) o instalación completada (409 SETUP_COMPLETED). El bloqueo de PostgreSQL impide que dos solicitudes simultáneas creen dos administradores iniciales. La clave no aparece en respuestas, auditoría ni logs.

## Administración

Todas las rutas `/admin/*` requieren cookie válida y rol ADMINISTRADOR. 401 sin autenticación y 403 sin permiso. Las altas devuelven 201; consultas y edición, 200. Todas las mutaciones incorporan auditoría transaccional y logs de éxito tras commit.

### Usuarios

| Método / ruta           | Body y resultado                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET /admin/usuarios     | Array de cuentas con id, personaId, identificador, activo, version, numeroDocumento, nombres, apellidos, roles y docenteId; nunca hashes |
| POST /admin/usuarios    | numeroDocumento, nombres, apellidos, identificador, contrasena, roles y activo opcional (true). Devuelve cuenta segura                   |
| PUT /admin/usuarios/:id | identificador, roles, activo, version y contrasena opcional. Devuelve cuenta con version incrementada                                    |

Roles admitidos: ADMINISTRADOR, DOCENTE, ALUMNO, APODERADO; de uno a cuatro sin repetidos. Una persona puede tener varios. DOCENTE crea/reutiliza su perfil Docente; ALUMNO crea/reutiliza Estudiante. No asignan clases ni matrícula automáticamente. Al añadir un perfil a una persona existente, documento, nombres y apellidos deben coincidir; se conserva una única cuenta por Persona.

Documento: 1–30 caracteres, trim/mayúsculas. Nombres/apellidos: 1–100, trim. Identificador: 1–200, trim/minúsculas. Contraseña de alta o cambio: mínimo 10 caracteres y máximo 72 bytes UTF-8. Body estricto. Una contraseña vacía no sirve como omisión: para conservarla no envíes el campo.

La edición protege la versión (409 STALE_VERSION), el acceso administrativo propio (409 SELF_LOCKOUT) y al último administrador activo (409 LAST_ADMIN). Identificador duplicado: 409 DUPLICATE_IDENTIFIER. Desactivar/cambiar contraseña revoca SesionAuth; cambiar roles se aplica en la siguiente petición. Los perfiles académicos y el historial se conservan al retirar un rol.

### Catálogos

GET `/admin/catalogos` devuelve `{ anios, grados, secciones, cursos, aulas, docentes }`. Secciones incluyen grado/año; docentes incluye solo perfiles con persona y cuenta activas y rol DOCENTE. Cada docente devuelve id, nombre y codigoDocente.

| Alta                            | Body                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| POST /admin/catalogos/anios     | `{ "codigo": "2027" }`, año 1900–2199                                      |
| POST /admin/catalogos/grados    | `{ "nombre": "4.°" }`, 1–50 caracteres                                     |
| POST /admin/catalogos/secciones | `{ "nombre": "V", "gradoId": 1, "anioAcademicoId": 1 }`, nombre 1–30       |
| POST /admin/catalogos/cursos    | `{ "codigo": "COM", "nombre": "Comunicación" }`, código 1–30, nombre 1–100 |
| POST /admin/catalogos/aulas     | `{ "codigo": "V101" }`, código 1–30                                        |

Códigos de curso/aula y nombre de sección se normalizan a mayúsculas. Duplicados: 409 DUPLICATE_RECORD. Referencias inexistentes: 404 REFERENCE_NOT_FOUND. IDs enteros positivos de 32 bits.

### Alumnos y matrícula

GET `/admin/estudiantes` devuelve estudiantes con identidad, código y sus matrículas (id, seccionId, anioAcademicoId, activo, descripcion).

POST `/admin/estudiantes`: `{ numeroDocumento, nombres, apellidos }`. Devuelve perfil Estudiante con id/personaId/codigoEstudiante. No crea credenciales. Reutiliza una Persona coincidente; perfil repetido: 409 STUDENT_EXISTS; documento de otra identidad: 409 PERSON_MISMATCH.

POST `/admin/matriculas`: `{ estudianteId, seccionId }`. Devuelve matrícula activa; el servidor deriva anioAcademicoId de Seccion. No acepta el año enviado por el cliente. Requiere estudiante/persona activos y sección existente. Una matrícula por estudiante/año, incluso si se elige otra sección: 409 DUPLICATE_ENROLLMENT. Una matrícula nueva incorpora al alumno al padrón de esa sección.

### Horarios, asignaciones y sesiones

GET `/admin/horarios` devuelve `{ bloques, sesiones }`. Los bloques incluyen aula, asignacion.curso, asignacion.docente.persona y asignacion.seccion con grado/año. Las sesiones incluyen fecha ISO, horas, bloqueId, activo y version.

POST `/admin/bloques`:

```json
{
  "cursoId": 1,
  "seccionId": 1,
  "docenteId": 1,
  "aulaId": 1,
  "diaSemana": 5,
  "horaInicio": "09:00",
  "horaFin": "09:45"
}
```

El docente debe tener perfil, persona/cuenta activas y rol DOCENTE. Día 1=lunes … 7=domingo. Horas HH:mm de 24 horas, inicio anterior al fin. Crea/reutiliza CursoSeccionDocente y crea el bloque; devuelve bloque con relaciones. No genera sesiones automáticamente.

Un solapamiento de docente, aula o sección dentro del mismo año académico devuelve 409 SCHEDULE_CONFLICT con el recurso y horario incompatibles. El intervalo se considera [inicio, fin), por lo que dos bloques contiguos son válidos. La validación y la escritura se serializan con un advisory lock transaccional en PostgreSQL; un rechazo no deja asignaciones parciales.

POST `/admin/sesiones`: `{ "bloqueId": 1, "fecha": "2027-10-01" }`. Devuelve SesionClase con versión 0. El año y día deben coincidir con el bloque; las horas se derivan del bloque. Errores: 400 YEAR_MISMATCH, DAY_MISMATCH, INVALID_TEACHER o VALIDATION_ERROR; 409 DUPLICATE_CLASS para bloque/fecha repetidos. No recibe ni permite sobrescribir docente/horas desde el cliente.

### Auditoría

GET `/admin/auditoria`: últimos 100 eventos, id descendente, con usuario.identificador, fechaHora, tipoEvento, entidadId y detalle JSON. El historial completo permanece en BD. No hay rutas para alterar eventos.

Eventos administrativos: ADMINISTRADOR_INICIAL_CREADO, USUARIO_CREADO, USUARIO_ACTUALIZADO, CATALOGO_CREADO, ESTUDIANTE_REGISTRADO, MATRICULA_REGISTRADA, BLOQUE_ASIGNADO y SESION_CLASE_CREADA. La asistencia conserva ASISTENCIA_GUARDADA. CATALOGO_CREADO indica el tipo en detalle.catalogo; los restantes tipos identifican el dominio del entidadId.

Catálogos, matrículas, bloques y sesiones tienen altas y consultas en este alcance. No se exponen bajas ni reprogramación de registros con historial.
