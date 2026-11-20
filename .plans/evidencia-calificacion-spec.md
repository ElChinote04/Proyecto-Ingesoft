# Especificación: evidencia pedagógica de la calificación

**Módulo:** Gestión Académica y Evaluación · **Rama:** `rama/moduloGestionAcademica` · **Fecha:** 2026-11-06
**Historia:** US-019.

## 1. Historia

Como docente, puedo registrar evidencia pedagógica asociada a cada evaluación para sustentar la
calificación otorgada a cada alumno.

| Criterio de aceptación                                                 | Cómo se cumple                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Permite adjuntar o describir evidencia vinculada a una evaluación      | La evidencia lleva título y, como mínimo, una descripción o un archivo, y apunta a una `CalificacionCompetencia` |
| La evidencia queda asociada al alumno, curso y competencia evaluada    | Se deriva de esa llave foránea: matrícula → alumno, asignación → curso, competencia → competencia             |

Para que esa evidencia sustente de verdad lo publicado, esta especificación también cambia la
publicación de libretas: la hace el administrador, sección por sección, solo con la evidencia
completa, y a partir de ahí las notas de esa sección quedan bloqueadas para el docente.

## 2. Decisiones tomadas

| Tema                  | Decisión                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| «Evaluación»          | La nota por competencia y bimestre (`CalificacionCompetencia`). Debe existir antes que la evidencia         |
| Identificar la tarea  | Título libre en cada evidencia («Práctica 1»). No se crea una entidad `Evaluacion`                          |
| Modelo                | Modelo nuevo. `EvidenciaPedagogica` (avance del plan académico) sigue siendo otro concepto                  |
| Adjuntos              | Archivos reales en disco, fuera del repositorio, con metadatos en la base y descarga autenticada            |
| Tipos y límites       | PDF, JPG y PNG · 5 MB por archivo · 3 archivos activos por evidencia · tipo verificado por sus primeros bytes |
| Contenido mínimo      | Título obligatorio, más descripción o al menos un archivo                                                   |
| Visibilidad           | Docente actual de la asignación y administrador. Alumno y apoderado no ven nada                             |
| Pantalla              | Dentro del modal Calificar alumno, con un botón «Evidencias (n)» por competencia                            |
| Tras guardar la nota  | El modal sigue abierto y habilita «Evidencias» de inmediato                                                 |
| Quién publica         | Solo el administrador, por sección y bimestre. La publicación genera las libretas de los alumnos            |
| Publicación masiva    | El administrador también puede publicar en una acción todas las secciones listas del bimestre               |
| Condición de publicar | En esa sección, toda matrícula activa debe tener nota y al menos una evidencia activa en cada competencia activa de sus cursos |
| Antes de publicar     | El docente cambia notas y evidencia sin límite                                                              |
| Sección publicada     | Nota y evidencia de esa sección y bimestre quedan en solo lectura para el docente                           |
| Corrección tras publicar | Solo el administrador, por API, con motivo obligatorio guardado en la auditoría                          |
| Cambio de nota        | La evidencia conserva el nivel vigente al registrarse y sigue vinculada                                     |
| Baja                  | Baja lógica, archivo conservado. Sigue visible con etiqueta «Inactiva», en solo lectura y descargable        |
| Contador              | «Evidencias (n)» cuenta solo las activas. No hay reactivación                                               |
| Administrador         | Pantalla para revisar pendientes y publicar. Consultar evidencia y corregir tras publicar son solo por API  |
| Cambio de docente     | Consulta y edita quien tiene una asignación activa del curso en la sección. La auditoría conserva al autor  |

## 3. Modelo de datos

Migración `20261106120000_evidencias_calificacion`, en el mismo cambio que `schema.prisma` y el código.

```prisma
model EvidenciaCalificacion {
  id                        Int                          @id @default(autoincrement())
  calificacionCompetenciaId Int
  calificacionCompetencia   CalificacionCompetencia      @relation(fields: [calificacionCompetenciaId], references: [id])
  titulo                    String
  descripcion               String?
  nivelLogroRegistrado      NivelLogro
  activo                    Boolean                      @default(true)
  creadoPorId               Int
  modificadoPorId           Int
  creadoEn                  DateTime                     @default(now())
  modificadoEn              DateTime                     @updatedAt
  archivos                  ArchivoEvidenciaCalificacion[]

  @@index([calificacionCompetenciaId, activo])
}

model ArchivoEvidenciaCalificacion {
  id               Int                   @id @default(autoincrement())
  evidenciaId      Int
  evidencia        EvidenciaCalificacion @relation(fields: [evidenciaId], references: [id])
  nombreOriginal   String
  nombreAlmacenado String                @unique
  tipoMime         String
  tamanoBytes      Int
  activo           Boolean               @default(true)
  creadoPorId      Int
  creadoEn         DateTime              @default(now())

  @@index([evidenciaId, activo])
}
```

