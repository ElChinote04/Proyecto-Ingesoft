# SAGE · Prototipo de arquitectura

Sistema Académico de Gestión Educativa. Este entregable demuestra **US-001 (inicio de sesión y permisos)** y **US-014 (asistencia de alumnos por sesión)** de principio a fin, con lectura y escritura en PostgreSQL. Incluye login, selección de sesión, registro y confirmación con datos reales.

## Inicio rápido en Windows

Requisitos: Windows x64, Docker Desktop abierto con contenedores Linux e Internet durante la primera instalación. Puertos libres: 5432, 3000 y 5173.

En PowerShell, desde la raíz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Sage.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

El primer comando prepara Node **24.21.0** dentro de `.tools/` (descarga oficial verificada con SHA256, sin cambiar el Node global), genera los `.env` que falten con un secreto JWT aleatorio, instala mediante los lockfiles, levanta PostgreSQL, genera Prisma, aplica migraciones y ejecuta el seed. El segundo inicia ambos servidores. No sobrescribe `.env` existentes ni borra la base de datos. La opción de PowerShell solo se aplica al proceso de ese comando.

Abre **http://localhost:5173**. Mantén abierta la terminal mientras demuestras el sistema; Ctrl+C detiene frontend y backend. PostgreSQL conserva sus datos en el volumen Docker.

| Cuenta demo local      | Contraseña    | Comportamiento                              |
| ---------------------- | ------------- | ------------------------------------------- |
| `docente@sage.local`   | `Docente123!` | Ana Torres: registra asistencia             |
| `apoderado@sage.local` | `Docente123!` | Elena Mendoza: acceso restringido al módulo |

Estas credenciales y la contraseña Docker de ejemplo son **exclusivas para desarrollo/demo**. Las contraseñas de usuarios se almacenan con bcrypt, nunca en texto plano.

## Instalación con Node ya disponible

Con Node 24.21.0 y Docker Compose en PATH, en Windows, macOS o Linux:

```sh
npm run setup
npm run dev
```

También puedes ejecutar los servidores por separado, en dos terminales, después del setup:

```sh
npm --prefix backend run dev
npm --prefix frontend run dev
```

`npm --prefix backend start` inicia el backend sin observación de archivos. No necesita compilación: es JavaScript ESM. Para usar el Node local en una terminal PowerShell: `. .\scripts\Use-Node.ps1`.

## Stack

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

Todas las versiones principales solicitadas se instalaron sin sustituciones. Pruebas con `node:test` y Supertest sobre PostgreSQL real. Inter se sirve localmente. Los lockfiles fijan las dependencias; los overrides de `deepmerge-ts` y `mysql2` corrigen dependencias transitivas de las herramientas Prisma, sin introducir MySQL como motor del proyecto.

## Arquitectura y estructura

Flujo: React → REST/JSON → routes → middleware → controllers → services → repositories → Prisma → PostgreSQL. Las respuestas recorren el camino inverso. Controllers no importan Prisma; la autorización se comprueba en backend.

```text
frontend/
  src/api/              Cliente HTTP con credentials: include
  src/context/          Estado de autenticación
  src/hooks/            Consulta de datos y acceso a autenticación
  src/layouts/          Menú y cabecera según permisos
  src/pages/            Login, selección, asistencia, confirmación
  src/components/       Errores y estados de carga
  src/styles/           CSS adaptable basado en Figma
  src/utils/            Formato de fechas y estados
  public/figma/         Vectores del diseño original
backend/
  src/routes/           Presentación: rutas y validación
  src/middleware/       Autenticación, rol y errores centralizados
  src/controllers/      HTTP → servicio → JSON
  src/services/         Reglas de negocio
  src/repositories/     Acceso a datos
  src/config/           Entorno y cliente Prisma
  src/logging/          Winston y archivos físicos
  src/validators/       Esquemas Zod
  src/errors/, utils/   Errores y auditoría reutilizable
  prisma/               Esquema, migración inicial y seed
  tests/, scripts/      Supertest y BD aislada de pruebas
  logs/                 app.log y error.log (generados, ignorados por Git)
scripts/                Setup, inicio conjunto y ayudantes Windows
docs/                   API, arquitectura, trazabilidad y verificación
docker-compose.yml      PostgreSQL 18.6 y volumen persistente
```

