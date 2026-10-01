# Recorrido completo sin seed

Esta guía crea los datos desde los formularios. No ejecuta `db:seed`, no inserta filas con SQL y no necesita cuentas predefinidas. Las consultas son de solo lectura. Los IDs se generan automáticamente: usa los que muestran la interfaz y PostgreSQL, no supongas que empiezan en 1.

## 0. Preparar y observar el sistema

Desde la raíz del repositorio en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Sage.ps1
. .\scripts\Use-Node.ps1
npm.cmd run setup:key
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

Conserva la clave mostrada por setup:key para el paso siguiente. No la publiques ni la uses como contraseña de usuario. En otra terminal:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:3000/api/v1/health
```

**Debes ver:** contenedor PostgreSQL healthy; health `status: ok`, `database: connected`; frontend en http://localhost:5173. En una instalación nueva no habrá usuarios, alumnos ni cursos hasta que los crees.

Para observar cada clic, abre las herramientas del navegador (F12) → **Network/Red** → **Fetch/XHR** y activa **Preserve log/Conservar registro**. Inspecciona el método, estado HTTP y respuesta de cada operación. No compartas capturas de contraseñas en el cuerpo de login ni de cookies.

Para observar logs en vivo, en otra terminal:

```powershell
Get-Content .\backend\logs\app.log -Tail 20 -Wait
```

Ctrl+C detiene solo esa lectura. Cada respuesta de la API incluye X-Request-Id; búscalo en el log para relacionar clic y operación.

## 1. Crear el administrador inicial

En Login → **Configurar el primer administrador** completa documento, nombres, apellidos, usuario/correo, contraseña elegida (mínimo 10 caracteres) y clave de instalación. Pulsa **Crear administrador**.

**Debes ver:** POST `/api/v1/instalacion` → 201; confirmación y enlace a iniciar sesión. GET `/api/v1/instalacion` devuelve `requerido: false`. Una segunda alta pública queda rechazada con 409. Las cuatro definiciones de rol se crean con esta operación, sin datos académicos de ejemplo.

Inicia sesión con esa cuenta: POST `/auth/login` → 200; aparece Administración. La cookie HttpOnly se instala en el navegador y se crea SesionAuth en PostgreSQL.

## 2. Crear docente y asignar roles

En **Usuarios y roles**, usa estos datos ficticios para reproducir las consultas de esta guía:

| Campo               | Valor                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Documento           | VER-DOC-01                                                          |
| Nombres / apellidos | Elena / Verificación                                                |
| Usuario o correo    | docente.verificacion@sage.local                                     |
| Contraseña          | Elige y conserva una contraseña de prueba de al menos 10 caracteres |
| Roles               | DOCENTE y APODERADO                                                 |
| Estado              | Cuenta activa                                                       |

Pulsa **Crear usuario**. **Debes ver:** 201 en POST `/admin/usuarios`, mensaje con ambos roles y el ID del perfil docente. El listado muestra una cuenta con dos roles. Se crean Persona, Usuario, dos UsuarioRol y Docente en una transacción; la contraseña se guarda con bcrypt.

Si esos datos ya existen, reutiliza la cuenta o usa otro documento/identificador y cambia los filtros SQL. No es necesario borrar registros anteriores.

## 3. Comprobar cuenta y login del docente

Ejecuta este comando desde la raíz cada vez que quieras comprobar el estado completo:

```powershell
Get-Content -Raw -Encoding utf8 .\docs\sql\verificar_flujo.sql |
  docker compose exec -T db psql -U sage -d sage -v ON_ERROR_STOP=1
