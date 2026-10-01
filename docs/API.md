# API REST de SAGE

Base local: `http://localhost:3000/api/v1`. JSON UTF-8. El frontend usa `credentials: 'include'`. Las respuestas de negocio contienen `{ "success": true, "data": ... }`; el health check devuelve su estado directamente. Los IDs de los ejemplos corresponden a un seed nuevo; en otras bases se deben tomar los IDs recibidos por GET.

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

No hay Swagger UI expuesta; este documento contiene el contrato de los ocho endpoints del prototipo.