Detalles: [arquitectura y decisiones](docs/ARQUITECTURA.md), [API con ejemplos](docs/API.md), [verificación de entrega](docs/VERIFICACION.md).

## Configuración

Se proporcionan `.env.example` en raíz, backend y frontend. Los `.env` reales, logs, dependencias, runtime local y compilados están excluidos de Git.

| Archivo / variable                         | Uso                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| raíz: `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Configuración del contenedor local                                                |
| backend: `NODE_ENV`, `HOST`, `PORT`        | Desarrollo, interfaz local 127.0.0.1 y puerto 3000                                |
| `DATABASE_URL`                             | Conexión a `sage`; debe coincidir con Docker                                      |
| `TEST_DATABASE_URL`                        | Conexión base cuyo nombre termina en `_test`; las pruebas crean otra BD aleatoria |
| `FRONTEND_URL`                             | Origen CORS permitido: http://localhost:5173                                      |
| `JWT_SECRET`                               | Secreto aleatorio de al menos 32 caracteres; lo genera setup                      |
| `JWT_EXPIRES_IN`                           | Vigencia, por defecto `1h`                                                        |
| `LOG_LEVEL`, `LOG_DIR`                     | `info`, `logs` relativo a backend                                                 |
| `DEMO_PASSWORD`                            | Contraseña de las cuentas creadas por el seed                                     |
| frontend: `VITE_API_URL`                   | http://localhost:3000/api/v1                                                      |

Si preparas los archivos manualmente, usa `npm run setup -- --env-only` para generarlos sin instalar ni iniciar Docker. Cambiar `DEMO_PASSWORD` después del primer seed no reemplaza contraseñas existentes. El seed preserva usuarios, matrículas y asistencias.

El prototipo usa HTTP local. Para un despliegue HTTPS se deben proporcionar dominio/origen, secretos, terminación TLS y una configuración de infraestructura propia. `NODE_ENV=production` exige un origen HTTPS y activa `Secure` en la cookie. No se desplegó en AWS ni se configuró TLS en esta entrega local.

## Base de datos

```sh
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm --prefix backend run db:status
```

Migración versionada: `backend/prisma/migrations/20261001022912_initial_sage/migration.sql`. `db:migrate` usa `prisma migrate deploy` y no pide crear ni editar tablas a mano.

El seed crea cuatro roles, las dos cuentas demo, Ana Torres, cinco estudiantes matriculados, Matemática, sección 3.° B del año 2026, aula A-203 y una sesión del **02/10/2026, 08:00–08:45**. Es idempotente: se puede repetir sin duplicar datos ni reiniciar la asistencia. En una instalación nueva, los estados comienzan sin marcar. En el entorno comprobado ya quedó un registro de prueba guardado.

Para detener PostgreSQL sin borrar datos: `npm run db:down`. Para ver estado: `docker compose ps`. No es necesario eliminar el volumen para actualizar ni repetir la demo.

## Flujo para demostrar al profesor

1. Abre http://localhost:3000/api/v1/health: debe indicar `database: connected`.
2. Abre http://localhost:5173 e ingresa como `docente@sage.local` / `Docente123!`.
3. Selecciona Matemática, 3.° B, 2 de octubre de 2026, 08:00–08:45. Pulsa **Continuar**.
4. Marca Carlos: Presente; Lucía: Tardanza; Diego: Ausente; Valeria y Mateo: Presente. Opcionalmente escribe una observación.
5. Pulsa **Guardar asistencia**. La confirmación muestra 5 registros: 3 presentes, 1 tardanza y 1 ausencia, junto al autor y fecha de registro.
6. Pulsa **Revisar asistencia** y recarga. Los estados y observaciones provienen de PostgreSQL y permanecen guardados.
7. Muestra `backend/logs/app.log`: contiene **Asistencia guardada**, `sesionId`, `userId` y `requestId`.
8. Cierra sesión. Una ruta protegida vuelve a pedir autenticación. Ingresa con la cuenta apoderado para mostrar **Acceso restringido**; la API también rechaza estas operaciones con 403.
9. Ejecuta `npm test` para mostrar las comprobaciones de autorización, validación, persistencia y concurrencia.

La selección exige exactamente un estado por alumno. Las observaciones tienen máximo 300 caracteres. Si otra pestaña guarda antes, se devuelve 409 y se ofrece recargar: no se sobrescribe silenciosamente una versión anterior.

## Endpoints principales

Base: http://localhost:3000/api/v1

| Método | Ruta                        | Acceso                      |
| ------ | --------------------------- | --------------------------- |
| GET    | `/health`                   | Público, consulta real a BD |
| POST   | `/auth/login`               | Credenciales                |
| GET    | `/auth/me`                  | Autenticado                 |
| POST   | `/auth/logout`              | Autenticado                 |
| GET    | `/sesiones`                 | DOCENTE, solo sus sesiones  |
| GET    | `/sesiones/:id`             | DOCENTE propietario         |
| GET    | `/sesiones/:id/alumnos`     | DOCENTE propietario         |
| POST   | `/sesiones/:id/asistencias` | DOCENTE propietario         |

El contrato completo, incluyendo `version` al guardar, está en [docs/API.md](docs/API.md).

## Pruebas y compilación

```sh
npm test
npm run lint
npm run build
npm run format:check
```

Las 20 pruebas de integración usan PostgreSQL 18.6 real. Cada ejecución crea una BD aleatoria `sage_run_<id>_test`, aplica la migración desde cero, ejecuta los casos y elimina únicamente esa BD temporal. La cuenta de conexión necesita `CREATEDB` (la cuenta Docker local lo tiene). No se borran datos de `sage`.

`npm run build` crea `frontend/dist`. No hay build de backend. `npm run format` aplica Prettier; para comprobar dependencias: `npm audit`, `npm --prefix backend audit`, `npm --prefix frontend audit`.

## Logs y seguridad

Winston crea `backend/logs/app.log` y `backend/logs/error.log`, JSON por línea, rotación de 5 MB y hasta tres archivos. Registra arranque, disponibilidad de BD, logins, consultas, guardado y errores, con timestamp/nivel/módulo. Las pruebas ejercitan un error 500 controlado: por eso `error.log` tiene entradas verificables sin provocar fallos en la aplicación en uso.

Cookie `sage_session`: HttpOnly, SameSite=Lax, ruta `/api/v1`, Secure en producción. No se guarda JWT en localStorage. El cierre de sesión revoca también su registro en BD. Se comprueban roles y actividad del usuario en cada petición. Helmet, Zod, CORS limitado, bcrypt y consultas Prisma completan la seguridad básica. El login limita a 30 peticiones por IP cada 15 minutos en una instancia local; no implementa un bloqueo institucional de cuentas.

Los logs excluyen credenciales, hashes, tokens y URLs de conexión. Los errores internos no llegan al navegador; el log conserva tipo y marcos de pila para diagnóstico.

## Problemas frecuentes

- **Docker no responde:** abre Docker Desktop y espera que el motor esté listo; ejecuta `docker info`. El instalador se detiene al fallar, sin reintentos infinitos.
- **Puerto ocupado:** detén la otra instancia de SAGE o el proceso que usa 5432/3000/5173. Vite usa `strictPort`, por lo que no cambia de dirección silenciosamente.
- **Node diferente:** usa los scripts PowerShell o carga `. .\scripts\Use-Node.ps1`. El Node del sistema no se modifica.
- **Credenciales de BD inconsistentes:** mantén coordinados raíz `.env` y backend `.env`. Cambiar `POSTGRES_PASSWORD` no cambia la contraseña de un volumen PostgreSQL ya inicializado.
- **Login no conserva sesión:** usa `localhost` en ambas URLs, no mezcles con `127.0.0.1`, y verifica `FRONTEND_URL`/`VITE_API_URL`.
- **Error 409:** otro guardado cambió la versión; pulsa **Recargar sesión**, confirma descartar si hay cambios locales y revisa los datos antes de guardar de nuevo.
- **Error de conexión del frontend:** revisa `/api/v1/health`, la terminal de backend y sus logs. La interfaz ofrece reintentar.

## Alcance de la entrega

Se implementa el prototipo Login + Asistencia acordado, con roles múltiples y perfiles independientes. Pagos, justificaciones, administración de matrículas, gestión de horarios, calificaciones, recuperación de contraseña y otros módulos quedan fuera de este alcance. El seed aporta los datos académicos necesarios para demostrar la asistencia; no añade pantallas de esos módulos.