```

El **bloque 1** debe mostrar cuenta activa, roles DOCENTE/APODERADO y docente_id. No muestra hashes. Los bloques académicos estarán vacíos hasta completar los siguientes pasos.

Cierra sesión del administrador, inicia como docente y ejecuta de nuevo la consulta. El **bloque 2** debe mostrar al menos una sesión de autenticación vigente. **Todavía debe aparecer “Sin sesiones asignadas”**, porque crear el rol/perfil no asigna una clase. El docente no tiene menú administrativo; la API administrativa devuelve 403 para su cuenta.

Cierra sesión y vuelve al administrador. Si usas dos ventanas para alternar cuentas, una debe tener un perfil de navegador separado o ser privada; dos pestañas normales comparten cookie.

## 4. Crear catálogos académicos

En **Catálogos académicos**, crea en este orden:

| Formulario    | Valores de prueba                   |
| ------------- | ----------------------------------- |
| Año académico | 2027                                |
| Grado         | 4.°                                 |
| Sección       | Año 2027, grado 4.°, nombre V       |
| Curso         | Código COM-VER, nombre Comunicación |
| Aula          | V101                                |

Cada botón **Crear…** debe devolver 201 y añadir el registro a su listado. Un año o código repetido debe devolver 409 sin duplicar filas. Si ya existen, selecciónalos; no los vuelvas a crear.

Las tablas son AnioAcademico, Grado, Seccion, Curso y Aula. Para inspeccionar cualquiera en psql:

```powershell
docker compose exec db psql -U sage -d sage
```

Dentro de psql: `\dt` muestra tablas, `\d "Seccion"` muestra estructura y `SELECT * FROM "Seccion";` muestra sus filas. `\q` sale. DBeaver/pgAdmin son opcionales: host localhost, puerto 5432, base/usuario sage y contraseña del .env local.

## 5. Registrar alumno y matricularlo

En **Alumnos y matrículas** → **Registrar alumno**:

| Campo               | Valor                |
| ------------------- | -------------------- |
| Documento           | VER-EST-01           |
| Nombres / apellidos | Lucía / Verificación |

Pulsa **Registrar alumno**: POST `/admin/estudiantes` → 201, código de estudiante generado y fila “Sin matrícula”. Registrar a un alumno no requiere crearle credenciales de login.

En **Asignar grado y sección**, selecciona ese alumno, año 2027, grado 4.°, sección V. Pulsa **Confirmar matrícula**: POST `/admin/matriculas` → 201 y aparece matrícula activa.

Ejecuta el SQL del paso 3. El **bloque 3** debe mostrar alumno, matrícula, 2027, 4.°, V y `anio_coherente = t`. Intentar otra matrícula del mismo alumno en 2027 devuelve 409. El año se deriva de la sección en el servidor.

Puedes repetir este paso para los cinco alumnos de la demo original o cualquier otro padrón. Todos aparecerán automáticamente en la sección correspondiente; no hay número fijo en React.

## 6. Asignar curso, docente, aula y horario

En **Horarios y sesiones** → **Nueva asignación horaria**:

| Campo                 | Valor              |
| --------------------- | ------------------ |
| Año / grado / sección | 2027 · 4.° V       |
| Curso                 | Comunicación       |
| Docente               | Elena Verificación |
| Aula                  | V101               |
| Día                   | Viernes            |
| Inicio / fin          | 09:00 / 09:45      |

Pulsa **Guardar asignación**: POST `/admin/bloques` → 201; el bloque aparece en la matriz semanal. Puedes filtrar por año, sección, docente o aula.

**En BD:** CursoSeccionDocente enlaza curso/sección/docente; CursoSeccionDocenteAula agrega aula, día y horas. El **bloque 4** del SQL muestra esos vínculos, todavía sin sesión si no has completado el siguiente paso.

Prueba un horario solapado para el mismo docente, aula o sección: debe devolver 409 con el motivo y conservar los datos del formulario. No debe aparecer otra asignación. Un bloque contiguo, por ejemplo 09:45–10:30, es válido. La comprobación también protege dos guardados simultáneos.

## 7. Crear sesión de clase con fecha

En la misma pantalla, **Crear sesión de clase**: selecciona el bloque anterior y fecha **2027-10-01**, que es viernes. Pulsa **Crear sesión**: POST `/admin/sesiones` → 201. Debe aparecer en Sesiones creadas con versión 0.

No escribes de nuevo docente ni horas: se derivan del bloque. Un jueves, otra anualidad o una fecha imposible devuelve 400. Repetir el mismo bloque y fecha devuelve 409.

El **bloque 4** del SQL debe mostrar ahora la sesión, fecha y horas. Los catálogos y la asignación anteriores son suficientes: no se necesita seed ni una inserción manual adicional.

## 8. Abrir sesión y comprobar el padrón

Cierra sesión del administrador e inicia como el nuevo docente. En **Control de asistencia**, selecciona sección 2027 · 4.° V, curso Comunicación y fecha/bloque del paso anterior. Pulsa **Continuar**.

**Debes ver:** GET `/sesiones` y `/sesiones/:id/alumnos` → 200; aparece Lucía Verificación con todos los estados sin marcar. Otro docente no ve esa sesión y recibe 403 si intenta acceder por ID.

El **bloque 5** del SQL debe mostrar a Lucía con matrícula y campos de asistencia NULL antes del primer guardado. Su presencia viene de Matricula, no de una lista en el frontend.

## 9. Guardar asistencia, comprobar y recargar

Marca **Tardanza**, escribe “Llegó a las 09:12” y pulsa **Guardar asistencia**. Si añadiste más alumnos, marca un estado para cada uno.

**Debes ver:** POST `/sesiones/:id/asistencias` → 200; confirmación con total real, estados, docente y hora de registro. La versión pasa de 0 a 1.

Comprueba:

1. **PostgreSQL, bloque 5:** una AsistenciaEstudiante por matrícula/sesión, TARDANZA, observación, creadoPor/modificadoPor e instantes.
2. **PostgreSQL, bloque 6:** evento ASISTENCIA_GUARDADA, usuario docente, ID de sesión y transición anterior → nuevo. Las creaciones administrativas también tienen evento.
3. **Logs:** “Asistencia guardada”, sesionId, userId, total y requestId. No contiene contraseña, JWT ni observación.
4. **Recarga:** pulsa **Revisar asistencia** y F5. Deben permanecer estado y observación. Los GET vuelven a leer PostgreSQL.
5. **Auditoría en pantalla:** vuelve al administrador → Auditoría → Actualizar auditoría → Ver detalle del evento.
6. **Coherencia:** el bloque 7 del SQL debe devolver cero en matrícula/año, asistencia/sección, sesión/bloque y cruces de horarios.

Volver a guardar con la versión vigente actualiza la misma fila y añade un evento; no duplica asistencia. Para comprobar conflicto, abre la misma sesión en dos pestañas del docente antes de guardar: la primera guarda y la segunda recibe 409. Debe recargar y revisar antes de continuar.

## 10. Cierre y comprobación automática

En usuarios puedes editar identificador, roles, estado y contraseña. Quitar DOCENTE deniega inmediatamente el acceso a asistencia; volver a asignarlo conserva su perfil y clases. Desactivar o cambiar contraseña revoca sesiones previas. No puedes quitarte el acceso administrativo ni desactivar tu propia cuenta.

```powershell
. .\scripts\Use-Node.ps1
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run format:check
```

Debes obtener **38 pruebas aprobadas**, lint sin errores, build correcto y formato válido. La suite administrativa crea su propia BD vacía y reproduce las altas, matrícula, asignación, sesión y asistencia sin seed. Los datos de esta demostración permanecen en sage.

Para consultar otro recorrido, añade filtros al comando SQL:

```powershell
Get-Content -Raw -Encoding utf8 .\docs\sql\verificar_flujo.sql |
  docker compose exec -T db psql -U sage -d sage -v ON_ERROR_STOP=1 `
    -v docente='otro@colegio.local' -v documento='OTRO-DOCUMENTO'
```

No necesitas borrar el volumen para repetir la demostración: crea otra persona o sesión con fecha válida. Los IDs pueden saltar tras intentos fallidos; eso no indica duplicación ni pérdida de datos.
