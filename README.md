# SAGE · Prototipo de arquitectura

Sistema Académico de Gestión Educativa. Permite completar el recorrido **administrador → docente → alumno → matrícula → horario → sesión → asistencia**, con PostgreSQL, auditoría y logs. **La instalación no ejecuta el seed:** todas las cuentas y los datos académicos se pueden crear desde la aplicación.

Se cubren US-001, gestión de cuentas y roles de US-002, registro/matrícula de US-005, asistencia de US-014, asignación horaria de US-021 y validación de cruces de US-022 para este recorrido. [Fuentes y límites](docs/ARQUITECTURA.md).

**Para continuar con otro integrante o una nueva IA:** [contexto completo de implementación](docs/CONTEXTO_COMPLETO_PROT_SAGE.md) y [mensaje para iniciar otro chat](docs/INICIO_NUEVO_CHAT.md). Incluyen modelo, API, reglas, configuración, comprobaciones y pendientes reales.

## Actualizar una instalación existente al contrato sin versiones

Detén el servidor anterior con Ctrl+C. Desde la raíz, después de obtener estos cambios:

```powershell
. .\scripts\Use-Node.ps1
npm.cmd run db:generate
npm.cmd run db:migrate
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

Mantén Docker Desktop funcionando. La migración elimina únicamente los contadores version de Usuario y SesionClase y conserva sus datos. Recarga el navegador para usar el frontend actualizado. Asistencia usa PUT (el POST antiguo ya no existe); usuarios conserva PUT sin version. Las respuestas usan `{ data: ... }` o `{ error: ... }`, sin success. Las instalaciones nuevas reciben el esquema actualizado al ejecutar Setup-Sage.ps1.

## Inicio rápido en Windows

Requisitos: Git para obtener el repositorio, Windows x64, Docker Desktop abierto con contenedores Linux e Internet durante la primera instalación. Puertos libres: 5432, 3000 y 5173. No necesitas instalar Node ni PostgreSQL globalmente.

En PowerShell, desde la raíz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Sage.ps1
. .\scripts\Use-Node.ps1
npm.cmd run setup:key
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

1. Setup prepara Node **24.21.0** local en `.tools/`, verifica su SHA256 oficial, instala los lockfiles, levanta PostgreSQL, genera Prisma y aplica las migraciones. Genera JWT_SECRET e INITIAL_SETUP_KEY aleatorios; conserva configuración y datos existentes.
2. `setup:key` muestra al operador la clave local para crear el primer administrador. No es su contraseña ni se almacena en los logs.
3. Abre [SAGE](http://localhost:5173), pulsa **Configurar el primer administrador** y elige sus datos de acceso. Usa la clave anterior. La operación solo puede completarse una vez.
4. Inicia sesión y sigue **Usuarios → Catálogos → Alumnos y matrículas → Horarios y sesiones**. Después ingresa como docente para tomar asistencia.

Mantén abierta la terminal de inicio. Ctrl+C detiene ambos servidores; PostgreSQL conserva los datos en el volumen Docker. La opción de PowerShell solo afecta al proceso de ese comando.

**Guía clic por clic con comprobaciones HTTP/SQL/logs:** [Flujo completo sin seed](docs/FLUJO_COMPLETO.md).

## Actualizar una instalación existente

Con los servidores detenidos, actualiza la rama y vuelve a ejecutar Setup:

```powershell
git switch feat/prototipo-arquitectura-sage
git pull --ff-only
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Sage.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

Setup instala las dependencias fijadas, añade la clave inicial si falta y aplica migraciones sin borrar datos. Las cuentas y asistencias anteriores permanecen. Si todavía no existe administrador, créalo mediante la configuración inicial; si ya existe, ingresa con esa cuenta.

## Con Node ya disponible

Con Node 24.21.0 y Docker Compose en PATH, en Windows, macOS o Linux:

```sh
npm run setup
npm run setup:key
npm run dev
```

También puedes ejecutar `npm --prefix backend run dev` y `npm --prefix frontend run dev` en terminales separadas. `npm --prefix backend start` inicia el backend sin observar archivos; es JavaScript ESM y no requiere build.

## Stack y estructura