`CalificacionCompetencia` agrega `evidencias EvidenciaCalificacion[]`.

La publicación pasa a ser un dato propio, porque un evento de auditoría solo identifica una entidad
y aquí la clave es sección y bimestre. El índice único impide publicar dos veces:

```prisma
model PublicacionSeccion {
  id             Int               @id @default(autoincrement())
  bimestreId     Int
  bimestre       BimestreAcademico @relation(fields: [bimestreId], references: [id])
  seccionId      Int
  seccion        Seccion           @relation(fields: [seccionId], references: [id])
  publicadoPorId Int
  publicadoEn    DateTime          @default(now())

  @@unique([bimestreId, seccionId])
}
```

La migración migra lo ya publicado: por cada evento `NOTA_PUBLICADA` con entidad `BimestreAcademico`
crea una fila para cada sección del año de ese bimestre. Así ninguna libreta visible hoy desaparece.
Esas secciones quedan publicadas aunque no tengan evidencia, porque se publicaron con la regla anterior.

- Alumno, curso y competencia no se copian: duplicarlos permitiría que dejen de coincidir con la nota.
  Las filas de `CalificacionCompetencia` se actualizan con `upsert`, así que la llave foránea es estable.
- `nivelLogroRegistrado` lo fija el servidor al crear y no cambia al editar.
- Quitar un archivo de una evidencia activa también es baja lógica. Ese archivo deja de listarse,
  sigue en disco y el cambio queda en la auditoría.

## 4. API

Base `/api/v1`. Respuestas `{ "data": ... }`. El contrato de error real es el de `errorHandler.js`
(`code`, `message`, `details`, `requestId`), que es el que lee el frontend.

| Método y ruta                                                  | Rol                        | Cuerpo                                                     | Éxito |
| -------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- | ----- |
| `GET /calificaciones-competencias/:id/evidencias`              | Docente actual, admin      | —                                                          | 200   |
| `POST /calificaciones-competencias/:id/evidencias`             | Docente actual             | multipart: `titulo`, `descripcion?`, `archivos` (0 a 3)    | 201   |
| `PATCH /evidencias-calificaciones/:id`                         | Docente actual             | JSON: `titulo?`, `descripcion?` (`null` la borra)          | 200   |
| `DELETE /evidencias-calificaciones/:id`                        | Docente actual, admin      | —                                                          | 200   |
| `POST /evidencias-calificaciones/:id/archivos`                 | Docente actual             | multipart: `archivos` (1 a 3)                              | 201   |
| `DELETE /evidencias-calificaciones/:id/archivos/:archivoId`    | Docente actual             | —                                                          | 200   |
| `GET /evidencias-calificaciones/:id/archivos/:archivoId`       | Docente actual, admin      | —                                                          | 200   |

`GET /matriculas/:id/calificaciones` agrega `bimestre.publicado` (referido a la sección de esa
matrícula) y, por competencia,
`calificacionCompetenciaId` (`null` si no hay nota) y `totalEvidencias` (solo activas).

Forma de cada evidencia en la lista:

```json
{
  "id": 12,
  "titulo": "Práctica 1",
  "descripcion": "Resolvió 4 de 5 problemas.",
  "nivelLogroRegistrado": "A",
  "activo": true,
  "creadoEn": "2026-11-06T15:00:00.000Z",
  "archivos": [{ "id": 3, "nombre": "practica.pdf", "tipoMime": "application/pdf", "tamanoBytes": 183042 }]
}
```

La lista trae además `contexto` con alumno, curso, competencia y bimestre, solo con nombre y código.
Nunca sale `nombreAlmacenado`. El orden es activas primero, luego inactivas, cada grupo por fecha
descendente.

### Reglas

