# Plan de trabajo semanal y evidencias pedagógicas — de punta a punta

Rama: `rama/moduloGestionAcademica`. Implementa en base de datos, backend y frontend el
plan de trabajo del docente organizado por semanas.

**Fuente de verdad del modelo y la API:** `.plans/evidencia-pedagogica-semanal-spec.md`
(estados PLANIFICADA/REALIZADA, revisión del administrador, tipo, enlaces,
`ArchivoEvidenciaPedagogica`, docente vigente, bloqueo por fin de bimestre, CHECK,
secuencia, auditoría, pruebas EVP). Esta especificación **añade** lo que falta para el
recorrido completo y **modifica** esa especificación solo donde se indica.
Fuera de alcance: notas, evaluaciones y cierre bimestral. El plan nunca lee ni escribe
`Calificacion*`, `Evaluacion*` ni `EvidenciaCalificacion`.

## Paso 0 — reparar la rama (antes de construir)

Arreglar a mano en esta rama, sin hacer merge de `main`, lo que dejó roto el merge
`e044886`. Usar como referencia la corrección de `main` (`26bc6f8`) para que el merge
posterior no genere conflictos innecesarios:

- `frontend/src/api/client.js`: error de sintaxis (línea ~85).
- `frontend/src/styles/app.css`: bloque sin cerrar (`.libreta-cierre`, línea ~1757).
- Fixtures con DNI inválido en `calificaciones-alumno`, `evidencias-calificacion`,
  `publicacion-libretas` y `libretas`, y la aserción de `cobranza.test.js:405`
  (`detalle.anterior` → la forma actual de `registrarTransaccionCritica`).
- `routes/index.js`: `GET /bimestres` está registrada dos veces y consulta Prisma
  desde la ruta; `session.report` se pasa dos veces.

Criterio de salida: `npm run lint`, `npm run build` (frontend) y las 16 suites pasan
antes de seguir.

## Cambios a la especificación anterior

- El alta (`POST /evidencias-pedagogicas`) acepta `realizada: true`. En ese caso la
  actividad nace `REALIZADA` y el servidor fija `fechaRealizacion`, en la misma
  transacción que los archivos. Sin la marca, nace `PLANIFICADA`; también puede llevar
  archivos (material preparado).
- Bimestres con fechas: dejan de ser un caso de error permanente, porque el
  administrador puede fijarlas (sección siguiente). Sigue valiendo
  `409 TERM_WITHOUT_DATES` mientras no las tengan.

## Fechas de bimestre (nuevo)

Sin esto ningún plan puede existir: los bimestres nacen sin fechas y hoy no hay forma
de editarlas.

**Backend.** Se sacan las rutas de `routes/index.js` y se crean
`routes/bimestres.js`, `controllers/bimestres.controller.js`,
`services/bimestres.service.js` y `repositories/bimestres.repository.js`.

- `GET /bimestres`: lo que devuelve hoy, más `fechaInicio`, `fechaFin` y `semanas`
  (calculado; `null` sin fechas).
- `PATCH /bimestres/:id` (ADMINISTRADOR): `{ fechaInicio, fechaFin }` en formato
  `YYYY-MM-DD`, con un esquema `.strict()`. Reglas, en una transacción que bloquea los
  bimestres del año y los planes activos del bimestre:
  - `fechaInicio <= fechaFin`;
  - no se solapa con otro bimestre del mismo año, y el orden respeta `numero`;
  - si el año académico tiene fechas, queda dentro de ellas;
  - si acortarlo deja actividades activas en semanas mayores que el nuevo total:
    `409 TERM_HAS_LATER_WEEKS`, con el detalle de los planes y las semanas que lo
    impiden.
  - Se audita con el evento `BIMESTRE_FECHAS_MODIFICADAS` (anterior/nuevo), con el
    mismo formato que la auditoría de planes.

**Frontend.** En `Catálogos académicos` (Admin), una tabla de bimestres del año con
fecha de inicio y fin editables y un botón «Guardar» por fila. Los errores del
servidor (solape, semanas ocupadas) se muestran en la fila.

**Seed de demo.** Fechas para los cuatro bimestres de 2026 (marzo–diciembre, de 9 a
10 semanas cada uno) y un plan de `MAT-03` 3.° B para `docente@sage.local`, con 3 o 4
actividades en semanas distintas (planificadas y realizadas, una de ellas validada),
sin archivos. Idempotente con `upsert`, como el resto del seed.

