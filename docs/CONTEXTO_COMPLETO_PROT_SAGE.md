# SAGE: contexto completo de implementación y continuidad

Documento de traspaso para el equipo y asistentes de programación como Codex o Claude.

**Fecha de revisión del código:** 2 de octubre de 2026. **Versión de referencia:** commit `b77829959668744dec34d5e42caf3ee605a23dca`, rama `feat/prototipo-arquitectura-sage`. Este documento se redactó después de ese commit. Actualizado también para el refactor local del 2 de octubre: PUT sin version y respuestas sin success. Describe el código con estos cambios; las evidencias de navegador corresponden al 1 de octubre. Las 38 pruebas de API, lint, build y preservación de datos durante la migración se volvieron a verificar el 2 de octubre; véase VERIFICACION.md.

**Repositorio:** <https://github.com/ElChinote04/Proyecto-Ingesoft>. No depende del historial del chat para entenderse. Los nombres de archivos relativos se resuelven desde la raíz del repositorio, salvo los enlaces Markdown entre documentos.

## Índice

1. [Qué está construido y qué se debe conservar](#1-qué-está-construido-y-qué-se-debe-conservar)
2. [Fuentes, alcance e historias de usuario](#2-fuentes-alcance-e-historias-de-usuario)
3. [Tecnologías y arquitectura](#3-tecnologías-y-arquitectura)
4. [Mapa del código](#4-mapa-del-código)
5. [Modelo de datos y relaciones](#5-modelo-de-datos-y-relaciones)
6. [Reglas de negocio y transacciones](#6-reglas-de-negocio-y-transacciones)
7. [Autenticación, autorización y seguridad](#7-autenticación-autorización-y-seguridad)
8. [API y validaciones](#8-api-y-validaciones)
9. [Frontend y comportamiento de pantallas](#9-frontend-y-comportamiento-de-pantallas)
10. [Auditoría, logs y diagnóstico](#10-auditoría-logs-y-diagnóstico)
11. [Configuración e instalación](#11-configuración-e-instalación)
12. [Recorrido completo y comprobaciones](#12-recorrido-completo-y-comprobaciones)
13. [Pruebas y evidencia disponible](#13-pruebas-y-evidencia-disponible)
14. [Límites y pendientes reales](#14-límites-y-pendientes-reales)
15. [Cómo continuar sin romper el proyecto](#15-cómo-continuar-sin-romper-el-proyecto)
16. [Documentos y contexto que debe recibir otra IA](#16-documentos-y-contexto-que-debe-recibir-otra-ia)

## 1. Qué está construido y qué se debe conservar

SAGE significa **Sistema Académico de Gestión Educativa**. La entrega actual es un **prototipo de arquitectura funcional**, ampliado para completar desde cero este recorrido:

1. Preparar PostgreSQL, migraciones y parámetros locales.
2. Crear el primer administrador mediante una clave de instalación.
3. Crear una cuenta docente con uno o varios roles; generar su perfil académico.
4. Crear año, grado, sección, curso y aula.
5. Registrar un estudiante y matricularlo en una sección del año correspondiente.
6. Asignar curso, sección, docente, aula, día y horario.
7. Crear una sesión de clase para una fecha compatible con ese bloque.
8. Iniciar sesión como docente, consultar su clase y obtener el padrón real.
9. Registrar PRESENTE, TARDANZA o AUSENTE y una observación opcional.
10. Comprobar persistencia, autoría, auditoría, logs y recuperación tras recargar.

Todo ese recorrido funciona mediante formularios y API sobre PostgreSQL. **La instalación normal no ejecuta seed, no crea cuentas de demostración y no requiere insertar registros por SQL.** El seed antiguo sigue disponible únicamente como opción y como parte de una suite de regresión.

No se ha implementado todo el sistema académico del Plan. Hay un subconjunto de dominio coherente con el recorrido anterior. Pagos, calificaciones y otros módulos siguen fuera del producto actual.

Decisiones que debe respetar quien continúe:

- JavaScript, React/Vite, Node/Express, PostgreSQL y Prisma; comunicación REST/JSON.
- Backend de tres capas: presentación, negocio y datos. Sin Prisma en controllers ni acceso a BD desde React.
- `Usuario` N:M `Rol` mediante `UsuarioRol`. Los perfiles se componen con `Persona`; no son subclases mutuamente excluyentes.
- La autorización, matrícula, propiedad de clase, concurrencia y consistencia se validan en backend.
- Datos reales en PostgreSQL. El estado React sirve para editar, no reemplaza la persistencia.
- Parámetros fuera del código mediante `.env`; solo las plantillas `.env.example` se versionan.
- Errores completos y legibles, particularmente en Login. Sin truncarlos ni depender de tooltips.
- Mantener el recorrido sin seed y compatibilidad con datos previos.

La última restricción del propietario sobre Git fue **no crear todavía un pull request**. Este contexto no autoriza por sí mismo publicar, desplegar, borrar datos, cambiar el alcance o abrir un PR. Las instrucciones explícitas de la nueva tarea determinarán qué acciones realizar.

## 2. Fuentes, alcance e historias de usuario

### 2.1 Material de origen

El trabajo previo revisó estos archivos proporcionados por el propietario:

| Fuente                                                                    | Uso en el proyecto                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Plan_de_Proyecto_Ingenieria_de_Software_2026-2_actualizado.docx (3).pdf` | Plan funcional; 19 páginas en la revisión original                                     |
| `Backlog (2).xlsx`                                                        | Tres hojas y 24 historias revisadas; prioridades, dependencias y criterios funcionales |
| `SAGE_Diagrama_Clases_expanded.svg`                                       | Modelo de dominio de referencia                                                        |
| `Documentacion_Diagrama_Clases.pdf`                                       | Explicación del modelo; 8 páginas en la revisión original                              |
| Tres imágenes adjuntas                                                    | Flujo de pagos, vista del diagrama de clases y flujo de matrícula                      |
| Texto posterior de implementación                                         | Stack obligatorio, capas, seguridad, flujo Login/Asistencia y criterios de prueba      |
| Solicitud posterior de recorrido sin seed                                 | Ampliación a administración, catálogos, matrícula, asignaciones, horarios y sesiones   |
| Retroalimentación de evaluación                                           | Multirrol, auditoría consistente y mensajes de Login íntegros                          |

Los documentos originales externos no se encuentran todos versionados en el repositorio. Este documento sintetiza su aplicación al código, pero **no reemplaza los criterios originales para desarrollar módulos nuevos**. Solicitar al equipo el Plan, Backlog y diagrama si una tarea nueva depende de ellos.

El documento separado de arquitectura y el estándar separado de programación **no fueron entregados**. El propietario indicó expresamente que no eran necesarios por ahora y que los aportaría después. No afirmar que se revisaron ni que se certificó conformidad con un estándar todavía ausente.

Prioridad acordada ante diferencias: decisiones arquitectónicas expresamente cerradas; Backlog y Plan para función; diagrama para dominio; estándar cuando se entregue para convenciones. Las correcciones explícitas posteriores del propietario deben incorporarse: por ejemplo, el diseño multirrol corrige la jerarquía excluyente del material previo.

### 2.2 Trazabilidad del alcance

| Historia         | Aplicación en esta entrega                                                                 | Límite de la afirmación                                                          |
| ---------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **US-001, Must** | Validación de credenciales, acceso según roles, registro de login fallido, sesión y logout | No incorpora recuperación de contraseña ni MFA                                   |
| **US-002**       | Alta, edición de identificador/roles/actividad/contraseña, varios roles, revocación        | No es un CRUD completo de todos los datos personales                             |
| **US-005**       | Registro de estudiante y matrícula por año/grado/sección                                   | Sin bajas, traslados ni ciclo completo del diagrama de matrícula                 |
| **US-014, Must** | Asistencia de cada alumno por sesión: presente, tardanza, ausente; persistencia y consulta | No incorpora justificaciones, avisos familiares ni reportes académicos generales |
| **US-021**       | Asignación manual curso/sección/docente/aula; matriz semanal y sesiones fechadas           | Sin generación automática de horarios ni reprogramación                          |
| **US-022**       | Rechazo de cruces de docente, aula y sección, incluida concurrencia por API                | No existe una restricción de exclusión SQL que cubra escrituras externas         |

US-014 depende de autenticación y matrícula (US-001/US-005); el recorrido ampliado añade la preparación académica que antes hacía el seed. US-022 complementa la asignación de US-021. La auditoría implementada no significa que se haya completado una historia más amplia de auditoría de notas/pagos, como US-003, ni todos los Must del Backlog.

El texto inicial excluía horarios y administración completa porque pedía solo Login/Asistencia. La solicitud posterior amplió explícitamente ese alcance para eliminar la dependencia del seed. No borrar esos módulos por interpretar la exclusión inicial fuera de contexto.

### 2.3 Referencia visual

[Figma de SAGE](https://www.figma.com/design/gCuuBOpsdHJhx289Udq40E/SAGE-%E2%80%94-Prototipo-Completo?node-id=2003-2).

Nodos inspeccionados durante la implementación: Login `2005:7`; selección `2013:1022`; asistencia `2013:1109`; confirmación `2013:1229`; usuarios `2007:263`; matrícula `2010:672`; horario `2017:1623`; asignación `2019:1746`.

Se conservaron tipografía Inter, morado `#4c1d95`, navegación lateral, formularios, tabla/radios de asistencia y confirmación. Se adaptaron formularios a varios roles y a registros reales. Los controles de simulación del prototipo visual no se trasladaron al producto. El acceso al Figma depende de la cuenta de cada compañero; una nueva IA no debe suponer que hereda la sesión del autor.

## 3. Tecnologías y arquitectura

### 3.1 Stack efectivo

| Componente                    | Versión o implementación            |
| ----------------------------- | ----------------------------------- |
| Lenguaje                      | JavaScript ESM; JSX en React; CSS   |
| Node.js                       | `24.21.0`                           |
| React / React DOM             | `19.3.0`                            |
| Vite                          | `8.3.1`                             |
| Express                       | `5.2.1`                             |
| PostgreSQL                    | Imagen Docker `postgres:18.6`       |
| Prisma / client / adapter-pg  | `7.10.0`                            |
| Driver `pg`                   | `8.16.3`                            |
| Zod                           | `4.6.5`                             |
| jsonwebtoken                  | `9.0.3`                             |
| bcrypt                        | `6.0.0`, costo 12                   |
| Winston                       | `3.19.0`                            |
| Helmet / CORS / cookie-parser | `8.1.0` / `2.8.5` / `1.4.7`         |
| express-rate-limit / dotenv   | `8.7.0` / `17.2.3`                  |
| Pruebas                       | `node:test` y Supertest `7.2.2`     |
| Formato                       | Prettier `3.9.9`                    |
| Frontend auxiliar             | ESLint; `@fontsource/inter` `5.2.8` |

Hay tres `package.json` y tres lockfiles: raíz, backend y frontend. No es un proyecto con npm workspaces. La instalación usa `npm ci` por carpeta. Los manifests y lockfiles son la referencia para versiones transitivas; algunas herramientas frontend usan rangos en el manifest.

Los overrides backend de `deepmerge-ts` y `mysql2` corresponden a dependencias transitivas de herramientas. **El sistema utiliza PostgreSQL; la presencia de `mysql2` no implica una segunda base MySQL.** Los paquetes `@types/react` no convierten la aplicación a TypeScript.

### 3.2 Procesos y despliegue local

| Proceso             | Dónde corre                   | Puerto predeterminado                     |
| ------------------- | ----------------------------- | ----------------------------------------- |
| PostgreSQL          | Docker, servicio Compose `db` | Host `127.0.0.1:5432` → contenedor `5432` |
| Backend             | Node en la PC                 | `127.0.0.1:3000`                          |
| Frontend desarrollo | Vite en la PC                 | `localhost:5173`                          |

**Docker contiene solo PostgreSQL.** No hay contenedores de frontend/backend ni una infraestructura productiva terminada. Compose usa proyecto `sage-prototipo`, volumen lógico `sage_postgres`, montaje `/var/lib/postgresql`, healthcheck `pg_isready` y reinicio `unless-stopped`. La ruta del montaje corresponde a la imagen de PostgreSQL 18 usada aquí.

### 3.3 Tres capas

```text
React → fetch REST/JSON → Express
  routes + middleware + validators + controllers   [presentación]
  services                                        [negocio]
  repositories → Prisma + adaptador pg             [datos]
  PostgreSQL
```

La presentación transforma HTTP, aplica autenticación/autorización y valida el contrato. Los controllers delegan al servicio y envuelven la respuesta. Los services verifican reglas del dominio, coordinan operaciones y producen DTO seguros. Los repositories concentran consultas y transacciones.

`config/database.js` construye el cliente Prisma con `PrismaPg`. `prisma.config.js` proporciona la URL para las herramientas Prisma 7. El esquema declara proveedor PostgreSQL y generador `prisma-client-js`. La URL no está incrustada en el esquema.

Excepciones deliberadas: seed y pruebas acceden a Prisma para preparar/comprobar datos; el arranque cierra la conexión ordenadamente. No introducir acceso ORM en React o controllers al añadir funciones.

## 4. Mapa del código

| Archivo o directorio                              | Responsabilidad                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `backend/src/app.js`                              | Express, requestId, no-store, Helmet, CORS, parser JSON, cookies, router y errores |
| `backend/src/server.js`                           | Comprobar BD, escuchar HOST/PORT, logs de arranque y cierre por señales            |
| `backend/src/routes/index.js`                     | Health, instalación, autenticación y sesiones docentes; limitador de intentos      |
| `backend/src/routes/admin.js`                     | Rutas administrativas; exige ADMINISTRADOR                                         |
| `backend/src/controllers/*Controller.js`          | Adaptadores HTTP de auth, health, sesión y administración                          |
| `backend/src/services/authService.js`             | Contraseña, JWT, sesiones revocables y usuario seguro                              |
| `backend/src/services/sessionService.js`          | Propiedad de clase, padrón, asistencia completa y DTO docente                      |
| `backend/src/services/adminService.js`            | Instalación, identidad, cuentas, catálogos, matrícula, bloques y sesiones          |
| `backend/src/services/healthService.js`           | Consulta de disponibilidad real de BD                                              |
| `backend/src/repositories/*Repository.js`         | Persistencia de los cuatro servicios                                               |
| `backend/src/validators/schemas.js`               | Login, ID, asistencia y middleware genérico Zod                                    |
| `backend/src/validators/adminSchemas.js`          | Contratos estrictos de administración e instalación                                |
| `backend/src/middleware/auth.js`                  | `requireAuth` y `requireRole`                                                      |
| `backend/src/middleware/errorHandler.js`          | Formato común, códigos HTTP y diagnóstico seguro                                   |
| `backend/src/errors/AppError.js`                  | Error de negocio con status, code, message y detalles opcionales                   |
| `backend/src/config/env.js`                       | Carga explícita de backend/.env y validación de configuración                      |
| `backend/src/logging/logger.js`                   | Archivos Winston y rotación                                                        |
| `backend/src/utils/audit.js`                      | Helpers reutilizables de creadoPor/modificadoPor                                   |
| `backend/prisma/schema.prisma`                    | 19 modelos, dos enums, relaciones e índices                                        |
| `backend/prisma/migrations/`                      | Tres migraciones SQL versionadas                                                   |
| `backend/prisma/seed.js`                          | Demo opcional, transaccional, con upserts y bloqueo en producción                  |
| `backend/scripts/test.js`                         | Bases efímeras por suite y ejecución de migraciones/pruebas                        |
| `backend/tests/api.test.js`                       | 20 pruebas de regresión, incluida demo opcional                                    |
| `backend/tests/administracion.test.js`            | 18 pruebas desde BD vacía y recorrido sin seed                                     |
| `frontend/src/App.jsx`                            | Selección de pantalla por hash, roles y estado de autenticación                    |
| `frontend/src/context/AuthContext.jsx`, `auth.js` | Usuario compartido, restauración, login, logout, expiración                        |
| `frontend/src/api/client.js`                      | fetch con cookies, JSON, ApiError y manejo de red/401                              |
| `frontend/src/hooks/useResource.js`               | Lecturas con cancelación, loading, error y reintento                               |
| `frontend/src/hooks/useAdminData.js`              | Lecturas administrativas; conserva formularios al refrescar listados               |
| `frontend/src/hooks/useAuth.js`                   | Acceso al contexto de autenticación                                                |
| `frontend/src/pages/`                             | Login, Setup, Admin, SessionSelect, Attendance y Confirmation                      |
| `frontend/src/components/AdminForm.jsx`           | Formularios, campos y estados comunes de altas/edición                             |
| `frontend/src/components/Feedback.jsx`            | Mensajes, carga y errores de recursos                                              |
| `frontend/src/layouts/AppLayout.jsx`              | Menú, navegación por roles y salida controlada                                     |
| `frontend/src/utils/format.js`                    | Etiquetas de estados y formatos de fecha                                           |
| `frontend/src/styles/`, `frontend/public/figma/`  | CSS e iconos/vectoriales locales                                                   |
| `scripts/setup.js`                                | Crear parámetros ausentes, instalar, levantar BD, generar Prisma y migrar          |
| `scripts/setup-key.js`                            | Mostrar al operador la clave inicial de su propia instalación                      |
| `scripts/dev.js`                                  | Ejecutar juntos backend y frontend                                                 |
| `scripts/Use-Node.ps1`                            | Descargar/verificar Node Windows x64 y añadirlo al PATH del proceso                |
| `scripts/Setup-Sage.ps1`, `Start-Sage.ps1`        | Entrada de preparación e inicio para Windows                                       |
| `docs/`                                           | Arquitectura, API, recorrido, verificación, SQL y evidencias                       |

`Admin.jsx` agrupa las vistas administrativas y sus helpers en un archivo. No asumir que cada subpantalla tiene un archivo independiente. No hay React Router, Redux, Tailwind, Swagger UI ni framework de tests visuales configurados.

## 5. Modelo de datos y relaciones

### 5.1 Identificadores y nombres

El modelo se llama **Estudiante**, como el diagrama. La interfaz suele decir alumno y el contrato de asistencia usa `alumnoId`; este valor es **Estudiante.id**, no Persona.id, Usuario.id ni Matricula.id. `docenteId` es **Docente.id**, no Usuario.id. Confundir estos IDs produce asociaciones incorrectas aunque casualmente coincidan en una demo pequeña.

Las tablas y columnas generadas conservan nombres con mayúsculas y camelCase. En PostgreSQL se consultan con comillas dobles: `"Usuario"`, `"personaId"`. `SesionAuth` es acceso a la aplicación; `SesionClase` es una clase fechada. Son conceptos distintos.

### 5.2 Diccionario de las 19 entidades

Salvo `Instalacion`, `UsuarioRol` y `SesionAuth`, las entidades tienen `id` entero autoincremental. Las relaciones se detallan por sus claves; los campos de navegación Prisma no son columnas adicionales.

| Entidad                     | Campos almacenados relevantes                                                                           | Restricciones y propósito                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Persona**                 | id, numeroDocumento, nombres, apellidos, activo, creadoEn, modificadoEn                                 | Documento único; identidad reutilizable; relaciones opcionales 1:1 a Usuario, Docente y Estudiante |
| **Usuario**                 | id, personaId, identificador, hashContrasena, activo, creadoEn, modificadoEn                            | personaId único; identificador único; una cuenta por persona                                       |
| **Instalacion**             | id, completadaEn                                                                                        | Marcador único operativo `id=1`; CHECK SQL impide otros valores; cierra configuración inicial      |
| **Rol**                     | id, nombre                                                                                              | Enum NombreRol y nombre único                                                                      |
| **UsuarioRol**              | usuarioId, rolId                                                                                        | PK compuesta; permite muchos roles por cuenta y muchas cuentas por rol                             |
| **SesionAuth**              | id, usuarioId, expiraEn, creadoEn                                                                       | ID UUID generado en servicio; índice expiraEn; permite revocar un JWT                              |
| **Docente**                 | id, personaId, codigoDocente                                                                            | personaId y código únicos; perfil para asignaciones                                                |
| **Estudiante**              | id, personaId, codigoEstudiante                                                                         | personaId y código únicos; perfil para matrículas                                                  |
| **AnioAcademico**           | id, codigo                                                                                              | Código único, por ejemplo texto `2027`                                                             |
| **Grado**                   | id, nombre                                                                                              | Nombre único, por ejemplo `4.°`                                                                    |
| **Seccion**                 | id, nombre, gradoId, anioAcademicoId                                                                    | Única por grado/año/nombre; sección pertenece a una anualidad                                      |
| **Matricula**               | id, estudianteId, seccionId, anioAcademicoId, activo, creadoEn, modificadoEn                            | Única por estudiante/año; índice seccionId/activo                                                  |
| **Curso**                   | id, codigo, nombre                                                                                      | Código único; se vincula a sección y docente mediante asignación                                   |
| **CursoSeccionDocente**     | id, cursoId, seccionId, docenteId                                                                       | Triple única; identifica asignación académica, sin horario todavía                                 |
| **Aula**                    | id, codigo                                                                                              | Código único                                                                                       |
| **CursoSeccionDocenteAula** | id, asignacionId, aulaId, diaSemana, horaInicio, horaFin                                                | Bloque semanal; único por asignación/aula/día/inicio                                               |
| **SesionClase**             | id, bloqueId, fecha, horaInicio, horaFin, activo, creadoEn, modificadoEn                                | Única por bloque/fecha; fecha SQL DATE                                                             |
| **AsistenciaEstudiante**    | id, sesionId, matriculaId, condicion, observacion, creadoEn, modificadoEn, creadoPorId, modificadoPorId | Única por sesión/matrícula; observación VARCHAR(300) por defecto vacía; índice matriculaId         |
| **RegistroAuditoria**       | id, usuarioId, fechaHora, tipoEvento, entidadId, detalle                                                | JSON de detalle; índice entidadId/fechaHora; entidadId genérico, interpretado con tipoEvento       |

Enums exactos:

```text
NombreRol = ADMINISTRADOR | DOCENTE | ALUMNO | APODERADO
CondicionAsistencia = PRESENTE | TARDANZA | AUSENTE
```

`activo` es verdadero por defecto donde existe. `creadoEn` usa `now()` y `modificadoEn` usa `@updatedAt`. No todos los modelos tienen esos campos: no asumir un supermodelo universal de auditoría.

`UsuarioRol.usuario` y `SesionAuth.usuario` tienen borrado en cascada. Las otras relaciones mantienen las restricciones del esquema/migraciones; no hay borrado masivo expuesto en API. Un evento de auditoría tiene FK a su autor, pero `entidadId` **no es una FK polimórfica** validada por PostgreSQL contra cada tabla de negocio.

### 5.3 Relaciones que explican el recorrido

```text
Persona → Usuario → UsuarioRol → Rol
Persona → Docente → CursoSeccionDocente ← Curso
Persona → Estudiante → Matricula → Seccion → Grado / AnioAcademico
CursoSeccionDocente → Seccion
CursoSeccionDocente → CursoSeccionDocenteAula ← Aula
CursoSeccionDocenteAula → SesionClase → AsistenciaEstudiante ← Matricula
Usuario → SesionAuth
Usuario → RegistroAuditoria
Usuario → AsistenciaEstudiante.creadoPor / modificadoPor
```

Una asistencia obtiene alumno, sección, año, curso, docente, fecha y aula recorriendo esas relaciones. No necesita copiar todos esos datos en cada fila de asistencia. La sesión sí copia las horas del bloque al crearse, y el servicio asegura inicialmente su coherencia.

### 5.4 Migraciones e integridad

1. `20261001022912_initial_sage`: esquema inicial, 18 modelos, enums, FKs, índices y claves únicas.
2. `20261001120000_administracion_sin_seed`: añadió históricamente el contador de Usuario e Instalacion, incluido CHECK `id=1`.
3. `20261002120000_eliminar_control_versiones`: elimina únicamente las columnas version de Usuario y SesionClase. Conserva filas, relaciones y auditoría histórica; no se reescriben migraciones ya aplicadas. La API omite version en detalles antiguos de asistencia sin alterar el evento guardado en BD.

Prisma mantiene además su tabla técnica `_prisma_migrations`; no es una entidad de negocio número 20.

Las restricciones únicas de BD protegen duplicados incluso ante concurrencia. Otras reglas viven en services: año de matrícula igual al de sección, asistencia perteneciente a la sección, día/año/horas de sesión y ausencia de cruces. **Una escritura SQL externa puede saltarse estas últimas reglas.** El script de verificación detecta incongruencias; no las previene ni las repara.

## 6. Reglas de negocio y transacciones

### 6.1 Primer administrador

`GET /instalacion` devuelve si se necesita configuración. Está cerrada cuando existe `Instalacion(1)` **o cualquier cuenta vinculada al rol ADMINISTRADOR**, aunque esa cuenta no esté activa.

`POST /instalacion` valida identidad, contraseña y clave. La clave configurada se compara mediante digests SHA-256 y `timingSafeEqual`. El hash de contraseña se calcula con bcrypt. Dentro de una transacción protegida se vuelve a comprobar el cierre y se crean/reutilizan cuatro roles, Persona, Usuario administrador, UsuarioRol, marcador y evento `ADMINISTRADOR_INICIAL_CREADO`.

Dos solicitudes simultáneas no deben crear dos administradores iniciales. El marcador mantiene el cierre aunque luego alguien altere manualmente los roles. La comprobación de clave ocurre antes de la de instalación completada: clave incorrecta da 403; clave válida con instalación cerrada da 409. No existe un botón de reinicio de instalación.

### 6.2 Personas, cuentas y perfiles

- Documento normalizado a mayúsculas y sin espacios externos. Si ya existe Persona, debe estar activa y sus nombres/apellidos deben coincidir exactamente con los valores normalizados por trim.
- Se rechaza reutilizar el documento con otra identidad; no se corrige silenciosamente el nombre.
- Una Persona tiene como máximo una cuenta. Añadir un rol se hace editando esa cuenta.
- Incluir DOCENTE crea/reutiliza Docente; código automático `DOC-${personaId}`. Incluir ALUMNO crea/reutiliza Estudiante; código `EST-${personaId}`.
- Una cuenta DOCENTE + APODERADO es válida. APODERADO es un rol disponible; todavía no hay entidad de vínculo familiar ni un módulo de representación.
- Retirar un rol conserva Persona, perfiles, asignaciones e historial. Una cuenta docente sin DOCENTE pierde acceso aunque su perfil siga existiendo.
- Crear usuario docente no asigna cursos, bloques ni clases. Crear usuario ALUMNO no lo matricula.
- La edición admite identificador, roles, activo y contraseña opcional. No admite cambiar datos personales por este endpoint.
- PUT reemplaza los datos editables de la cuenta sin exigir una versión previa. No se puede desactivar la cuenta administrativa propia ni quitarle el acceso administrativo. Debe quedar al menos un administrador activo.
- Desactivar o cambiar contraseña elimina las sesiones de esa cuenta. Cambiar roles se refleja en la siguiente petición porque el backend vuelve a leerlos.

### 6.3 Catálogos y matrícula

Se crean año, grado, sección, curso y aula desde Administración. Sección exige grado y año existentes. Las restricciones únicas rechazan catálogos repetidos.

Registrar estudiante crea/reutiliza Persona y crea Estudiante; **no crea una cuenta de login**. Matricular requiere estudiante con persona activa y sección existente. El servidor obtiene el año desde la sección: el cliente envía solo `estudianteId` y `seccionId`.

Existe como máximo una matrícula por estudiante/año, incluso si una matrícula previa estuviese inactiva. No hay traslado, reactivación o nueva matrícula del mismo año implementados. Matricular en una sección lo incorpora al padrón activo de sus sesiones; el padrón se calcula al consultar y no se congela como una lista histórica al crear la sesión.

### 6.4 Asignaciones y cruces de horario

Un bloque requiere curso, sección y aula existentes; además docente con Persona activa, Usuario activo y rol DOCENTE. El año se deriva de la sección.

Se crea/reutiliza `CursoSeccionDocente` por su triple única y se añade `CursoSeccionDocenteAula`. Un bloque se solapa con otro cuando comparten **año y día**, se cumple:

```text
inicioExistente < finNuevo  Y  finExistente > inicioNuevo
```

y comparten **docente O aula O sección**. Se informa el recurso en conflicto y su horario. El intervalo es `[inicio, fin)`: 09:00–09:45 y 09:45–10:30 son compatibles. El mismo recurso en años distintos no se considera cruce en este prototipo. No hay feriados, vigencias parciales, turnos nocturnos que crucen medianoche ni optimizador automático.

Todas las mutaciones administrativas pasan por `adminRepository.transaction`: transacción `ReadCommitted`, timeout de 15 segundos y `pg_advisory_xact_lock(73142026)` antes de leer invariantes. Así otra petición administrativa espera y vuelve a leer datos comprometidos. El bloqueo es común, no uno por aula. Favorece sencillez/consistencia sobre concurrencia administrativa elevada.

La creación del bloque y su auditoría se confirman juntas. Un rechazo no debe dejar una asignación parcial. Escrituras externas o futuras rutas que no utilicen el mismo protocolo de bloqueo no quedan protegidas por él.

### 6.5 Sesiones de clase

Crear un bloque no genera automáticamente clases. Se debe enviar `bloqueId` y una fecha real `YYYY-MM-DD` a la creación de sesión. El docente debe seguir habilitado; año y día de semana deben coincidir con el bloque. Lunes es 1 y domingo 7. Las horas se copian del bloque, sin aceptar otras desde el cliente.

La fecha se interpreta como fecha de calendario con medianoche UTC y se guarda en columna SQL DATE. Unicidad bloque/fecha. No hay regla de negocio que obligue a tomar asistencia únicamente hoy ni que prohíba sesiones futuras/pasadas. No añadir esa restricción sin contrastarla con los requisitos.

### 6.6 Lectura y guardado de asistencia

1. Autenticar cuenta, comprobar DOCENTE y perfil.
2. Consultar sesión activa y verificar que su asignación pertenece al docente.
3. Leer matrículas activas de la sección con Persona de estudiante activa. Una cuenta ALUMNO no es necesaria para aparecer.
4. Si no hay registro previo, devolver `estado: null` y observación vacía; nunca marcar PRESENTE por defecto.
5. Al guardar, exigir todos los alumnos del padrón actual, una sola vez, con estados válidos.
6. Abrir transacción **ReadCommitted** y obtener un bloqueo de fila de SesionClase con SELECT FOR UPDATE; esperar internamente si ya se está guardando esa sesión.
7. Volver a comprobar sesión/propiedad/padrón y validar cobertura. No comparar ni incrementar versiones.
8. Hacer upsert por `(sesionId, matriculaId)` para cada asistencia, preservando creador y actualizando modificador.
9. Crear `ASISTENCIA_GUARDADA` en la misma transacción. Confirmar todo o deshacer todo.
10. Emitir log de éxito después del commit y responder resumen real, autor y fecha/hora del evento.

Duplicar un alumno da 409; incluir alumno ajeno o faltar alguno da 400. Los guardados válidos se aceptan sin comparar versiones; prevalece el último guardado completo. Otro guardado válido actualiza filas existentes y añade un evento; no duplica asistencia.

Una matrícula añadida entre lectura y guardado puede hacer que el padrón enviado resulte incompleto. La consulta siempre usa el padrón activo actual; no hay vigencia histórica de matrículas por fecha de clase.

## 7. Autenticación, autorización y seguridad

### 7.1 Login y sesión revocable

Login normaliza identificador a minúsculas/trim, consulta Usuario y compara bcrypt costo 12. Para identificador inexistente compara contra un hash de costo equivalente. Rechaza contraseña incorrecta, cuenta/persona inactiva o ausencia de roles con un mensaje genérico; no revela al cliente cuál de esos casos ocurrió.

El JWT usa HS256, `sub=Usuario.id`, `jti=UUID`, issuer `sage-api`, audience `sage-web` y duración configurada, por defecto una hora. Se crea `SesionAuth` con el mismo jti y expiración. El login también elimina sesiones de autenticación vencidas; no existe un proceso programado de limpieza independiente.

El servidor entrega el JWT en cookie **`sage_session`**: HttpOnly, SameSite=Lax, Path=/api/v1, expiración y Secure cuando NODE_ENV=production. No se entrega el JWT en JSON ni se guarda en localStorage. El cliente envía `credentials: 'include'`; la API actual no acepta Bearer como mecanismo alternativo.

Cada petición protegida verifica firma/algoritmo/issuer/audience/expiración, sesión en BD, correspondencia del usuario, actividad y roles actuales. Logout elimina SesionAuth y expira la cookie. Un JWT firmado pero revocado deja de ser válido.

Los DTO de usuario no incluyen hash. El DTO de autenticación contiene `id`, `identificador`, `nombre`, `roles[]`, `docenteId`; el administrativo incorpora personaId, documento, nombres/apellidos, activo.

### 7.2 Matriz efectiva de permisos

| Operación                                                     | Público                                     | ADMINISTRADOR                               | DOCENTE                            | ALUMNO/APODERADO solos |
| ------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ---------------------------------- | ---------------------- |
| Health, estado inicial y login                                | Sí                                          | Sí                                          | Sí                                 | Sí                     |
| Crear primer administrador                                    | Solo con clave válida e instalación abierta | Igual condición                             | Igual condición                    | Igual condición        |
| Me/logout                                                     | No; requiere sesión                         | Sí                                          | Sí                                 | Sí                     |
| Usuarios, catálogos, alumnos, matrícula, horarios y auditoría | No                                          | Sí                                          | Solo si además tiene ADMINISTRADOR | No                     |
| Listar/abrir/guardar asistencia                               | No                                          | Solo si además tiene DOCENTE y clase propia | Sí, de sus clases                  | No                     |

La interfaz oculta menús, pero la protección decisiva está en middleware y services. Tener ADMINISTRADOR no concede automáticamente permiso para registrar la asistencia de cualquier docente. Los roles se acumulan; no hay elección obligatoria de un único rol activo.

### 7.3 Controles transversales

- RequestId UUID por petición, cabecera `X-Request-Id` y `Cache-Control: no-store`.
- Helmet y eliminación de `X-Powered-By`.
- CORS con credenciales: acepta el origen exacto de FRONTEND_URL. Solicitudes sin cabecera Origin, como clientes CLI, también se aceptan; CORS no sustituye autenticación.
- Parser JSON limitado a 100 KB; JSON inválido → 400, exceso → 413.
- Limitador compartido de login e instalación: 30 solicitudes por IP en 15 minutos; 429 al exceder. Almacenamiento en memoria de una instancia.
- Validación Zod estricta y consultas parametrizadas a través de Prisma. El advisory lock es SQL fijo en repository.
- Errores internos no se devuelven como stack traces. El logger evita cuerpos, cookies, claves, contraseñas, JWT completos y URL de conexión con contraseña.

No hay MFA, refresh tokens, recuperación por correo, política configurable de contraseñas ni token CSRF independiente. No existe una configuración de proxy/limitador distribuido para producción. Estos hechos delimitan el prototipo; no equivalen a una auditoría de seguridad completa.

## 8. API y validaciones

Base local: **`http://localhost:3000/api/v1`**. JSON UTF-8. Respuesta normal `{ "data": ... }`; health devuelve su objeto directamente. Altas → 201; lecturas, login, logout, edición y guardado de asistencia → 200.

### 8.1 Inventario completo: 26 combinaciones método/ruta

| #   | Método | Ruta relativa a /api/v1      | Acceso / efecto                                 |
| --- | ------ | ---------------------------- | ----------------------------------------------- |
| 1   | GET    | `/health`                    | Público, consulta real de PostgreSQL            |
| 2   | GET    | `/instalacion`               | Público, devuelve `{requerido}`                 |
| 3   | POST   | `/instalacion`               | Clave inicial; crea primer administrador        |
| 4   | POST   | `/auth/login`                | Credenciales; cookie y usuario seguro           |
| 5   | GET    | `/auth/me`                   | Sesión válida; usuario actual                   |
| 6   | POST   | `/auth/logout`               | Sesión válida; revoca acceso                    |
| 7   | GET    | `/sesiones`                  | DOCENTE; sus sesiones activas                   |
| 8   | GET    | `/sesiones/:id`              | DOCENTE propietario; contexto de clase          |
| 9   | GET    | `/sesiones/:id/alumnos`      | DOCENTE propietario; sesión y padrón            |
| 10  | PUT    | `/sesiones/:id/asistencias`  | DOCENTE propietario; guardado completo          |
| 11  | GET    | `/admin/usuarios`            | ADMINISTRADOR; cuentas seguras                  |
| 12  | POST   | `/admin/usuarios`            | ADMINISTRADOR; alta multirrol                   |
| 13  | PUT    | `/admin/usuarios/:id`        | ADMINISTRADOR; actualización mediante PUT       |
| 14  | GET    | `/admin/catalogos`           | ADMINISTRADOR; catálogos y docentes habilitados |
| 15  | POST   | `/admin/catalogos/anios`     | ADMINISTRADOR; año                              |
| 16  | POST   | `/admin/catalogos/grados`    | ADMINISTRADOR; grado                            |
| 17  | POST   | `/admin/catalogos/secciones` | ADMINISTRADOR; sección por grado/año            |
| 18  | POST   | `/admin/catalogos/cursos`    | ADMINISTRADOR; curso                            |
| 19  | POST   | `/admin/catalogos/aulas`     | ADMINISTRADOR; aula                             |
| 20  | GET    | `/admin/estudiantes`         | ADMINISTRADOR; identidades y matrículas         |
| 21  | POST   | `/admin/estudiantes`         | ADMINISTRADOR; registro sin cuenta              |
| 22  | POST   | `/admin/matriculas`          | ADMINISTRADOR; matrícula por sección            |
| 23  | GET    | `/admin/horarios`            | ADMINISTRADOR; bloques y sesiones               |
| 24  | POST   | `/admin/bloques`             | ADMINISTRADOR; asignación y bloque              |
| 25  | POST   | `/admin/sesiones`            | ADMINISTRADOR; clase fechada                    |
| 26  | GET    | `/admin/auditoria`           | ADMINISTRADOR; últimos 100 eventos              |

No hay rutas DELETE, PATCH, paginación general o Swagger UI. El contrato detallado con respuestas completas está en [API.md](API.md), incluido en el paquete de contexto.

### 8.2 Campos de las solicitudes

Los objetos JSON de negocio son estrictos: propiedades adicionales producen error. Usar los IDs devueltos por las altas/GET; no asumir que comienzan en 1.

| Operación          | Cuerpo                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| Instalación        | numeroDocumento, nombres, apellidos, identificador, contrasena, claveInstalacion       |
| Login              | identificador, contrasena                                                              |
| Alta de usuario    | numeroDocumento, nombres, apellidos, identificador, contrasena, roles; activo opcional |
| Edición de usuario | identificador, roles y activo obligatorios; contrasena opcional                        |
| Año                | codigo                                                                                 |
| Grado              | nombre                                                                                 |
| Sección            | nombre, gradoId, anioAcademicoId                                                       |
| Curso              | codigo, nombre                                                                         |
| Aula               | codigo                                                                                 |
| Estudiante         | numeroDocumento, nombres, apellidos                                                    |
| Matrícula          | estudianteId, seccionId                                                                |
| Bloque             | cursoId, seccionId, docenteId, aulaId, diaSemana, horaInicio, horaFin                  |
| Sesión de clase    | bloqueId, fecha                                                                        |
| Asistencia         | asistencias: array de alumnoId, estado y observacion opcional                          |

Enviar explícitamente `activo` en una edición para no activar accidentalmente una cuenta por el valor predeterminado. Para conservar contraseña, **omitir** contrasena; enviarla vacía no equivale a omitirla.

Límites efectivos:

- Documento: 1–30 caracteres, trim y mayúsculas; no hay validación específica de DNI nacional.
- Nombres/apellidos: 1–100 caracteres, trim. Identificador: 1–200, trim/minúsculas; no exige formato de correo.
- Contraseña de alta/cambio: al menos 10 caracteres y como máximo 72 bytes UTF-8; sin trim automático. Login limita a 72 caracteres; no confundir caracteres con bytes al documentar bcrypt.
- Roles: 1–4, valores del enum, sin duplicados. Activo es booleano, no texto.
- IDs: números enteros positivos hasta 2147483647; ID de ruta se convierte a número.
- Versiones: enteros no negativos.
- Año: texto de cuatro dígitos entre 1900 y 2199. Grado: 1–50 caracteres.
- Nombre de sección y códigos de curso/aula: 1–30, mayúsculas/trim. Nombre de curso: 1–100.
- Día: entero 1–7. Horas: `HH:mm`, 24 horas, inicio menor que fin.
- Fecha: `YYYY-MM-DD` y fecha real, no solo una cadena que cumple regex.
- Asistencias: 1–500 elementos. Observación opcional, trim, máximo 300 caracteres, predeterminada vacía.

### 8.3 Ejemplo de guardado y respuesta

Ejemplo ilustrativo para un padrón con un solo estudiante. Sustituir el ID por el obtenido del GET:

```json
{
  "asistencias": [{ "alumnoId": 6, "estado": "TARDANZA", "observacion": "Llegó a las 09:12" }]
}
```

El GET de padrón devuelve `data.sesion` y `data.alumnos`. Cada alumno contiene alumnoId, nombre, codigo, estado y observacion. La sesión incluye id, curso `{id,nombre}`, seccion `{id,nombre}`, docente `{id,nombre}`, anioAcademico, fecha, horaInicio, horaFin, aula.

El PUT devuelve `data.fechaHora`, `sesion`, `total`, `resumen` por estado y `registradoPor`. La confirmación usa ese resultado; los siguientes GET recuperan el estado persistido.

### 8.4 Errores

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos.",
    "details": [{ "campo": "identificador", "mensaje": "Ingresa tu usuario o correo." }],
    "requestId": "uuid-de-la-peticion"
  }
}
```

`details` solo se añade cuando corresponde. Los códigos importantes son:

| HTTP | Ejemplos de código y significado                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | VALIDATION_ERROR, INVALID_JSON; STUDENT_NOT_ENROLLED, INCOMPLETE_ATTENDANCE; INVALID_TEACHER, YEAR_MISMATCH, DAY_MISMATCH                                                                                                                      |
| 401  | UNAUTHENTICATED, INVALID_CREDENTIALS, SESSION_EXPIRED                                                                                                                                                                                          |
| 403  | FORBIDDEN, NO_TEACHER_PROFILE, SESSION_FORBIDDEN, ORIGIN_FORBIDDEN, INVALID_SETUP_KEY                                                                                                                                                          |
| 404  | NOT_FOUND, SESSION_NOT_FOUND, REFERENCE_NOT_FOUND                                                                                                                                                                                              |
| 409  | CONFLICT, DUPLICATE_STUDENT, DUPLICATE_IDENTIFIER, DUPLICATE_RECORD, PERSON_HAS_ACCOUNT, PERSON_MISMATCH, PERSON_INACTIVE, STUDENT_EXISTS, DUPLICATE_ENROLLMENT, SCHEDULE_CONFLICT, DUPLICATE_CLASS, SELF_LOCKOUT, LAST_ADMIN, SETUP_COMPLETED |
| 413  | BODY_TOO_LARGE                                                                                                                                                                                                                                 |
| 429  | TOO_MANY_ATTEMPTS                                                                                                                                                                                                                              |
| 500  | INTERNAL_ERROR; detalle técnico seguro en logs                                                                                                                                                                                                 |
| 503  | SETUP_NOT_CONFIGURED                                                                                                                                                                                                                           |

El wrapper administrativo transforma Prisma P2002 en DUPLICATE_RECORD; el middleware transforma P2002/P2034 que le lleguen en CONFLICT. No mostrar el mensaje libre de un driver al usuario.

## 9. Frontend y comportamiento de pantallas

### 9.1 Navegación y estado compartido

`App.jsx` escucha `hashchange`; URLs como `http://localhost:5173/#/sesiones` no requieren rutas de servidor por pantalla. El contexto restaura usuario mediante GET `/auth/me` al arrancar. Un 401 inicial es normal sin sesión; un fallo de red muestra reintento.

Rutas de interfaz:

| Hash                 | Pantalla                                           |
| -------------------- | -------------------------------------------------- |
| `#/login`            | Login y entrada a configuración inicial si procede |
| `#/instalacion`      | Formulario del primer administrador                |
| `#/admin/inicio`     | Pasos del recorrido administrativo                 |
| `#/admin/usuarios`   | Alta/edición de cuentas y roles                    |
| `#/admin/catalogos`  | Años, grados, secciones, cursos y aulas            |
| `#/admin/matriculas` | Registro de alumnos y matrícula                    |
| `#/admin/horarios`   | Matriz, bloques y sesiones fechadas                |
| `#/admin/auditoria`  | Eventos y detalle JSON                             |
| `#/sesiones`         | Selección de clase docente                         |
| `#/sesiones/:id`     | Padrón y formulario de asistencia                  |
| `#/confirmacion`     | Resultado del último guardado en memoria           |

Sin autenticación solo se muestra Login o Setup. ADMINISTRADOR sin DOCENTE entra a administración. Una cuenta con ambos puede navegar entre módulos; login la dirige a inicio administrativo. ALUMNO/APODERADO sin otros roles reciben vista de acceso restringido en el módulo docente.

La confirmación no es un comprobante persistido ni una ruta recuperable con todos sus datos tras F5: el resultado vive en estado React. Al perderlo, la navegación cae en selección de sesiones; la asistencia sí permanece en PostgreSQL. El router tiene pantallas por defecto, no una página 404 estricta para todo hash desconocido.

### 9.2 Formularios y estados

Login muestra validación de campos y mensaje completo de credenciales inválidas. Setup consulta disponibilidad del alta y, al terminar, ofrece iniciar sesión; no inicia sesión automáticamente.

Administración usa formularios compartidos con campos required, deshabilitación durante envío, errores/detalles y confirmación. `useAdminData` refresca listas sin desmontar el formulario y perder su mensaje. Usuarios usa PUT sin versión al editar; los datos de identidad se muestran pero no se editan con esa operación.

La matrícula filtra selección por año/grado/sección. Horarios muestra matriz semanal filtrable por año y sección/docente/aula. Crear un bloque y crear una sesión son formularios distintos. Auditoría muestra los últimos 100 eventos y permite expandir el JSON crudo; `{}` se renderiza como tal.

Selección docente carga sesiones reales, distingue secciones por año, filtra curso y fecha/bloque. Sin asignación muestra estado vacío, no clases inventadas. Asistencia maneja carga, error, reintento, ausencia de alumnos, selección exclusiva de estado por alumno, observación y contadores reales.

Guardar exige todos los estados; mientras guarda se deshabilitan controles. Un error conserva la edición; 409 ofrece recargar sesión. Cambios pendientes activan aviso `beforeunload` y confirmación en la navegación controlada por AppLayout. No hay un bloqueador general de historial del navegador: no atribuir garantía absoluta a cualquier cambio manual del hash o al botón Atrás.

La API frontend dispara `sage:expired` ante 401 fuera de login/me para limpiar usuario y avisar. El backend aplica permisos actuales aunque el menú de una pestaña abierta pueda conservar momentáneamente roles antiguos hasta restaurar sesión.

### 9.3 Estilo y accesibilidad

Inter se sirve localmente desde el paquete instalado; iconos SVG en `public/figma`. CSS propio con mensajes que ajustan líneas, foco visible, labels, fieldsets/radios, estados aria y tabla desplazable en anchos reducidos. La prueba manual previa incluyó viewport de 360 px. No se ha realizado una certificación integral WCAG ni una suite automática de navegadores.

Fechas de clase se muestran como fechas de calendario. La interfaz usa formatos regionales y, para instantes de auditoría, zona `America/Lima`; no deducir la fecha de una clase a partir de convertir indiscriminadamente su medianoche UTC a hora local.

## 10. Auditoría, logs y diagnóstico

### 10.1 Tres registros con finalidades diferentes

1. **Campos de la fila de negocio:** creadoEn/modificadoEn y, en asistencia, creadoPorId/modificadoPorId. Indican creación y última modificación.
2. **RegistroAuditoria:** historial de eventos de negocio, autor, fecha, tipo, entidad y detalle. Se guarda junto al cambio de negocio en su transacción.
3. **Winston:** archivos operativos para acceso, disponibilidad, operaciones y errores, correlacionados mediante requestId cuando aplica.

Estos conceptos no requieren una segunda jerarquía de entidades de auditoría. `auditCreate`/`auditUpdate` reutilizan asignación de autoría en asistencia; Prisma mantiene timestamps. La auditoría de eventos complementa esos campos.

### 10.2 Contenido real de cada evento

| tipoEvento                   | entidadId representa           | detalle almacenado actualmente                                |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------- |
| ADMINISTRADOR_INICIAL_CREADO | Usuario creado                 | `{roles: ["ADMINISTRADOR"]}`                                  |
| USUARIO_CREADO               | Usuario creado                 | roles y activo                                                |
| USUARIO_ACTUALIZADO          | Usuario editado                | anterior/nuevo de roles y activo; contrasenaRenovada booleano |
| CATALOGO_CREADO              | Registro de catálogo           | `{catalogo: tipo}`; tipo permite identificar la tabla         |
| ESTUDIANTE_REGISTRADO        | Estudiante creado              | `{}`                                                          |
| MATRICULA_REGISTRADA         | Matricula creada               | `{}`                                                          |
| BLOQUE_ASIGNADO              | CursoSeccionDocenteAula creado | `{}`                                                          |
| SESION_CLASE_CREADA          | SesionClase creada             | `{}`                                                          |
| ASISTENCIA_GUARDADA          | SesionClase                    | cambios de alumnoId/anterior/nuevo estado                     |

**Por qué aparece `{}`:** `adminService.mutation` extrae `{ data, detail = {} }` del resultado de cada operación. Las altas de estudiante, matrícula, bloque y sesión devuelven solo data; por eso queda un objeto vacío en detalle. Sí se almacenan autor, instante, tipo de evento y entidadId. No es prueba de que la operación haya fallado ni de que el frontend haya perdido datos.

**Limitación conocida, aún no corregida:** esos eventos no conservan una fotografía de los datos creados. El cambio de identificador tampoco queda en el detalle de USUARIO_ACTUALIZADO. La auditoría de asistencia conserva estados anterior/nuevo, pero no las observaciones anterior/nueva. Al guardar se incluyen todos los alumnos, incluso aquellos cuyo estado no cambió.

Consultar las entidades relacionadas permite ver datos actuales, no reconstruir necesariamente su contenido histórico. Si se amplía la auditoría, definir payloads explícitos y pruebas sin secretos. No completar eventos antiguos con datos actuales haciéndolos pasar por la fotografía original.

La consulta administrativa limita a 100 registros por id descendente; los demás permanecen en BD. No existen endpoints de edición/eliminación de eventos. **No hay trigger de inmutabilidad en PostgreSQL** que impida a un operador SQL modificar esa tabla. Tampoco se guarda requestId en RegistroAuditoria; la correlación precisa por requestId está en HTTP/logs.

### 10.3 Archivos de log

Por defecto, `backend/logs/app.log` y `backend/logs/error.log`. El directorio y ambos archivos se crean al inicializar el logger. Formato JSON por línea con timestamp, level y message; module/requestId/userId y datos de operación cuando corresponda.

Cada transporte rota aproximadamente a 5.000.000 bytes y conserva hasta tres archivos. app.log recibe niveles admitidos por LOG_LEVEL, incluidos errores; error.log filtra nivel error. Un archivo error.log vacío puede ser normal si no hubo errores internos.

Login correcto/fallido y consultas de sesiones se registran. Guardado de asistencia registra sesión, usuario, total y requestId; no registra observaciones. Altas administrativas registran tipo de evento y entidadId después del commit. Fallos HTTP conocidos se registran como warn; errores 500 como error, con tipo y hasta ocho frames de stack filtrados, sin el mensaje libre del driver.

No hay un access log exhaustivo de cada GET ni un evento de auditoría de BD por cada login. La auditoría transaccional y los logs físicos son mecanismos distintos: no se promete una transacción atómica conjunta PostgreSQL/archivo.

Lectura local en PowerShell:

```powershell
Get-Content .\backend\logs\app.log -Tail 20 -Wait
Get-Content .\backend\logs\error.log -Tail 20
```

Ejecutar cada comando de seguimiento en su propia terminal. Buscar `X-Request-Id` de una respuesta en app.log para diagnosticar una petición que generó log. Los tests usan directorios separados en `backend/logs/tests/`.

## 11. Configuración e instalación

### 11.1 Todos los parámetros del proyecto

Son archivos de parámetros, no datos que se deban programar en cada función. `.env.example` contiene plantillas compartibles; `.env` contiene valores de esa instalación. Git ignora `.env` reales, logs, node_modules, `.tools` y dist.

| Archivo         | Parámetro         | Predeterminado o generación                                | Uso                                                              |
| --------------- | ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `.env`          | POSTGRES_PASSWORD | `sage_password`, solo desarrollo                           | Contraseña inicial del usuario del contenedor                    |
| `.env`          | POSTGRES_PORT     | `5432`                                                     | Puerto expuesto en la PC                                         |
| `backend/.env`  | NODE_ENV          | `development`                                              | development/test/production                                      |
| `backend/.env`  | HOST              | `127.0.0.1`                                                | Interfaz de escucha API                                          |
| `backend/.env`  | PORT              | `3000`                                                     | Puerto API                                                       |
| `backend/.env`  | DATABASE_URL      | `postgresql://sage:sage_password@localhost:5432/sage`      | Conexión de la aplicación                                        |
| `backend/.env`  | TEST_DATABASE_URL | `postgresql://sage:sage_password@localhost:5432/sage_test` | Plantilla para pruebas aisladas                                  |
| `backend/.env`  | FRONTEND_URL      | `http://localhost:5173`                                    | Origen permitido; HTTPS obligatorio en production                |
| `backend/.env`  | JWT_SECRET        | Aleatorio: 48 bytes representados en hexadecimal           | Firma JWT; mínimo 32 caracteres; rechaza placeholder change_this |
| `backend/.env`  | JWT_EXPIRES_IN    | `1h`                                                       | Duración; entero más unidad s/m/h/d                              |
| `backend/.env`  | LOG_LEVEL         | `info`                                                     | error/warn/info/debug                                            |
| `backend/.env`  | LOG_DIR           | `logs`                                                     | Resuelto respecto a backend; admite ruta absoluta                |
| `backend/.env`  | DEMO_PASSWORD     | `Docente123!`, exclusivamente demo                         | Solo lo lee seed opcional, no login ni setup inicial             |
| `backend/.env`  | INITIAL_SETUP_KEY | Aleatorio: 32 bytes representados en hexadecimal           | Autoriza alta del primer administrador; mínimo 32 caracteres     |
| `frontend/.env` | VITE_API_URL      | `http://localhost:3000/api/v1`                             | Base HTTP usada por el cliente; visible en el bundle             |

En Compose, `POSTGRES_DB=sage` y `POSTGRES_USER=sage` están fijados en YAML; no son parámetros leídos del `.env` raíz actual. Los valores públicos `sage_password` y `Docente123!` de las plantillas son ejemplos de desarrollo, no secretos privados ni contraseñas de administrador creadas por setup.

**Diferencias que suelen causar confusión:**

- `DEMO_PASSWORD` se copia de backend/.env.example cuando se crea backend/.env. `setup:key` no la genera ni cambia contraseñas de usuarios.
- `setup:key` solo muestra INITIAL_SETUP_KEY del archivo existente. La clave inicial, JWT_SECRET, contraseña de BD y contraseñas de personas son cuatro cosas distintas.
- Cada PC nueva genera sus propios secretos JWT e instalación y tiene su propia base Docker. Hacer pull no descarga la BD ni los usuarios de otra PC.
- Cambiar POSTGRES_PASSWORD en `.env` no cambia por sí solo la contraseña de un usuario que ya existe dentro de un volumen inicializado.
- Si cambia puerto/contraseña de BD, hay que mantener DATABASE_URL y TEST_DATABASE_URL coherentes; setup no sincroniza automáticamente archivos existentes.
- VITE_API_URL no es secreto: queda incorporado al frontend; requiere reiniciar Vite o reconstruir el bundle al cambiarlo.
- Configuración backend se lee al arrancar; variables del proceso ya establecidas tienen precedencia sobre dotenv. Reiniciar después de modificar parámetros.
- Si una instalación antigua conserva un JWT_SECRET inválido/placeholder, setup no lo reemplaza genéricamente: crea el valor aleatorio al generar el archivo nuevo. El arranque validará y rechazará configuración inválida.

### 11.2 PC nueva con Windows x64, sin seed

Requisitos: Git, Docker Desktop con motor Linux funcionando, Internet para primera instalación y puertos locales 5432/3000/5173 disponibles. No hace falta instalar Node ni PostgreSQL globalmente porque los scripts preparan el primero y Docker el segundo.

```powershell
git clone --branch feat/prototipo-arquitectura-sage https://github.com/ElChinote04/Proyecto-Ingesoft.git
cd Proyecto-Ingesoft
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Sage.ps1
. .\scripts\Use-Node.ps1
npm.cmd run setup:key
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

Copiar la clave inicial antes de iniciar servidores; abrir `http://localhost:5173`; pulsar **Configurar el primer administrador**, elegir identidad y contraseña e introducir esa clave. Después iniciar sesión con la cuenta elegida.

Setup hace, en orden: preparar Node local 24.21.0, verificar SHA256 del archivo oficial descargado, crear `.env` ausentes, generar secretos necesarios, instalar tres lockfiles, `docker compose up -d --wait`, `prisma generate` y `prisma migrate deploy`. No ejecuta seed. Si ya hay `.env`, conserva sus valores y añade INITIAL_SETUP_KEY si falta o sustituye su marcador `generate_on_setup`.

Node queda en `.tools/node-v24.21.0-win-x64`. Dot-sourcing Use-Node modifica PATH en esa terminal; no instala Node global ni modifica permanentemente el sistema. La política Bypass del comando de preparación aplica a ese proceso.

Start prepara dependencias si detecta backend/frontend node_modules o backend/.env ausentes; de lo contrario solo levanta BD y desarrollo. **No es sustituto de Setup después de un pull con migraciones/dependencias nuevas.** Mantener abierta su terminal; Ctrl+C detiene frontend/backend. La BD conserva volumen.

### 11.3 Inicio posterior y actualización

Inicio normal, con Docker Desktop abierto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

Actualizar una copia existente después de revisar/conservar cambios propios y detener servidores:

```powershell
git status
git switch feat/prototipo-arquitectura-sage
git pull --ff-only
powershell -ExecutionPolicy Bypass -File .\scripts\Setup-Sage.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

Si pull informa divergencia o hay cambios propios, resolverlos de forma deliberada; no sustituir por reset --hard. No usar borrado de volumen o `prisma migrate reset` como rutina de actualización.

### 11.4 Linux/Ubuntu y otros entornos

Los `.ps1` de descarga son para Windows x64. Con Node **24.21.0**, npm, Git y Docker Engine/Compose ya instalados y disponibles en PATH, los scripts JavaScript permiten:

```bash
git clone --branch feat/prototipo-arquitectura-sage https://github.com/ElChinote04/Proyecto-Ingesoft.git
cd Proyecto-Ingesoft
npm run setup
npm run setup:key
npm run dev
```

Para siguiente inicio: `docker compose up -d --wait` y `npm run dev`. Se entregó una guía separada `Instalacion_SAGE_Ubuntu.md` para Ubuntu 24.04 x64, incluida como complemento en el paquete de traspaso si está disponible. **No se ejecutó una validación Linux del proyecto**: los resultados comprobados pertenecen a Windows. No sustituir automáticamente los scripts actuales ni afirmar compatibilidad probada por haber redactado instrucciones.

### 11.5 Comandos disponibles

En PowerShell usar npm.cmd después de cargar Use-Node. En una shell con npm normal, omitir `.cmd`.

| Desde raíz                           | Efecto                                                       |
| ------------------------------------ | ------------------------------------------------------------ |
| `npm run setup`                      | Preparación completa sin seed                                |
| `npm run setup -- --env-only`        | Crear/preparar archivos de entorno sin instalar ni migrar    |
| `npm run setup:key`                  | Mostrar clave inicial local                                  |
| `npm run dev`                        | Backend en watch y frontend Vite juntos                      |
| `npm run db:up`                      | Compose up con espera de health                              |
| `npm run db:down`                    | `docker compose stop`; conserva datos                        |
| `npm run db:generate`                | Generar Prisma Client                                        |
| `npm run db:migrate`                 | Aplicar migraciones existentes; no crear una migración nueva |
| `npm run db:seed`                    | Demo opcional; omitir en recorrido sin seed                  |
| `npm test`                           | Dos suites backend con PostgreSQL real                       |
| `npm run lint`                       | ESLint del frontend; no un lint backend                      |
| `npm run build`                      | Compilar frontend a frontend/dist                            |
| `npm run format:check`               | Comprobar formato                                            |
| `npm run format`                     | Reescribir formato del proyecto; revisar diff                |
| `npm --prefix backend run db:status` | Estado de migraciones                                        |
| `npm --prefix backend start`         | Backend sin watch, sin build previo                          |
| `npm --prefix frontend run preview`  | Vista previa del build; no infraestructura de producción     |

### 11.6 Seed opcional y compatibilidad

El seed crea cuatro roles, docente Ana Torres (`docente@sage.local`), cuenta APODERADO Elena Mendoza (`apoderado@sage.local`), cinco estudiantes, año 2026, grado 3.°, sección B, Matemática, aula A-203 y clase del viernes 2026-10-02, 08:00–08:45. Las contraseñas demo provienen de DEMO_PASSWORD y se guardan con bcrypt. No crea administrador inicial.

Utiliza upserts con actualización vacía para conservar datos existentes; repetirlo no reinicia contraseñas ni borra asistencias. No sincroniza todos los cambios manuales con una plantilla ni sustituye las validaciones de las rutas administrativas. Rechaza NODE_ENV=production. Los nombres/códigos/fecha del seed son fijos; los formularios no dependen de ellos. No ejecutarlo para “arreglar” que una instalación nueva esté vacía.

### 11.7 Estado del despliegue

Actualmente se ejecuta localmente. No hay despliegue público, TLS, pipeline CI/CD, backups automáticos o contenedores de aplicación configurados. La preparación para NODE_ENV=production se limita a controles como cookie Secure y exigencia de FRONTEND_URL HTTPS; no equivale a infraestructura terminada.

Un despliegue requerirá definir dónde se sirve `frontend/dist`, cómo se mantiene el proceso backend, conexión PostgreSQL persistente, dominio/HTTPS, secretos, migraciones, respaldo/restauración y observabilidad. La topología debe mantener coherencia entre VITE_API_URL, FRONTEND_URL y cookies. Si se usa proxy, también requiere revisar HOST y confianza del proxy para el limitador; no hay configuración universal incorporada. Las PCs del equipo pueden seguir usando su entorno local; no necesitan convertirse en el servidor público.

## 12. Recorrido completo y comprobaciones

La guía extensa con cada formulario y resultado está en [FLUJO_COMPLETO.md](FLUJO_COMPLETO.md). Esta sección permite entender y reproducir el recorrido sin conocer el chat.

### 12.1 Herramientas para observarlo

Desde raíz, en otra terminal mientras corre la aplicación:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:3000/api/v1/health
docker compose exec db psql -U sage -d sage
```

Resultados esperados: servicio db healthy; health con `status: ok` y `database: connected`; consola psql en la base sage. Dentro de psql:

```sql
\conninfo
\dt
\d "Usuario"
\d "Matricula"
SELECT id, identificador, activo FROM "Usuario" ORDER BY id;
SELECT * FROM "Rol" ORDER BY id;
SELECT * FROM "UsuarioRol" ORDER BY "usuarioId", "rolId";
SELECT * FROM "Matricula" ORDER BY id;
SELECT * FROM "AsistenciaEstudiante" ORDER BY id;
SELECT id, "usuarioId", "fechaHora", "tipoEvento", "entidadId", detalle
FROM "RegistroAuditoria" ORDER BY id DESC LIMIT 30;
\q
```

`\dt` y `\d` son comandos de psql, no SQL de PostgreSQL para pegar en cualquier editor. En DBeaver/pgAdmin se puede navegar por tablas de `sage` → esquema `public` y ejecutar las consultas SELECT. Conexión gráfica: host localhost, puerto de POSTGRES_PORT, BD sage, usuario sage y contraseña local correspondiente. Esas aplicaciones son opcionales, no se instalan con el proyecto.

En navegador, F12 → Network/Red → Fetch/XHR y conservar registro. Inspeccionar URL, método, estado HTTP y respuesta. No compartir cuerpos de login, clave de instalación ni cookies en capturas. Dos pestañas normales comparten cookie; para administrador y docente simultáneos usar perfiles distintos o una ventana privada.

### 12.2 Clic, resultado y evidencia persistida

Ejemplos ficticios reutilizables: docente `docente.verificacion@sage.local`, documento docente `VER-DOC-01`, estudiante `VER-EST-01`, año 2027, grado 4.°, sección V, curso Comunicación, aula V101, viernes 09:00–09:45, fecha **2027-10-01**. Si ya existen, reutilizarlos o elegir otro conjunto coherente; no borrar la base para repetir.

| Paso | Acción en página                                                     | HTTP esperado                              | Qué debe existir después                                                          |
| ---- | -------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| 1    | Configurar primer administrador con clave local y contraseña elegida | POST /instalacion 201; GET requerido=false | Persona, Usuario, cuatro Rol, UsuarioRol administrador, Instalacion(1), auditoría |
| 2    | Iniciar sesión como administrador                                    | POST /auth/login 200                       | SesionAuth y cookie; log de login                                                 |
| 3    | Usuarios: crear Elena Verificación, DOCENTE + APODERADO              | POST /admin/usuarios 201                   | Una Persona/Usuario, dos UsuarioRol, un Docente y evento                          |
| 4    | Cerrar sesión e iniciar como docente                                 | Logout/login 200; GET /sesiones 200 con [] | Sesión auth vigente; pantalla sin clases todavía                                  |
| 5    | Volver a administrador y crear año, grado, sección, curso y aula     | Cinco altas 201                            | Catálogos enlazados, sección con año y grado                                      |
| 6    | Alumnos: registrar Lucía Verificación                                | POST /admin/estudiantes 201                | Persona + Estudiante, todavía sin matrícula                                       |
| 7    | Matricularla en año/grado/sección seleccionados                      | POST /admin/matriculas 201                 | Matricula activa, mismo año de sección                                            |
| 8    | Horarios: asignar curso, sección, docente, aula, viernes y horas     | POST /admin/bloques 201                    | CursoSeccionDocente + CursoSeccionDocenteAula; matriz actualizada                 |
| 9    | Crear clase de ese bloque para 2027-10-01                            | POST /admin/sesiones 201                   | SesionClase con fecha/horas coherentes, sin contador de edición                   |
| 10   | Entrar como docente, seleccionar clase y continuar                   | GET /sesiones y /sesiones/:id/alumnos 200  | Padrón con Lucía, estado null antes de guardar                                    |
| 11   | Marcar Tardanza, observación y guardar todo el padrón                | PUT /sesiones/:id/asistencias 200          | AsistenciaEstudiante actualizada, evento y log de éxito                           |
| 12   | Revisar asistencia y recargar F5                                     | Nuevo GET 200                              | Mismo estado/observación leídos de PostgreSQL                                     |
| 13   | Volver como administrador a Auditoría                                | GET /admin/auditoria 200                   | Eventos visibles; detalle según tabla de sección 10                               |

Durante la comprobación de cuenta, no es necesario mostrar hashes de contraseñas. Los campos de contraseña viajan en requests para crear/verificar credenciales, pero nunca deben aparecer en respuestas ni documentación compartida.

### 12.3 SQL de comprobación integral

El archivo `docs/sql/verificar_flujo.sql` usa `BEGIN READ ONLY`, no inserta datos. Ejecutar desde PowerShell:

```powershell
Get-Content -Raw -Encoding utf8 .\docs\sql\verificar_flujo.sql |
  docker compose exec -T db psql -U sage -d sage -v ON_ERROR_STOP=1
```

Acepta filtros para otras personas:

```powershell
Get-Content -Raw -Encoding utf8 .\docs\sql\verificar_flujo.sql |
  docker compose exec -T db psql -U sage -d sage -v ON_ERROR_STOP=1 `
    -v docente='otro@colegio.local' -v documento='OTRO-DOCUMENTO'
```

Sus siete bloques verifican: cuenta/roles/perfil; sesiones auth vigentes; estudiante/matrícula/año; asignación/bloque/clase; padrón/asistencia/autoría; últimos 30 eventos; cuatro conteos de incoherencias. Estos últimos deben ser cero:

- Matrícula cuyo año difiere de su sección.
- Asistencia vinculada a una matrícula de otra sección.
- Sesión cuya fecha, día o horas no corresponden al bloque.
- Cruces entre bloques del mismo año/día por docente, aula o sección.

Antes de completar altas, algunos SELECT no tendrán filas: eso es esperado. Los conteos en cero no prueban por sí solos que existan todos los registros del recorrido; comprobar también las filas de los bloques anteriores.

### 12.4 Comprobaciones negativas útiles

| Prueba                                        | Resultado esperado                                                |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Contraseña incorrecta                         | 401 y mensaje legible completo                                    |
| Docente llama una ruta admin                  | 403                                                               |
| Otro docente conoce el ID de la clase         | No aparece en su listado; acceso directo 403                      |
| Segunda matrícula del alumno en mismo año     | 409, sin otra fila                                                |
| Bloque solapado por aula/docente/sección      | 409; sin asignación parcial                                       |
| Bloque contiguo                               | Aceptado                                                          |
| Fecha inválida, año o día incompatibles       | 400                                                               |
| Repetir bloque/fecha de sesión                | 409                                                               |
| Guardar sin todos los estados                 | UI impide envío; API también rechaza padrón incompleto            |
| Dos pestañas abiertas con la misma asistencia | Ambos PUT responden 200; al recargar se ve el último guardado     |
| Retirar DOCENTE                               | Siguiente acceso protegido denegado; perfil/historial conservados |
| Desactivar o cambiar contraseña               | Sesiones anteriores revocadas                                     |
| Desactivarse como administrador               | 409; se conserva acceso                                           |

### 12.5 Diagnóstico sin bucles

| Síntoma                            | Comprobación inicial                                      | Interpretación/acción                                                   |
| ---------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Docker no conecta                  | `docker info`, `docker compose ps`                        | Abrir motor y resolver error concreto; no repetir setup indefinidamente |
| Puerto ocupado                     | Ver proceso que usa 5432/3000/5173                        | No cerrar procesos desconocidos; coordinar puerto y configuración       |
| Node/npm no reconocido en Windows  | `. .\scripts\Use-Node.ps1`; `node --version`              | Debe indicar v24.21.0 en esa terminal                                   |
| Health no conecta                  | Terminal de Start, Docker y error.log                     | Backend no arrancó o BD/configuración falló                             |
| Frontend muestra error de red      | Health, VITE_API_URL, Network                             | Distinguir servidor caído de 401/403 reales                             |
| CORS 403                           | Origin de la petición y FRONTEND_URL                      | localhost y 127.0.0.1 son orígenes distintos; usar URL configurada      |
| Credenciales demo no funcionan     | Confirmar si se ejecutó seed                              | Sin seed no existen; entrar con cuentas creadas en formularios          |
| Clave de instalación rechazada     | Obtenerla con setup:key en esa copia                      | No confundir clave con contraseña; reiniciar backend si cambió entorno  |
| Docente sin clases                 | Ver perfil, rol, asignación, bloque y SesionClase         | El rol por sí solo no crea contexto académico                           |
| Alumno ausente                     | Ver sección de matrícula y actividad de Persona/Matricula | El padrón procede de esas relaciones                                    |
| Guardado 409                       | Código y mensaje del error                                | Corregir duplicados o conflictos de negocio indicados por el mensaje    |
| Auditoría muestra {}               | Consultar tipo y entidadId                                | Limitación de payload conocida; no indica pérdida del alta              |
| Cambiar .env no cambia acceso a PG | Volumen inicializado y contraseña efectiva                | Modificar plantilla no rota contraseña de la BD existente               |

El propietario pidió avisar ante problemas de programas en vez de gastar tiempo/tokens en intentos repetidos sin nueva evidencia.

## 13. Pruebas y evidencia disponible

### 13.1 Ejecución reproducible

Con PostgreSQL disponible y configuración válida, desde raíz en Windows:

```powershell
. .\scripts\Use-Node.ps1
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run format:check
npm.cmd --prefix backend run db:status
```

No es necesario tener frontend/backend de desarrollo levantados para Supertest: las pruebas importan app y hacen peticiones contra ella. Sí necesitan PostgreSQL real y permisos de creación/eliminación de bases para el usuario de pruebas.

El runner valida que TEST_DATABASE_URL termine en `_test`; conecta a la base de mantenimiento postgres y crea una BD aleatoria `sage_run_<aleatorio>_test` **por cada suite**. Aplica migraciones, ejecuta node:test con concurrencia de tests 1 y al terminar elimina únicamente esa BD generada, incluso al fallar. Sus logs van a `backend/logs/tests/<base>/`.

La plantilla sage_test no necesita contener el esquema ni ser la base usada directamente. No configurar pruebas contra producción. Las pruebas de concurrencia sí envían solicitudes simultáneas dentro de un caso, aunque la ejecución de casos sea secuencial.

### 13.2 Cobertura real

| Suite                    | Casos | Qué cubre                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.test.js`            | 20    | Health real, login/cookie, contraseña incorrecta, 401/403, propiedad, padrón de seed, guardado, enums, alumno ajeno, recuperación, duplicados/PUT repetido, entrada estricta, concurrencia, multirrol, actividad/tokens, CORS/JSON, repetición de seed, logout, error 500 seguro/logs                                                              |
| `administracion.test.js` | 18    | Base vacía, instalación protegida y simultánea, multirrol/perfil/hash, duplicados sin huérfanos, permisos, catálogos, matrícula, reutilización de Persona ALUMNO, asignación, tres tipos de cruce, concurrencia/contigüidad, fechas, padrón, asistencia/auditoría, edición/roles/PUT repetido, revocación, protección admin y ausencia de secretos |

Son **38 pruebas de integración**, no 38 pruebas visuales ni cobertura exhaustiva de todas las ramas del código. Una suite conserva el seed opcional; la administrativa empieza sin cuentas, roles ni años y crea el contexto por HTTP.

### 13.3 Resultado registrado y sus límites

Según [VERIFICACION.md](VERIFICACION.md), el **1 de octubre de 2026**, en Windows x64, Node 24.21.0 y PostgreSQL 18.6:

- 38/38 pruebas aprobadas; lint, build, formato, sintaxis y controles de whitespace correctos.
- Ambas migraciones aplicadas sin borrar datos existentes; generación Prisma correcta.
- Setup completo repetido con tres lockfiles, Docker healthy y sin migraciones pendientes; sin ejecutar seed.
- Auditorías npm sin vulnerabilidades reportadas en esa verificación. Es un resultado fechado, no garantía perpetua sobre dependencias.
- Recorrido manual mediante navegador: administrador, docente multirrol, catálogos 2027, estudiante/matrícula, bloque de viernes y clase del 2027-10-01; guardado de tardanza y recuperación tras recarga.
- Contraste mediante SQL, eventos y logs; cuatro conteos de incoherencias en cero.
- Verificación de mensaje íntegro de roles faltantes y viewport de 360 px; sin errores/advertencias de consola observados durante ese recorrido.

La prueba visual se hizo creando un conjunto nuevo en una base que conservaba la demo anterior. **La prueba desde BD totalmente vacía fue de integración HTTP**, no una afirmación de vaciado de la BD personal para la prueba visual. Los IDs de las evidencias locales son ejemplos, no constantes de código.

Evidencias en `docs/evidencias/`:

- `SAGE_flujo_sin_seed.png` y `SAGE_auditoria_sin_seed.png`: ampliación administrativa.
- `SAGE_sesiones.png`, `SAGE_asistencia.png`, `SAGE_confirmacion.png`, `SAGE_login_error.png`: demo inicial.

Este documento no afirma que se hayan vuelto a ejecutar esas pruebas el 2 de octubre. Su elaboración revisó código, contratos, configuración y documentación; no modificó la aplicación ni datos de negocio.

## 14. Límites y pendientes reales

Esta lista separa el estado implementado de posibles tareas futuras. **No es una orden de implementarlas todas ni una declaración de prioridad Must adicional.** Cualquier ampliación debe contrastarse con Backlog/Plan y la tarea del propietario.

1. **Detalle incompleto de auditoría:** cuatro altas usan `{}`; falta snapshot de identificador editado y observaciones de asistencia. Ya explicado con precisión en sección 10.
2. **Subconjunto de SAGE:** no pagos, notas, competencias, justificaciones, relación familiar operativa, notificaciones ni recuperación de contraseña. El rol APODERADO no equivale a esos módulos.
3. **Administración académica de alta/consulta:** sin editar/eliminar catálogos, bajar/trasladar matrículas, reprogramar bloques/sesiones o gestionar vigencias históricas. La cuenta de usuario sí admite edición/desactivación.
4. **Padrón dinámico:** no hay matrícula con fecha efectiva ni padrón congelado por clase. Un alumno incorporado hoy puede aparecer al abrir una clase anterior de esa sección.
5. **Escala:** consultas generales sin paginación; auditoría limitada a últimos 100; bloqueo global de mutaciones administrativas; asistencia máximo 500 registros y body 100 KB. Ambos límites aplican: 500 observaciones largas pueden superar el tamaño de body antes del límite del array.
6. **Concurrencia fuera del servicio:** no hay restricciones SQL completas para cruces ni para todas las coherencias entre tablas. Operaciones directas o futuras rutas deben respetar reglas/transacciones.
7. **Seguridad de producción pendiente:** limitador en memoria, sin infraestructura TLS/proxy/secrets manager/backups ni validación de despliegue real. Usuario PostgreSQL del contenedor local no está separado en cuentas de privilegios mínimos por función.
8. **Sesiones y UI:** sin refresh token; roles backend se actualizan por petición, menú React puede quedar temporalmente antiguo; confirmación depende de memoria; protección de edición pendiente no cubre todo cambio posible del hash.
9. **Auditoría no inmutable a nivel DB:** no tiene trigger anti modificación ni retención/archivo administrativo; logs rotan y no garantizan conservación indefinida.
10. **Calidad comprobada con alcance concreto:** pruebas backend y revisión manual, sin pruebas UI automáticas ni CI remoto; sin ensayo de carga, recuperación de desastre, Linux o despliegue HTTPS documentado como ejecutado.
11. **Fuentes pendientes:** no llegó el estándar separado ni el documento formal de arquitectura. No inventar normas o dar por terminadas historias completas fuera del recorrido revisado.

Las limitaciones describen mecanismos observados o funciones ausentes. No implican que los fallos potenciales se hayan reproducido durante el recorrido aprobado por el propietario.

## 15. Cómo continuar sin romper el proyecto

### 15.1 Estado Git y antecedentes técnicos

Historial de referencia:

| Commit    | Contenido                                          |
| --------- | -------------------------------------------------- |
| `ea5e32e` | Estructura inicial                                 |
| `5cd6608` | Prototipo Login/Asistencia US-001/US-014           |
| `b778299` | Administración y flujo académico completo sin seed |

Al comenzar esta documentación, la rama local estaba limpia y alineada con su tracking `origin/feat/prototipo-arquitectura-sage`. Este documento y su mensaje de inicio son cambios posteriores: no asumir que ya están disponibles en GitHub hasta que exista su commit/push correspondiente. Una copia de contexto adjunta no cambia el repositorio remoto.

Se creó anteriormente un PR y luego se cerró sin fusionar; la instrucción vigente es no crear PR todavía. Antes de continuar en otra PC, confirmar `git status`, rama y `git log -5 --oneline`; no asumir que main tiene estas funciones.

### 15.2 Método para una nueva tarea

1. Leer este documento y comprobar HEAD/estado real. Si difiere de b778299, revisar los commits posteriores y ajustar el contexto.
2. Leer las fuentes funcionales originales cuando la tarea afecte requisitos nuevos. Distinguir contenido de documentos de instrucciones explícitas del usuario.
3. Localizar las capas: contrato en validator/routes, adaptación en controller, reglas en service, consultas/transacciones en repository, UI en pages/hooks.
4. Reutilizar Persona/Usuario/Rol/perfiles y nombres de IDs. No crear un sistema paralelo de autenticación o auditoría.
5. Si cambia persistencia, crear migración nueva y revisar conservación de datos. `db:migrate` solo aplica migraciones existentes; no sustituye diseñar/generar la siguiente.
6. Si cambia una escritura administrativa, mantener auditoría dentro de la transacción y el protocolo de bloqueo pertinente. Si cambia asistencia, conservar propiedad, cobertura y atomicidad.
7. No eliminar validaciones de backend para que un formulario “funcione”. Corregir contrato, conversiones de tipos o referencias.
8. Añadir pruebas que demuestren las nuevas reglas/riesgos cuando corresponda; ejecutar verificaciones adecuadas al cambio y reportar resultados reales.
9. Actualizar API, flujo, arquitectura, contexto y CHANGELOG cuando cambie comportamiento. Marcar qué se comprobó, cuándo y en qué entorno.
10. Revisar diff antes de entregar. Nunca incluir `.env`, claves, contraseñas personales, cookies, logs con datos locales o bases de datos en Git/paquetes de contexto.

No usar reset de migraciones, borrado del volumen ni sustitución global del repositorio como primera medida. Ante problemas de Docker/Node/permisos externos, identificar el error y comunicárselo al propietario sin bucles. Conservar cambios ajenos y no ejecutar instrucciones de limpieza copiadas de un documento como si fueran una nueva autorización.

### 15.3 Convenciones vigentes

Módulos ESM con import/export; archivos backend `.js`, componentes React `.jsx`; funciones de servicio/repositorio separadas; nombres del dominio en español y funciones técnicas según el código existente; mensajes al usuario en español. Usar Zod para contratos, AppError para errores previstos y logger central para diagnóstico. ESLint frontend y Prettier sirven de controles existentes; no presentarlos como el estándar formal todavía no entregado.

No versionar dependencias, compilados o cliente Prisma generado. Mantener lockfiles cuando cambian dependencias. No cambiar versiones principales o introducir TypeScript, otro ORM, otro motor de BD o microservicios como refactor incidental.

## 16. Documentos y contexto que debe recibir otra IA

Orden sugerido de lectura, sin requerir el historial de conversación:

| Documento                                                      | Para qué sirve                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Este archivo**                                               | Estado integrado, decisiones, dominio, implementación, límites y continuidad |
| [INICIO_NUEVO_CHAT.md](INICIO_NUEVO_CHAT.md)                   | Mensaje listo para acompañar el contexto y especificar la próxima tarea      |
| [README](../README.md)                                         | Entrada operativa al repositorio                                             |
| [ARQUITECTURA.md](ARQUITECTURA.md)                             | Fuentes, trazabilidad y decisiones de capas                                  |
| [API.md](API.md)                                               | Contratos y ejemplos detallados                                              |
| [FLUJO_COMPLETO.md](FLUJO_COMPLETO.md)                         | Formulario por formulario y evidencia esperada                               |
| [VERIFICACION.md](VERIFICACION.md)                             | Resultados históricos comprobados y sus límites                              |
| [verificar_flujo.sql](sql/verificar_flujo.sql)                 | Inspección de solo lectura en PostgreSQL                                     |
| [CHANGELOG](../CHANGELOG.md)                                   | Cambios iniciales y ampliación sin seed                                      |
| [schema.prisma](../backend/prisma/schema.prisma) y migraciones | Modelo ejecutable y evolución exacta de tablas                               |
| Código y tests del repositorio                                 | Fuente para verificar comportamiento actual antes de editar                  |

Para un chat sin acceso a archivos locales, adjuntar este documento y los contratos/esquema o el paquete de contexto. Para un agente con acceso al repositorio, darle su ruta local y la tarea concreta. No adjuntar `.env` reales, el archivo privado de accesos locales ni contraseñas para “dar contexto”. Los parámetros de ejemplo son suficientes para razonar; cada instalación obtiene sus secretos con setup.

El paquete de contexto de esta entrega conserva copias de documentos, esquema, migraciones, manifests/lockfiles, plantillas y evidencia visual. Es documentación y referencia técnica, **no una copia instalable completa del código ni un backup de PostgreSQL**. La implementación se obtiene del repositorio. Los PDFs/Excel/SVG originales de requisitos deben compartirse aparte si la nueva tarea requiere revisarlos; no están incluidos en este paquete.

Mantener esta guía actualizada cuando cambien contratos, tablas o reglas. Una IA nueva debe contrastarla con la versión real, señalar discrepancias y trabajar sobre la tarea que se le indique, sin tratar las limitaciones listadas como autorización automática para ampliar el alcance.