| Código                   | HTTP | Cuándo                                                                       |
| ------------------------ | ---- | ---------------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | Título vacío o de más de 120 caracteres, descripción de más de 2000, campo extra |
| `EVIDENCE_EMPTY`         | 400  | Quedaría sin descripción y sin archivos activos (crear, editar o quitar archivo) |
| `FILE_TYPE_NOT_ALLOWED`  | 400  | Los primeros bytes no son PDF, JPG ni PNG                                    |
| `FILE_TOO_LARGE`         | 400  | Un archivo supera 5 MB                                                       |
| `TOO_MANY_FILES`         | 400  | Más de 3 archivos activos en la evidencia                                    |
| `FORBIDDEN`              | 403  | No es el docente actual de la asignación ni, cuando aplica, administrador    |
| `GRADE_DETAIL_NOT_FOUND` | 404  | La nota no existe o está inactiva                                            |
| `EVIDENCE_NOT_FOUND`     | 404  | La evidencia no existe                                                       |
| `FILE_NOT_FOUND`         | 404  | El archivo no existe, está dado de baja o falta en disco (esto último se registra como error) |
| `TERM_PUBLISHED`         | 409  | El docente intenta modificar con la sección publicada en ese bimestre        |
| `EVIDENCE_INACTIVE`      | 409  | Se intenta modificar una evidencia dada de baja                              |

- Se usa 400 y no 413 porque el contrato de la API no incluye 413.
- Un archivo de una evidencia inactiva se descarga. Un archivo quitado individualmente no.
- El administrador con rol docente sigue las reglas de docente para crear y editar. La baja por
  administrador no se bloquea por publicación.
- Publicado significa que existe `PublicacionSeccion` para el bimestre y la sección de la matrícula.
- Tras publicar, la baja por administrador exige `motivo` en el cuerpo, igual que en §4.2.

### Archivos

- `multer` (versión exacta en `package.json`) en memoria, con `limits` de tamaño y cantidad, y
  `defParamCharset: 'utf8'` para no dañar tildes en los nombres. Va después de `requireAuth` y antes
  de `validate`, para no procesar bytes de usuarios sin sesión.
- Los errores de `multer` se convierten en `AppError` en el middleware de la ruta.
- `app.js` no cambia: el límite de 100 kB aplica solo al JSON.
- El tipo guardado es el detectado por firma (`%PDF-`, `FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`), no el
  que declara el cliente.
- En disco el nombre es un UUID sin extensión, dentro de `EVIDENCIAS_DIR`. Ninguna ruta de disco se
  arma con datos del cliente y la carpeta no se sirve con `express.static`.
- La descarga responde con `Content-Disposition: attachment`, usando `nombreOriginal`, y con el
  `nosniff` que ya pone `helmet`.

### Orden de escritura

Mantener abierta una transacción mientras se escriben hasta 15 MB arriesga el tiempo límite de
Prisma. Por eso:

1. Comprobar nota, permisos, publicación y contenido.
2. Escribir los archivos en disco.
3. En una transacción: repetir las comprobaciones, insertar y auditar.
4. Si falla el paso 3, borrar los archivos recién escritos.

Al agregar archivos, el repositorio bloquea la fila de la evidencia con `SELECT ... FOR UPDATE` para
que dos subidas simultáneas no superen el límite de 3.

### Auditoría

Se agregan a `EVENTOS_CRITICOS`, dentro de la misma transacción, con `entidad: 'EvidenciaCalificacion'`:

- `EVIDENCIA_CALIFICACION_REGISTRADA`
- `EVIDENCIA_CALIFICACION_MODIFICADA` (edición, archivo agregado o quitado)
- `EVIDENCIA_CALIFICACION_DADA_DE_BAJA`

El detalle guarda título, descripción, nivel y nombres de archivo. Nunca rutas ni contenido.

## 4.1 Publicación por sección

| Método y ruta                                                         | Rol   | Cambio                                                              |
| --------------------------------------------------------------------- | ----- | ------------------------------------------------------------------- |
| `GET /calificaciones/bimestres/:id/publicacion?pagina&limite`         | Admin | Nueva. Devuelve el estado de cada sección y sus pendientes          |
| `POST /calificaciones/bimestres/:id/secciones/:seccionId/publicacion` | Admin | Nueva. Publica una sección si está completa. Devuelve 201           |
| `POST /calificaciones/bimestres/:id/publicacion`                      | Admin | Hoy es del docente y publica el bimestre. Pasa a publicación masiva |