## Lectura del plan agrupado por semanas

- `GET /asignaciones`: las clases que puede ver la sesión, con salida mínima
  `{ id, curso: { id, nombre }, seccion: { id, nombre, grado } }`.
  - Docente: sus asignaciones vigentes del año activo.
  - Administrador: todas, con filtros `?cursoId&seccionId`.
  - Alumno/apoderado: los cursos de la sección de una matrícula visible
    (`?matriculaId`, obligatorio).
- `GET /planes-academicos?cursoId&seccionId&bimestreId`: 0 o 1 plan (lo garantiza el
  índice único parcial).
- `GET /planes-academicos/:id`: el plan con `bimestre { id, nombre, fechaInicio,
fechaFin, semanas, cerrado }` y `semanas: [{ numero, desde, hasta, evidencias: [...] }]`
  con **todas** las semanas del bimestre, también las vacías, ordenadas por `numero`. Las
  evidencias de cada semana van ordenadas por `creadoEn` y en su forma resumida: `id,
tipo, titulo, descripcion, estado, fechaRealizacion, estadoRevision,
observacionesRevision, totalArchivos, totalEnlaces`. `cerrado` indica que hoy es
  posterior a `fechaFin`.
- `GET /evidencias-pedagogicas/:id`: el detalle completo (archivos por nombre original,
  enlaces), según el alcance de la especificación anterior.
- Alumno/apoderado: `GET /evidencias-pedagogicas?matriculaId&cursoId&bimestreId`,
  agrupado por semanas con la misma forma, pero solo con las actividades visibles y sin
  datos de la revisión.

Semana `n`: `desde = fechaInicio + 7·(n−1)` y `hasta = min(desde + 6, fechaFin)`. El
cálculo vive en `domain/semanasBimestre.js` (función pura y probada) y lo usan el
servicio, la validación de `numeroSemana` y el bloqueo de `PATCH /bimestres/:id`.

## Frontend

Componentes base que se reutilizan: `AppLayout`, `Feedback` (`Loading`,
`ResourceError`), `useResource`, `ConfirmarAccion`, y el campo de archivos y la
validación cliente de `EvidenciasCompetencia.jsx`, que se extraen a un componente
compartido `CampoArchivos.jsx` sin cambiar su comportamiento.

### Docente — `#/plan-trabajo`

- **Menú:** nueva entrada «Plan de trabajo» para DOCENTE en `AppLayout`, separada de
  «Gestión Académica», con su propia `section`. Ruta en `App.jsx`.
- **Selección:** desplegable de curso (agrupado desde `GET /asignaciones`), luego de
  sección (las de ese curso) y luego de bimestre, con el bimestre en curso
  preseleccionado (si no hay, el próximo). Si solo hay una opción, se elige sola.
- **Sin plan:** mensaje y botón «Crear plan», que abre un modal con título y objetivo
  (`POST /planes-academicos`). Si el bimestre no tiene fechas: aviso «El
  administrador aún no definió las fechas de este bimestre» y no hay botón.
- **Vista (filas por semana):** encabezado «Plan de trabajo · Matemática – 3.° B ·
  I Bimestre». Debajo, una fila por semana con la etiqueta «Semana N» y su rango
  de fechas a la izquierda, las tarjetas a la derecha y un botón «+ Actividad» al final
  de la fila. Las filas vacías muestran «Sin actividades».
- **Tarjeta:** etiquetas de tipo («Exposición») y de estado («Planificada» /
  «Realizada»; «Observada» o «Validada» si la revisión no está pendiente), título y
  descripción recortada a 3 líneas. Al pulsarla se abre el modal de la actividad.
- **Modal de actividad** (alta y edición):
  - Campos: semana (preseleccionada con la fila y modificable), tipo, título,
    descripción, enlaces (hasta 5, uno por línea o con «+ enlace»), archivos (hasta 3)
    y una casilla «Ya se realizó» (en edición, el botón «Marcar como realizada» si
    sigue planificada).
  - En edición se ven la observación del administrador, si la hay, y los archivos
    actuales, cada uno con su descarga y su botón «Quitar», que pide confirmación.
  - «Dar de baja» con `ConfirmarAccion`.
  - Datos, estado y archivos nuevos se envían en **una sola** petición multipart. Si
    falla, el modal sigue abierto con todo lo escrito y muestra el mensaje del
    servidor. Por defecto (patrón actual): el botón se deshabilita mientras guarda y,
    al guardar, se vuelve a consultar el plan.