| Componente                   | Versión |
| ---------------------------- | ------- |
| Node.js                      | 24.21.0 |
| React / React DOM            | 19.3.0  |
| Vite                         | 8.3.1   |
| Express                      | 5.2.1   |
| PostgreSQL                   | 18.6    |
| Prisma / client / adapter-pg | 7.10.0  |
| Zod                          | 4.6.5   |
| jsonwebtoken                 | 9.0.3   |
| bcrypt                       | 6.0.0   |
| Winston                      | 3.19.0  |

React → REST/JSON → routes/middleware/controllers → services → repositories → Prisma → PostgreSQL. La autorización y las reglas de negocio se aplican en backend. Inter y los vectores de Figma se sirven localmente. JavaScript ESM/JSX y CSS.

```text
frontend/src/
  api/, context/, hooks/       HTTP y autenticación
  components/, layouts/       Formularios, feedback y navegación por rol
  pages/                      Instalación, administración, login y asistencia
  styles/, utils/             Estilos y formatos
backend/src/
  routes/, middleware/, controllers/  Presentación y autorización
  services/                   Reglas de negocio
  repositories/               Persistencia y transacciones
  validators/, config/, errors/, logging/, utils/
backend/prisma/               Esquema, migraciones y seed opcional
backend/tests/                Integración con PostgreSQL real
backend/logs/                 Logs generados, excluidos de Git
scripts/                      Instalación, arranque y clave inicial
docs/                         Arquitectura, API, flujo y evidencias
docs/sql/verificar_flujo.sql   Comprobaciones de solo lectura
```

Los lockfiles fijan las dependencias. Los overrides de deepmerge-ts/mysql2 afectan herramientas Prisma; PostgreSQL sigue siendo el único motor usado.

## Configuración

Los archivos reales de entorno, runtime, logs, dependencias y compilados están excluidos de Git.

| Archivo / variable                     | Uso                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| raíz: POSTGRES_PASSWORD, POSTGRES_PORT | Contenedor y puerto                                                           |
| backend: NODE_ENV, HOST, PORT          | Desarrollo, 127.0.0.1, puerto 3000                                            |
| DATABASE_URL                           | Conexión a sage, coherente con Docker                                         |
| TEST_DATABASE_URL                      | Conexión base cuyo nombre termina en _test; se crean bases efímeras distintas |
| FRONTEND_URL                           | Origen CORS: http://localhost:5173                                            |
| JWT_SECRET, JWT_EXPIRES_IN             | Secreto generado y vigencia de sesión, por defecto 1h                         |
| INITIAL_SETUP_KEY                      | Clave aleatoria local; solo sirve antes del primer administrador              |
| LOG_LEVEL, LOG_DIR                     | info y logs relativo a backend                                                |
| DEMO_PASSWORD                          | Contraseña del seed opcional                                                  |
| frontend: VITE_API_URL                 | http://localhost:3000/api/v1                                                  |

`npm run setup -- --env-only` prepara la configuración sin instalar ni iniciar Docker. Mantén coordinadas las credenciales de raíz y backend; cambiar POSTGRES_PASSWORD no cambia la contraseña de un volumen existente.

## Base de datos y seed opcional

```sh
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm --prefix backend run db:status
```

Las migraciones crean el modelo e Instalacion; la tercera elimina los contadores técnicos de edición de Usuario y SesionClase sin borrar sus registros. Se usa migrate deploy, sin editar tablas a mano. Para detener sin borrar datos: `npm run db:down`. Estado: `docker compose ps`.

`npm run db:seed` queda como opción explícita para la antigua demo y la suite de regresión. Crea Ana Torres (`docente@sage.local`), Elena Mendoza (`apoderado@sage.local`), cinco alumnos, Matemática, 3.° B, aula A-203 y sesión 02/10/2026, 08:00–08:45. Contraseña de ejemplo: `Docente123!`, configurable con DEMO_PASSWORD antes del primer seed. No crea administrador y conserva contraseñas/asistencias al repetirse. **No se necesita para instalar ni demostrar el nuevo flujo.**

## Pruebas y comprobaciones

```sh
npm test
npm run lint
npm run build
npm run format:check
```