Se **espera** una combinación por cada matrícula activa de la sección y cada competencia activa de
los cursos con asignación activa. Se agrupa por curso, no por asignación: reasignar un curso crea otra
asignación y deja activa la anterior, así que contar por asignación exigiría dos veces la misma
competencia. Está **completa** si tiene `CalificacionCompetencia`
activa en ese bimestre y al menos una evidencia activa. Una evidencia inactiva no cuenta. El cálculo
es una función pura en `domain/publicacionSeccion.js`.

```json
{
  "bimestre": { "id": 1, "nombre": "Bimestre 1" },
  "resumen": { "publicadas": 5, "listas": 4, "conPendientes": 3, "sinDatos": 0 },
  "seccionesListas": [{ "id": 7, "nombre": "3.° A" }],
  "secciones": [
    {
      "id": 3,
      "nombre": "3.° B",
      "estado": "CON_PENDIENTES",
      "totalEsperado": 40,
      "totalCompleto": 37,
      "publicadoEn": null,
      "pendientes": [
        { "curso": "Arte", "docente": "Ana Ríos", "sinNota": 1, "sinEvidencia": 2, "sinRegla": false }
      ]
    }
  ],
  "paginacion": { "pagina": 1, "limite": 10, "total": 12 }
}
```

- `estado` se deriva: `PUBLICADA`, `LISTA`, `CON_PENDIENTES` o `SIN_DATOS` (nada que evaluar).
- `pendientes` se agrupa por curso, sin nombres de alumnos.
- `sinRegla` es `true` si el curso no tiene regla de consolidación vigente para el grado. Explica por
  qué sus notas faltan y que no depende del docente.
- `seccionesListas` no se pagina, porque el modal de la publicación masiva las nombra todas.
- `limite` admite 10, 25 o 50.
- La lista solo incluye secciones del año académico del bimestre.

| Código                   | HTTP | Cuándo                                                          |
| ------------------------ | ---- | --------------------------------------------------------------- |
| `PUBLICATION_INCOMPLETE` | 409  | Faltan notas o evidencias en la sección. `details` trae los totales |
| `GRADES_NOT_FOUND`       | 404  | La sección no tiene ninguna combinación esperada                |
| `INVALID_TERM_CONTEXT`   | 400  | La sección no corresponde al año académico del bimestre         |

Publicar una sección ya publicada devuelve 200 con `{ publicado: true, yaPublicado: true }`.

**Publicación masiva.** El cuerpo es `{ "seccionIds": [7, 8] }`, con los identificadores que el
administrador confirmó (de 1 a 200, sin repetir). Publicar es irreversible, así que se publica
exactamente lo confirmado y no una sección que quedó lista después de abrir el modal.

```json
{
  "publicadas": [{ "id": 7, "nombre": "3.° A" }],
  "omitidas": [{ "id": 8, "nombre": "3.° C", "razon": "CON_PENDIENTES" }]
}
```

- Cada sección se publica en su propia transacción, con la misma función, bloqueo y comprobación que
  la publicación individual. Una sección que dejó de estar lista se omite y no detiene a las demás.
- `razon` puede ser `CON_PENDIENTES`, `YA_PUBLICADA`, `SIN_DATOS` o `OTRO_ANIO_ACADEMICO`.
- Responde 200 aunque `publicadas` quede vacía.
- Si el proceso se interrumpe, repetir es seguro: lo ya publicado se omite.
- Se registra un evento `NOTA_PUBLICADA` por sección, con `contexto: { masiva: true }`.

**Auditoría.** Se mantiene el evento `NOTA_PUBLICADA`, ahora con entidad `PublicacionSeccion` y
`{ bimestreId, seccionId }` en el valor nuevo.

**Libreta.** `filtrarPublicadas` compara bimestre y `matricula.seccionId`. Un alumno ve su libreta
cuando se publica su sección. Se elimina `listBimestresPublicados` y también `publishBimestre`, que no
se usa.

**Concurrencia.** Una regla que no puede perder una carrera no se resuelve solo con una comprobación
previa. Por eso la publicación toma `SELECT ... FOR UPDATE` sobre la fila de la sección, y cada
escritura de docente sobre notas o evidencia toma `FOR SHARE` sobre esa fila y comprueba la
publicación dentro de su transacción. Ninguna escritura entra después de publicar, y ninguna baja de
evidencia invalida la comprobación mientras se publica. Secciones distintas no se bloquean entre sí.