- **Solo lectura:** con el bimestre cerrado o la actividad `VALIDADA`, no hay botones
  de alta ni de edición; el modal se abre solo para ver. El servidor lo bloquea
  igualmente.

### Administrador — pestaña «Planes de trabajo» en Gestión académica

- Pestaña nueva en `#/gestion` (junto a reglas y publicación).
- Filtros de bimestre, curso y sección; la misma vista por semanas en solo lectura.
- En cada actividad `REALIZADA`: un modal «Revisar» con Validar u Observar y
  observaciones (obligatorias para Observar), que llama a
  `PUT /evidencias-pedagogicas/:id/revision`.
- Las correcciones con motivo después del cierre quedan **solo por API** en este paso.

### Alumno/apoderado — `#/actividades`

- Entrada de menú «Actividades de clase» para ALUMNO y APODERADO.
- Selector de matrícula igual al de `Libreta.jsx`; después curso y bimestre.
- Filas por semana en solo lectura con las tarjetas visibles; al abrir una, se ven la
  descripción, los enlaces y la descarga de archivos.

### Estilos

Clases nuevas en `styles/app.css` (fila de semana, tarjeta y etiquetas), con las
variables y los tamaños existentes. En pantallas estrechas, la etiqueta de la semana
queda arriba y las tarjetas debajo, en una columna.

## Pruebas

- Backend: las de la especificación anterior (EVP) y, además:
  - `GET /planes-academicos/:id` devuelve todas las semanas, también las vacías,
    ordenadas, con sus rangos.
  - `realizada: true` en el alta, con archivos; si falla, no queda nada.
  - `PATCH /bimestres/:id`: datos válidos; solape, orden incorrecto, inicio > fin y
    campo extra rechazados; acortar con semanas ocupadas da 409; un docente recibe 403.
  - `GET /asignaciones` según el rol (docente ajeno, alumno con una matrícula que no
    es suya: 403).
  - `domain/semanasBimestre.js`: bimestre de 9 semanas y 3 días, de un solo día, y
    fechas que cruzan meses.
- Frontend: `npm run lint` y `npm run build` sin errores.
- Recorrido en el navegador integrado con el seed, con capturas:
  - Administrador: fija las fechas de un bimestre.
  - Docente: crea el plan, registra una actividad planificada y otra realizada con
    un PDF, la edita y la marca como realizada; prueba un archivo rechazado (el modal
    conserva los datos).
  - Administrador: valida una actividad y observa otra.
  - Docente: ve la observación.
  - Apoderado: ve solo las actividades realizadas no observadas.

## Documentación

CHANGELOG (incluida la corrección de «se reemplaza» de `83d56f3`), `docs/API.md` (rutas
de planes, evidencias pedagógicas, asignaciones y bimestres), CLAUDE.md («Estado actual»
y el término «evidencia de calificación» para US-019) y `docs/PRUEBAS_*` con el paso a
paso para probar en pantalla.

## Orden de implementación

0. Reparar la rama y dejarla en verde.
1. Migración y esquema (especificación anterior + nada nuevo en bimestres: las columnas
   de fecha ya existen).
2. `domain/semanasBimestre.js` y bimestres (API y pruebas).
3. Planes y evidencias pedagógicas (repositorio, servicio, rutas, pruebas EVP).
4. `GET /asignaciones`.
5. Seed de demo.
6. Frontend: docente, administrador, alumno/apoderado.
7. Documentación y recorrido en el navegador.

## Cambio posterior: subida y publicada (2026-11-20)

Decidido con el equipo tras probar el flujo. PLANIFICADA/REALIZADA se reemplaza por la
visibilidad para los alumnos, derivada de publicadaDesde al consultar: null es subida (solo la
ve el docente), una fecha futura es programada y hoy o antes es publicada. El docente sube con
anticipación, publica a mano o programa una fecha (entre hoy y el fin del bimestre) y puede
ocultar lo publicado salvo que esté validado. La coordinación solo revisa lo publicado, y
ocultar conserva la revisión. Migración 20261121120000_publicacion_evidencias_pedagogicas: lo
que estaba realizado queda publicado desde su fecha de realización.