38 pruebas de integración: 20 de regresión y 18 del recorrido administrativo. Cada suite crea una BD aleatoria propia `sage_run_<id>_test`, aplica ambas migraciones y elimina exclusivamente esa BD temporal. La suite administrativa comienza vacía y nunca importa el seed. Requiere CREATEDB, disponible en el contenedor local. No reinicia sage.

Los logs de pruebas quedan en `backend/logs/tests/<id>/`, separados de la aplicación. Build genera frontend/dist. [Resultados y evidencias](docs/VERIFICACION.md).

Consulta de comprobación desde PowerShell:

```powershell
Get-Content -Raw -Encoding utf8 .\docs\sql\verificar_flujo.sql |
  docker compose exec -T db psql -U sage -d sage -v ON_ERROR_STOP=1
```

Por defecto filtra al docente `docente.verificacion@sage.local` y al alumno con documento `VER-EST-01` de la guía. No muestra contraseñas ni modifica registros. Puedes pasar `-v docente='otro@colegio.local' -v documento='OTRO-DOCUMENTO'`.

## Seguridad y consistencia

- Usuario N:M Rol con perfiles independientes: DOCENTE y APODERADO pueden coexistir.
- bcrypt costo 12, altas de 10 caracteres mínimo y 72 bytes máximo; sin contraseñas en DTOs, auditoría o logs.
- JWT en cookie HttpOnly/SameSite=Lax, Secure en producción, sin localStorage. Logout, desactivación y cambio de contraseña revocan sesiones. Roles y actividad se consultan en cada petición.
- Solo ADMINISTRADOR administra; solo el docente asignado accede a su asistencia. Una cuenta nueva no recibe clases automáticamente.
- Matrícula única por alumno/año, año derivado de la sección y sesiones coherentes con día/año/horas del bloque.
- Cruces de docente, aula y sección comprobados bajo bloqueo transaccional en PostgreSQL. Se permiten bloques contiguos.
- Asistencia y auditoría en una transacción READ COMMITTED, con clave única sesión/matrícula. PUT actualiza el padrón completo o los datos editables de una cuenta sin exigir contadores de edición; prevalece el último guardado.
- Errores completos, requestId, logs JSON rotados (5 MB, tres archivos), Helmet, CORS limitado y Zod estricto.

El límite de acceso/instalación es 30 solicitudes por IP cada 15 minutos en una instancia. El prototipo usa HTTP local. Producción requiere infraestructura y secretos propios, origen HTTPS y terminación TLS. No se ha desplegado públicamente.

## Problemas frecuentes

- **Docker no responde:** abre Docker Desktop y ejecuta docker info. Setup se detiene al fallar, sin bucles.
- **Puerto ocupado:** detén la otra instancia; Vite usa strictPort.
- **Node diferente:** carga `. .\scripts\Use-Node.ps1`; no modifica el Node global.
- **No conserva sesión:** usa localhost en ambos servidores y revisa FRONTEND_URL/VITE_API_URL.
- **Sin sesiones:** crea el usuario DOCENTE, su bloque académico y una sesión con fecha; recarga la selección.
- **Sin alumnos:** comprueba la matrícula activa en la sección y año de la sesión.
- **409:** puede ser un duplicado, cruce horario o una regla de protección administrativa. Lee el mensaje para corregir los datos.
- **Clave inicial inválida:** ejecuta setup, consulta setup:key y reinicia el backend si estaba abierto.
- **Sin conexión:** comprueba [health](http://localhost:3000/api/v1/health), la terminal y los logs.

## Documentación y límites

[Flujo comprobable](docs/FLUJO_COMPLETO.md) · [API](docs/API.md) · [Arquitectura](docs/ARQUITECTURA.md) · [Verificación](docs/VERIFICACION.md) · [Cambios](CHANGELOG.md).

La ampliación permite construir todos los datos necesarios para asistencia sin seed. No implementa pagos, calificaciones, justificaciones, recuperación de contraseña ni todo el plan global. Catálogos, matrículas, bloques y sesiones tienen alta y consulta; sus bajas, traslados y reprogramaciones quedan fuera de este recorrido. Las cuentas admiten edición de identificador, roles, estado y contraseña. No hay generación automática de horarios, CI remoto ni despliegue AWS/TLS.