## 4.2 Bloqueo de notas

Con la sección publicada en ese bimestre, responden `409 TERM_PUBLISHED` para el docente:

- `PUT /matriculas/:id/calificaciones`
- `POST /calificaciones`
- `POST /calificaciones-competencias`

El administrador conserva estas rutas, pero con la sección publicada debe enviar `motivo` (de 5 a
500 caracteres). Si falta, responde `400 CORRECTION_REASON_REQUIRED`:

- `PUT /calificaciones/:id` y `DELETE /calificaciones/:id`
- `PUT /calificaciones-competencias/:id` y `DELETE /calificaciones-competencias/:id`

Los `DELETE` reciben el motivo en un cuerpo JSON. Su esquema acepta cuerpo ausente, porque antes de
publicar el motivo no se exige y Express 5 deja `req.body` sin definir. `auditCalificacion` y
`auditCalificacionCompetencia` guardan `motivo` en `detalle`; los nombres de evento no cambian.

## 5. Interfaz

### `components/CalificarAlumno.jsx`

- Cada competencia con nota guardada muestra el botón secundario `Evidencias (n)`.
- Sin nota guardada, se muestra la ayuda «Califica y guarda para agregar evidencia».
- Con un cambio de nivel sin guardar en esa competencia, el botón se deshabilita con la ayuda
  «Guarda el cambio de nivel para registrar evidencia». Así el nivel registrado es el real.
- Al guardar: el modal sigue abierto, `cambios` se vacía, la ficha se recarga y aparece un
  `Feedback` de éxito dentro del modal.
- «Cancelar» pasa a «Cerrar» cuando no hay cambios pendientes.
- `pages/Calificaciones.jsx` pierde el aviso de éxito de la página, que queda redundante.
- Una competencia con nota y sin evidencia activa muestra la etiqueta de texto «Falta evidencia»,
  porque impide publicar.
- Con `bimestre.publicado`: radios deshabilitados, sin botón «Guardar calificaciones» y un `Feedback`
  informativo «La libreta de este salón ya fue publicada: las notas están en modo consulta».

### `components/EvidenciasCompetencia.jsx` (nuevo)

Un `<dialog>` sobre el modal, de modo que los cambios pendientes del padre no se pierden.

- **Encabezado:** «Evidencias de {alumno}», con curso, competencia, bimestre y nivel actual.
- **Lista:** título, fecha, descripción, «Registrada con nivel A», archivos con «Descargar» y
  acciones «Editar» y «Dar de baja».
- **Inactivas:** al final, atenuadas, con etiqueta de texto «Inactiva» y solo «Descargar».
- **Formulario:** Título \*, Descripción, Archivos (`accept=".pdf,.jpg,.jpeg,.png"`, `multiple`) y
  botón primario «Registrar evidencia». En edición, «Guardar evidencia».
- **Validación:** al salir del campo y al elegir archivos, con mensaje específico bajo el campo. El
  valor no se borra si hay error.
- **Envío:** botón bloqueado con «Guardando…» y un `<progress>` indeterminado mientras suben los
  archivos.
- **Sección publicada:** `Feedback` informativo «La libreta de este salón ya fue publicada: la
  evidencia está en modo consulta», sin formulario ni acciones de cambio.
- **Baja y quitar archivo:** con `ConfirmarAccion`.
- **Salir con formulario sin guardar:** modal de confirmación.
- **Estados:** carga, vacío («Esta nota todavía no tiene evidencias»), error y reintento con
  `Loading`, `ResourceError` y `Feedback`.

El contador del padre se actualiza al cerrar el panel.

### `components/PublicacionLibretas.jsx` (nuevo)

Sección con H2 «Publicación de libretas» en la vista de administrador de Gestión académica, junto a
`CompetenciesSection` en `pages/ReglasConsolidacion.jsx`. No necesita ruta nueva.

- Selector de bimestre y resumen «5 publicadas · 4 listas · 3 con pendientes».
- `TablaDatos` con Sección, Avance («37 de 40»), Estado y Acción, paginada en 10/25/50.
- Estado con etiqueta de texto: «Publicada», «Lista», «Con pendientes» o «Sin datos».
- Acción por fila, con botón secundario: «Publicar» si está lista y «Ver pendientes» si no. Esta
  muestra Curso, Docente, Sin nota y Sin evidencia.
- Un curso con `sinRegla` muestra «Sin regla de consolidación» en vez de culpar al docente.
- «Publicar» confirma con un modal: «Los alumnos y apoderados de 3.° B verán su libreta y los docentes
  ya no podrán cambiar notas ni evidencia de esta sección. Esta acción no se puede deshacer.»
- Botón primario «Publicar secciones listas (4)», deshabilitado si no hay ninguna. Su modal nombra las
  secciones y advierte lo mismo.
- Al terminar: `Feedback` de éxito «Se publicaron 4 secciones» y, si hubo omitidas, otro de advertencia
  con sus nombres y razones. La tabla se recarga.
- Un `409 PUBLICATION_INCOMPLETE` por un cambio reciente recarga la tabla.

### Desviaciones de los estándares que se mantienen a propósito

- Los avisos usan `Feedback` en línea y no toast, porque es lo que existe en el proyecto.
- Sin íconos Lucide: la dependencia no está instalada y las acciones llevan texto.
- Sin paginación en la lista: se limita a las evidencias de una sola nota.

### `api/client.js`

- `body instanceof FormData`: se envía sin `JSON.stringify` y sin `Content-Type`.
- Nueva función `descargar(path)`: `fetch` con credenciales y conversión a blob, para que un 401 o
  404 se muestre en la interfaz y no como JSON en una pestaña nueva.
- Las llamadas existentes no cambian.

## 6. Archivos

**Nuevos, backend:** `routes/evidenciasCalificacion.js`, `controllers/evidenciasCalificacion.controller.js`,
`services/evidenciasCalificacion.service.js`, `repositories/evidenciasCalificacion.repository.js`,
`validators/evidenciasCalificacion.schemas.js`, `middleware/archivosEvidencia.js` (`multer`),
`integrations/almacenEvidencias.js` (guardar, abrir y borrar en disco),
`domain/archivoEvidencia.js` (detección de tipo, sin entrada/salida), `domain/publicacionSeccion.js`,
`tests/evidencias-calificacion.test.js`, `tests/publicacion-libretas.test.js`.

**Nuevos, frontend:** `components/EvidenciasCompetencia.jsx`, `components/PublicacionLibretas.jsx`.

**Modificados, gestión académica:** `prisma/schema.prisma`, nueva migración,
`services/calificacionesAlumno.service.js` y `repositories/calificacionesAlumno.repository.js`
(campos nuevos de la ficha y bloqueo), `services/calificacionService.js`,
`repositories/calificacionRepository.js`, `routes/calificacion.js`,
`controllers/calificacionController.js`, `services/calificacionCompetenciaService.js`,
`repositories/calificacionCompetencia.js`, `routes/calificacionCompetencia.js`,
`controllers/calificacionCompetenciaController.js`, `validators/adminSchemas.js` (motivo),
`repositories/evidenciaPedagogicaRepository.js` (corrección de §7),
`components/CalificarAlumno.jsx`, `pages/Calificaciones.jsx`, `pages/ReglasConsolidacion.jsx`,
`pages/Libreta.jsx` (el aviso de no publicado ya no depende del docente), `styles/app.css`.

**Compartidos, autorizados:**

| Archivo                                         | Cambio                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| `routes/index.js`                               | Montar el router                                      |
| `backend/package.json` y `package-lock.json`    | `multer`                                              |
| `backend/.env.example`, `config/env.js`         | `EVIDENCIAS_DIR`, por defecto `storage/evidencias`    |
| `.gitignore`                                    | `backend/storage/`                                    |
| `scripts/test.js`                               | Suites nuevas y `EVIDENCIAS_DIR` temporal por suite   |
| `services/auditoria.service.js`                 | Los tres eventos                                      |
| `frontend/src/api/client.js`                    | `FormData` y descarga                                 |
| `docs/API.md`, `CHANGELOG.md`, `CLAUDE.md`      | Documentación                                         |
| `docs/AUDITORIA_TRANSACCIONES.md`               | Solo agregar: tres filas de eventos y una nota sobre `motivo` en correcciones. No se elimina contenido |

## 6.1 Ajustes hechos al implementar

- **Reasignación de cursos:** la ficha busca las notas por curso y sección, y `guardarCalificaciones`
  reutiliza la calificación existente del curso. Sin esto, el docente nuevo no vería la nota y al
  calificar crearía otra, dejando la evidencia ligada a una nota que ya no es la vigente.
- **`calificacionCompetencia.js`:** no exportaba `transaction`, así que toda escritura de
  `/calificaciones-competencias` fallaba con 500. Era la vía de corrección del administrador y se
  corrigió.
- **Servicio y repositorio nuevos:** la publicación vive en `publicacionSeccion.service.js`,
  `publicacionSeccion.repository.js` y `publicacionSeccion.controller.js`.

## 7. Corrección de `EvidenciaPedagogica`

`auditEvidenciaPedagogica` escribe `tipoEntidad`, `idEntidad`, `valorAnterior`, `valorNuevo` y
`observacion`, que no existen en `RegistroAuditoria`. Por lectura del código, cualquier creación,
edición, revisión o baja debería fallar con 500 y revertirse; falta confirmarlo ejecutándolo.

- Primero, una prueba de regresión que reproduzca el fallo con `POST /evidencias-pedagogicas`.
- Después, escribir `entidad`, `entidadId`, `requestId`, `detalle` y `resultado: 'EXITO'`.
- No se corrigen sus otras desviaciones, como `docenteId` en el cuerpo o Prisma en el service.

## 8. Pruebas

Suite `evidencias-calificacion`, usando siempre una carpeta temporal.

| ID     | Caso                                                                                |
| ------ | ----------------------------------------------------------------------------------- |
| EVC-01 | Registra solo con descripción (201), con auditoría y nivel fijado por el servidor   |
| EVC-02 | Registra con PDF y JPG; el archivo queda en disco y se descarga idéntico            |
| EVC-03 | La respuesta expone alumno, curso y competencia, y nunca `nombreAlmacenado`         |
| EVC-04 | Rechaza sin descripción y sin archivos (`EVIDENCE_EMPTY`)                           |
| EVC-05 | Rechaza campo extra y título demasiado largo (400)                                  |
| EVC-06 | Rechaza un `.exe` renombrado a `.pdf` (`FILE_TYPE_NOT_ALLOWED`) sin dejar archivo    |
| EVC-07 | Rechaza más de 5 MB y un cuarto archivo                                             |
| EVC-08 | Sin sesión responde 401 en todas las rutas                                          |
| EVC-09 | Otro docente, alumno y apoderado reciben 403 al consultar y al descargar            |
| EVC-10 | Con la sección publicada: el docente recibe `TERM_PUBLISHED` y aún puede consultar y descargar |
| EVC-11 | Tras publicar: el administrador da de baja con motivo y sin motivo recibe 400        |
| EVC-12 | Cambiar la nota no altera `nivelLogroRegistrado` y la evidencia sigue vinculada     |
| EVC-13 | La baja conserva el archivo, excluye del contador y mantiene la evidencia en la lista |
| EVC-14 | Una evidencia inactiva no se edita (`EVIDENCE_INACTIVE`), pero se descarga          |
| EVC-15 | Quitar el único contenido restante falla con `EVIDENCE_EMPTY`                       |
| EVC-16 | Si falla la transacción no queda fila ni archivo en disco                           |
| EVC-17 | Dos subidas simultáneas no superan 3 archivos activos                               |
| EVC-18 | Tras cambiar de docente, el nuevo accede y actualiza la nota sin duplicarla, y el anterior recibe 403 |
| EVC-19 | La ficha devuelve `calificacionCompetenciaId`, `totalEvidencias` y `bimestre.publicado` |
| EVC-20 | Regresión: `POST /evidencias-pedagogicas` responde 201 y audita                     |

Suite `publicacion-libretas`:

| ID     | Caso                                                                                      |
| ------ | ----------------------------------------------------------------------------------------- |
| PUB-01 | El docente recibe 403 al publicar y al consultar el estado                                |
| PUB-02 | Con pendientes responde `PUBLICATION_INCOMPLETE` y no crea publicación ni evento          |
| PUB-03 | El estado separa `sinNota` de `sinEvidencia`, pagina y no expone nombres de alumnos       |
| PUB-04 | Una evidencia inactiva no cuenta como completa                                            |
| PUB-05 | Una matrícula o competencia inactiva no se exige                                          |
| PUB-06 | Sección completa: publica (201), su Libreta muestra notas y repetir devuelve `yaPublicado` |
| PUB-07 | Una sección con pendientes no impide publicar otra sección completa del mismo bimestre    |
| PUB-08 | Los alumnos de la sección sin publicar no ven notas, aunque otra sección ya se publicó    |
| PUB-09 | Una sección de otro año académico responde `INVALID_TERM_CONTEXT`                         |
| PUB-10 | Antes de publicar, el docente cambia nota y evidencia varias veces                        |
| PUB-11 | Tras publicar, las tres rutas de docente responden `TERM_PUBLISHED` y nada cambia         |
| PUB-12 | El mismo docente sigue calificando en otra sección sin publicar                           |
| PUB-13 | Tras publicar, `PUT` y `DELETE` del administrador sin motivo responden 400                |
| PUB-14 | Con motivo, la corrección se aplica y `detalle.motivo` queda en la auditoría              |
| PUB-15 | Antes de publicar, el administrador corrige sin motivo                                    |
| PUB-16 | Publicar y dar de baja a la vez nunca deja publicada una sección incompleta               |
| PUB-17 | Dos publicaciones simultáneas de la misma sección dejan una sola fila                     |
| PUB-18 | La migración crea una publicación por sección a partir de un `NOTA_PUBLICADA` antiguo     |
| PUB-19 | La masiva publica solo las secciones listas y detalla las omitidas con su razón           |
| PUB-20 | La masiva publica solo los `seccionIds` enviados, aunque haya otra sección lista          |
| PUB-21 | La masiva crea un evento por sección y repetirla no duplica nada                          |
| PUB-22 | La masiva rechaza lista vacía, ids repetidos y campo extra (400), y al docente (403)      |
| PUB-23 | Un curso sin regla vigente aparece con `sinRegla: true` y bloquea solo sus secciones      |
| PUB-24 | Reasignar un curso no exige dos veces la misma competencia                                |

**Pruebas existentes que cambian:** `calificaciones-alumno.test.js` y
`calificaciones-permisos.test.js` publican como docente, con la ruta cuyo sentido cambia y sin evidencia, y
CAA-08 modifica una nota después de la publicación de CAA-07. Hay que publicar la sección como
administrador, preparar la evidencia en la configuración de cada suite y mover la publicación después
de los casos que modifican notas.

El frontend no tiene pruebas automatizadas: se verifica en el navegador el recorrido completo de
calificar, registrar con archivo, descargar, editar, dar de baja, revisar pendientes, publicar una
sección como administrador y consultarla como docente.

**Antes de integrar:** `npm run format:check`, `npm run lint`, `npm test`.

## 9. Límites conocidos

- **Un pendiente detiene su sección:** una sola evidencia faltante impide publicar las libretas de ese
  salón, no las de los demás.
- **Curso sin regla vigente:** las reglas son por grado y curso, así que detiene a todas las secciones
  de ese grado que lleven el curso, hasta que el administrador la defina.
- **Libretas en fechas distintas:** dos salones del mismo grado pueden recibir la libreta en días
  diferentes.
- **Sin marcha atrás:** publicar una sección no se puede deshacer.
- **Matrícula tardía:** un alumno matriculado en una sección ya publicada no se puede calificar en ese
  bimestre, porque el docente está bloqueado y el administrador corrige notas, pero no las crea.
- **Publicaciones anteriores:** las secciones migradas quedan publicadas aunque no tengan evidencia.
- **Correcciones sin pantalla:** el administrador corrige por API.
- **Archivos huérfanos:** si el proceso cae entre los pasos 2 y 3 de la escritura, queda un archivo
  sin fila. No se borra solo.
- **Respaldo:** `EVIDENCIAS_DIR` no entra en un respaldo de PostgreSQL y hay que respaldarla aparte.
- **Sin antivirus:** se valida el tipo, no el contenido.

## 10. Fuera de alcance

Entidad `Evaluacion`, acceso de alumno y apoderado a la evidencia, pantalla de administrador para
consultar evidencia o corregir notas, despublicación, publicación por curso, reactivación de
evidencias, revisión o validación de evidencias, y cambios en `EvidenciaPedagogica` más allá de §7.
