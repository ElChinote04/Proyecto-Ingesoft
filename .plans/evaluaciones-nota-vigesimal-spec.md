# Evaluaciones con nota 0–20 y letra calculada

Estado: especificación, sin implementar. Rama: `rama/moduloGestionAcademica`.

## 1. Problema

En la pantalla **Calificaciones → Calificar a {alumno}** el docente elige a mano la letra
(AD, A, B o C) de cada competencia y, aparte, sube «Evidencias» que la sustentan. Lo que se
quiere es otra cosa:

- El docente registra **evaluaciones** (práctica, examen…) y pone a cada alumno una **nota de
  0 a 20** con su examen corregido adjunto.
- El sistema **calcula la letra** del bimestre: promedio ponderado de las notas, redondeado y
  convertido con una **escala única** que configura el administrador.
- La libreta sigue mostrando solo letras. La letra **anual** se sigue calculando con las
  reglas de consolidación por curso que ya existen.

La palabra «Evidencias» desaparece de esta pantalla: el examen corregido de cada alumno es el
sustento de su nota y reemplaza a la evidencia de calificación (US-019).

## 2. Decisiones de la entrevista

| Tema | Decisión |
| --- | --- |
| Escala | **Una sola** para todo el colegio. El administrador fija la nota mínima de AD, A y B (enteros, AD > A > B > 0, máximo 20); C cubre desde 0. |
| Escala inicial | La migración crea AD ≥ 18, A ≥ 14, B ≥ 11. Nunca falta escala. |
| Cambio de escala | Se recalculan las letras de los bimestres **no publicados**; lo publicado conserva su letra. |
| Promedio | Ponderado por `peso`. |
| Peso | Entero de 1 a 5, por defecto 1. |
| Redondeo | Al entero, medio hacia arriba (17,5 → 18), y luego se convierte. |
| Ajuste manual | No. La letra siempre es calculada; para cambiarla se corrige una nota. |
| Evaluación | Se define **una vez para el salón** (nombre, competencia, fecha, peso) en una lista aparte. |
| Lista del salón | Crear, editar nombre/fecha/peso, cambiar la competencia (solo sin resultados), ver avance, eliminar con aviso. |
| Resultado por alumno | Se registra en el modal del alumno, **fila por fila**: Nota (0–20 con 1 a 3 archivos obligatorios), **No rindió** (cuenta 0, sin archivo) o **Justificada** (no cuenta, motivo escrito obligatorio). |
| Hueco | Una evaluación sin resultado para un alumno queda **pendiente**: el promedio provisional la ignora y la libreta no se publica. |
| Todo justificado | La competencia queda sin letra y bloquea la publicación hasta que se registre una nota (p. ej. de recuperación). |
| Modal | Muestra por competencia «Promedio 16,33 → A». |
| Reglas de consolidación | Se mantienen **solo para la letra anual** y del área. Ya no se exigen para calificar; sí para publicar. |
| Mínimo de la regla | `minimoEvidencias` pasa a ser el **mínimo de notas** que cuentan por alumno y competencia para publicar. |
| Evidencia de calificación | Se elimina (modelo, API, pantalla). |
| Archivo de la evaluación | No hay archivo compartido (hoja en blanco). Se elimina `ArchivoEvaluacion`. |
| Familia | Solo ve la libreta publicada. Notas 0–20 y exámenes son internos. |
| Datos existentes | Las letras de libretas publicadas se conservan. Lo no publicado se borra. |
| Escala, ubicación | Tarjeta «Escala de calificación» arriba de las reglas, en Gestión académica → Competencias y reglas. |

## 3. Reglas de negocio

### 3.1 Resultado de un alumno en una evaluación

Cada alumno matriculado y activo en la sección tiene, por evaluación, **a lo más un resultado
activo**, con una de tres condiciones:

| Condición | Nota | Archivos | Motivo | En el promedio |
| --- | --- | --- | --- | --- |
| `CALIFICADA` | 0–20, 2 decimales | 1 a 3, obligatorios | — | Cuenta con su nota |
| `NO_RINDIO` | — (cuenta 0) | ninguno | — | Cuenta como 0 |
| `JUSTIFICADA` | — | ninguno | obligatorio, hasta 300 caracteres | No cuenta |

Sin resultado = **pendiente**. Un alumno que se matricula a mitad de bimestre ve las
evaluaciones anteriores como pendientes; el docente las marca como justificadas («Matrícula
posterior»).

Pasar de `CALIFICADA` a otra condición da de baja sus archivos. El comentario opcional que ya
tenía `ResultadoEvaluacion` se conserva para `CALIFICADA` y `NO_RINDIO`.

### 3.2 Cálculo de la letra (dominio puro, `domain/notaVigesimal.js`)

```
cuentan   = resultados activos con condición CALIFICADA o NO_RINDIO
promedio  = Σ(nota × peso) / Σ(peso)      // NO_RINDIO aporta nota 0
redondeo  = Math.floor(promedio + 0.5)    // sobre el promedio con 2 decimales
letra     = AD si redondeo ≥ minAD, A si ≥ minA, B si ≥ minB, si no C
```

- Sin resultados que cuenten → promedio y letra `null`.
- El promedio se calcula en decimales exactos (Prisma `Decimal`), no en coma flotante, y se
  guarda con 2 decimales. El redondeo se aplica sobre ese valor ya fijado a 2 decimales, para
  que lo que ve el docente («17,50») y la letra no se contradigan.
- Las pendientes no cuentan en el promedio provisional; se informan aparte («falta 1»).

### 3.3 Dónde vive la letra

`CalificacionCompetencia.nivelLogro` sigue siendo la letra guardada; se le añade `promedio`.
Se recalculan **dentro de la misma transacción** que cambia algo que las afecta:

| Cambio | Se recalcula |
| --- | --- |
| Registrar, cambiar o dar de baja un resultado | El alumno en esa competencia y bimestre |
| Cambiar el peso de una evaluación, o eliminarla | Todos los alumnos de la sección en esa competencia y bimestre |
| Cambiar la competencia de una evaluación | No aplica: solo se permite sin resultados |
| Cambiar la escala | Todas las letras de bimestres no publicados |

Se guarda y no se deriva al consultar porque la libreta, la publicación y US-020 ya leen
`nivelLogro`, y porque lo publicado debe quedar congelado aunque la escala cambie. Si el
recálculo deja la competencia sin letra, `nivelLogro` y `promedio` quedan en `null` (hoy
`nivelLogro` es obligatorio: pasa a ser opcional).

La escala vigente se lee con `FOR SHARE` en cada recálculo y se modifica con `FOR UPDATE`, para
que un cambio de escala y una nota concurrentes no dejen una letra calculada con la escala
vieja. El recálculo de un alumno bloquea su fila `Calificacion` (`FOR UPDATE`, tras el upsert)
antes de leer sus resultados: dos guardados simultáneos del mismo alumno no se pisan.

### 3.4 Publicación de la libreta

`evaluarSeccion` deja de contar evidencias. Para cada alumno × competencia de cada curso de la
sección, el pendiente pasa a ser:

| Pendiente | Cuándo |
| --- | --- |
| `sinEvaluaciones` | La competencia no tiene ninguna evaluación en el bimestre |
| `resultadosPendientes` | Hay evaluaciones sin resultado para el alumno |
| `sinLetra` | Todos sus resultados están justificados |
| `bajoMinimo` | Cuentan menos notas que `minimoNotas` de la regla vigente |
| `sinRegla` | El curso no tiene regla vigente para el grado (hoy existe pero solo se informa dentro de otro pendiente: pasa a bloquear por sí mismo) |

Al publicar, `Calificacion.reglaId` se fija con la regla vigente del curso en ese momento. Así la
libreta anual sigue usando «la regla que calificó el último bimestre», y `reglaId` pasa a ser
opcional mientras el bimestre no esté publicado.

La publicación sigue congelando: con la sección publicada no se crean, editan ni eliminan
evaluaciones ni resultados (`exigirSeccionSinPublicar`, 409 como hoy).

### 3.5 Evaluaciones

- Pertenecen a una clase (curso + sección) y bimestre; las gestiona el **docente vigente** de la
  clase, igual que el plan de trabajo (`contarAsignacionesVigentes`). `asignacionId` guarda la
  asignación con la que se creó.
- `fecha` dentro de las fechas del bimestre (400 `INVALID_EVALUATION_DATE`). Sin fechas, 409
  `TERM_WITHOUT_DATES`, como en el plan.
- La competencia debe ser activa y del curso (la FK compuesta ya lo garantiza).
- Cambiar la competencia con resultados activos → 409 `EVALUATION_HAS_RESULTS`.
- Eliminar es baja lógica de la evaluación, sus resultados y sus archivos, con recálculo de la
  competencia para toda la sección. Se audita con `contexto.resultadosDesactivados`.
- Se elimina el estado `BORRADOR / REGISTRADA`: una evaluación cuenta desde que existe, y las
  pendientes ya bloquean la publicación.

### 3.6 Escala

- Una sola fila vigente. Cada cambio crea una versión nueva (`version` + 1) y cierra la anterior
  (`vigenteHasta`), para poder explicar después con qué escala se calculó una letra.
- Validación: enteros, `20 ≥ minAD > minA > minB > 0`. 400 `INVALID_SCALE` con detalle por
  campo.
- Solo el administrador. Se audita `ESCALA_CALIFICACION_MODIFICADA` con anterior, nueva y
  `contexto.letrasRecalculadas` (cuántas cambiaron).
- No hay un índice que impida dos versiones vigentes por sí solo: se crea un índice único
  parcial `EscalaCalificacion_vigente_unica ON ((true)) WHERE "vigenteHasta" IS NULL`.

## 4. Modelo de datos

### 4.1 Cambios en `schema.prisma`

```prisma
enum CondicionResultado {
  CALIFICADA
  NO_RINDIO
  JUSTIFICADA
}

model EscalaCalificacion {
  id              Int       @id @default(autoincrement())
  version         Int       @unique
  minimoAD        Int
  minimoA         Int
  minimoB         Int
  vigenteDesde    DateTime  @default(now())
  vigenteHasta    DateTime?
  creadoPorId     Int?      // null en la escala inicial que crea la migración
  creadoEn        DateTime  @default(now())
}

model Evaluacion {
  // ... igual, salvo:
  peso            Int       @default(1)          // antes Decimal(5,2)
  // se elimina: estado, archivos
}

model ResultadoEvaluacion {
  // ... igual, salvo:
  condicion       CondicionResultado
  nota            Decimal?  @db.Decimal(4, 2)    // antes obligatoria
  motivo          String?   @db.VarChar(300)
  archivos        ArchivoResultadoEvaluacion[]
}

model ArchivoResultadoEvaluacion {
  id               Int                 @id @default(autoincrement())
  resultadoId      Int
  resultado        ResultadoEvaluacion @relation(fields: [resultadoId], references: [id])
  nombreOriginal   String
  nombreAlmacenado String              @unique
  tipoMime         String
  tamanoBytes      Int
  activo           Boolean             @default(true)
  creadoPorId      Int
  creadoEn         DateTime            @default(now())

  @@index([resultadoId, activo])
}

model CalificacionCompetencia {
  // ... igual, salvo:
  nivelLogro      NivelLogro?                    // antes obligatorio
  promedio        Decimal?  @db.Decimal(4, 2)
  // se elimina: evidencias
}

model Calificacion {
  reglaId         Int?                           // se fija al publicar
}

model ReglaConsolidacion {
  // `metodo` (JSON) cambia la clave minimoEvidencias → minimoNotas; la estrategia y el
  // desempate solo se usan para lo anual.
}
```

Se eliminan `EvidenciaCalificacion`, `ArchivoEvidenciaCalificacion`, `ArchivoEvaluacion` y el
enum `EstadoEvaluacion`.

### 4.2 Restricciones SQL (en la migración, Prisma no las modela)

| Nombre | Regla |
| --- | --- |
| `ResultadoEvaluacion_condicion_nota` | `CALIFICADA` ⇔ `nota IS NOT NULL` |
| `ResultadoEvaluacion_condicion_motivo` | `JUSTIFICADA` ⇔ `motivo` no vacío |
| `ResultadoEvaluacion_nota_rango` | Se mantiene: 0 ≤ nota ≤ 20 |
| `ResultadoEvaluacion_activo_unico` | Se mantiene: un resultado activo por alumno y evaluación |
| `Evaluacion_peso_rango` | Reemplaza `Evaluacion_peso_positivo`: 1 ≤ peso ≤ 5 |
| `EscalaCalificacion_orden` | `20 >= minimoAD > minimoA > minimoB > 0` |
| `EscalaCalificacion_vigente_unica` | Índice único parcial, una sola vigente |
| `CalificacionCompetencia_promedio_letra` | `promedio IS NULL OR nivelLogro IS NOT NULL`: con promedio siempre hay letra; una letra sin promedio solo existe en filas heredadas publicadas (ver 4.3) |

El mínimo de 1 archivo por resultado `CALIFICADA` no se puede expresar con un CHECK (depende de
otra tabla); lo garantiza el service dentro de la transacción y una prueba lo cubre.

### 4.3 Migración `20261122120000_evaluaciones_nota_vigesimal`

1. Crear `EscalaCalificacion` e insertar la versión 1 (18 / 14 / 11).
2. Borrar lo **no publicado**: `CalificacionCompetencia` (y su `Calificacion` si queda vacía) de
   secciones × bimestres sin `PublicacionSeccion`, junto con sus evidencias.
3. Lo publicado conserva `nivelLogro` con `promedio = NULL`. Por eso el CHECK de promedio y
   letra admite «letra sin promedio» (filas heredadas).
4. Eliminar las tablas de evidencia de calificación. **Los archivos en disco no se borran**: se
   listan en el CHANGELOG para limpieza manual (la migración no toca el sistema de archivos).
5. `Evaluacion`: `peso` a entero, quitar `estado`; `ResultadoEvaluacion`: añadir `condicion`
   (sin filas: la tabla no tiene API todavía), `motivo`, `nota` opcional; crear
   `ArchivoResultadoEvaluacion`; eliminar `ArchivoEvaluacion` y `EstadoEvaluacion`.
6. `ReglaConsolidacion.metodo`: reescribir `minimoEvidencias` como `minimoNotas` en el JSON.
7. `Calificacion.reglaId` y `CalificacionCompetencia.nivelLogro` pasan a opcionales.
8. `setval` de las secuencias nuevas por encima del mayor `entidadId` auditado con esa entidad,
   como en la migración del plan.

Generar el SQL con `prisma migrate diff` contra una base auxiliar (el `migrate dev` no es
interactivo aquí) y añadir a mano los pasos de datos y las restricciones. Probar la migración
con datos: una sección publicada y otra no.

## 5. API

Base `/api/v1`. Respuestas `{ data }`; errores con `AppError`. Todos los esquemas `.strict()`.

### 5.1 Escala

| Método y ruta | Rol | Cuerpo / respuesta |
| --- | --- | --- |
| `GET /escala-calificacion` | Docente, administrador | `{ version, minimoAD, minimoA, minimoB, vigenteDesde }` |
| `PUT /escala-calificacion` | Administrador | `{ minimoAD, minimoA, minimoB }` → la nueva escala y `letrasRecalculadas` |

`PUT` sin `:id` porque es un recurso único; reemplaza la escala completa.

### 5.2 Evaluaciones del salón

| Método y ruta | Hace |
| --- | --- |
| `GET /evaluaciones?seccionId&bimestreId[&cursoId]` | Lista del salón: `{ id, curso, competencia, titulo, fecha, peso, avance: { registrados, total } }`. Solo cursos que el docente dicta hoy en la sección. |
| `POST /evaluaciones` | `{ cursoId, seccionId, bimestreId, competenciaId, titulo, descripcion?, fecha, peso? }`. El servidor resuelve la asignación vigente. |
| `PATCH /evaluaciones/:id` | `titulo`, `descripcion`, `fecha`, `peso`, `competenciaId` (409 `EVALUATION_HAS_RESULTS` si tiene resultados) |
| `DELETE /evaluaciones/:id` | Baja con sus resultados; 204 |
| `GET /evaluaciones/:id/pendientes` | Alumnos sin resultado (para «quiénes faltan» en la lista) |

### 5.3 Resultados (desde el modal del alumno)

| Método y ruta | Hace |
| --- | --- |
| `GET /matriculas/:id/calificaciones?bimestreId` | **Se reemplaza su contenido**: por curso y competencia, la lista de evaluaciones con el resultado del alumno, `promedio`, `nivelLogro` y `pendientes`. Mantiene `bimestre.publicado`. |
| `PUT /evaluaciones/:id/resultados/:matriculaId` | Multipart: `condicion`, `nota?`, `motivo?`, `comentario?`, `archivos` (0 a 3 nuevos), `archivosQuitados?` (ids). Crea o reemplaza el resultado. Devuelve el resultado y la competencia recalculada (`promedio`, `nivelLogro`). |
| `DELETE /evaluaciones/:id/resultados/:matriculaId` | Lo deja pendiente otra vez; 204 |
| `GET /evaluaciones/:id/resultados/:matriculaId/archivos/:archivoId` | Descarga, docente vigente y administrador |

`PUT` con los dos identificadores en la ruta porque el par (evaluación, alumno) identifica el
recurso y la operación es idempotente. Se eliminan `PUT /matriculas/:id/calificaciones` (la
letra ya no se envía) y todas las rutas de `evidencias-calificacion`.

Validaciones del `PUT` de resultado, en este orden:

| Caso | Respuesta |
| --- | --- |
| `CALIFICADA` sin nota, o con nota fuera de 0–20 o con más de 2 decimales | 400 `INVALID_GRADE` |
| `CALIFICADA` que terminaría con 0 archivos activos | 400 `FILE_REQUIRED` |
| `NO_RINDIO` o `JUSTIFICADA` con nota o archivos | 400 `VALIDATION_ERROR` |
| `JUSTIFICADA` sin motivo | 400 `REASON_REQUIRED` |
| Más de 3 archivos activos | 400 `TOO_MANY_FILES` |
| Alumno no matriculado activo en la sección de la evaluación | 400 `INVALID_ENROLLMENT_CONTEXT` |
| No es docente vigente de la clase | 403 |
| Sección publicada | 409 (el código actual de `exigirSeccionSinPublicar`) |

Los archivos siguen el patrón del plan: se escriben en disco primero, luego la transacción
(bloqueando la fila del resultado `FOR UPDATE` para el cupo), y si falla se borran.

### 5.4 Auditoría

Nuevos en `EVENTOS_CRITICOS`: `ESCALA_CALIFICACION_MODIFICADA`, `EVALUACION_CREADA`,
`EVALUACION_MODIFICADA`, `EVALUACION_DADA_DE_BAJA`, `RESULTADO_EVALUACION_REGISTRADO`,
`RESULTADO_EVALUACION_MODIFICADO`, `RESULTADO_EVALUACION_DADO_DE_BAJA`. Cada evento de resultado
lleva en `contexto` la letra anterior y la nueva de la competencia, para poder explicar un cambio
de letra sin reconstruirlo. Se retiran los eventos de evidencia de calificación de la lista (los
registros históricos quedan).

## 6. Frontend

### 6.1 Calificaciones (docente)

Encima de la tabla de estudiantes, junto al selector de salón: selector de bimestre y botón
**Evaluaciones del bimestre**, que abre la lista del salón.

```
Evaluaciones · 3.° B · I Bimestre                    [+ Nueva evaluación]

Matemática
  MATC · Razonamiento lógico
    Práctica 1   12/03  peso 1   18 de 20 registrados  [Ver faltan] [Editar] [Eliminar]
    Examen       28/03  peso 2   20 de 20 registrados             [Editar] [Eliminar]
  REGLA-3 · aaa
    (sin evaluaciones)  ← bloquea la publicación
```

- **Nueva evaluación / Editar**: curso, competencia (deshabilitada al editar si tiene
  resultados, con la razón), título, fecha (limitada al bimestre), peso 1–5.
- **Eliminar**: «Práctica 1 tiene 18 resultados; dejarán de contar en el promedio. ¿Eliminar?».
- **Ver faltan**: nombres de los alumnos sin resultado.

### 6.2 Modal «Calificar a {alumno}»

Desaparecen los radios AD/A/B/C, el botón «Evidencias (n)» y «Guardar calificaciones». Por
competencia:

```
MATC · Razonamiento lógico
  Práctica 1 · 12/03 · peso 1   15,00   practica1-william.pdf     [Editar]
  Examen · 28/03 · peso 2       ( ) Nota [ 17 ] [Subir examen]
                                ( ) No rindió · cuenta 0
                                ( ) Justificada · no cuenta  Motivo [        ]
                                                               [Cancelar] [Guardar]
  Práctica 2 · 04/04 · peso 1   Pendiente                       [Registrar]
  Promedio 16,33 → A   · falta 1
```

- Una fila en edición a la vez; cambiar de bimestre o cerrar con una fila sin guardar pide
  confirmación.
- Al guardar se actualizan el promedio y la letra con la respuesta del servidor (no se calculan
  en el cliente, para que nunca difieran).
- Sin evaluaciones: «Todavía no hay evaluaciones de esta competencia. Créalas en Evaluaciones
  del bimestre».
- Con la libreta publicada: todo en solo lectura, como hoy.
- El aviso «Curso sin regla vigente» se quita de esta pantalla.
- Reutiliza `CampoArchivos` y `utils/archivosAdjuntos.js` del plan de trabajo.

### 6.3 Competencias y reglas (administrador)

- Tarjeta **Escala de calificación** arriba: tres campos (mínimo de AD, A y B), los rangos
  resultantes en texto, una vista previa («17,5 → 18 → AD») y **Guardar escala**. Al guardar
  avisa: «Se recalcularán las letras de los bimestres no publicados».
- En el formulario de regla, «Mínimo de evidencias» pasa a **Mínimo de notas por competencia**,
  y una línea aclara que la estrategia y el desempate solo se usan para la letra anual.

### 6.4 Publicación de libretas

`PublicacionLibretas.jsx` muestra los pendientes nuevos de 3.4 por curso y docente («Matemática
· 2 alumnos con resultados pendientes · 1 competencia sin evaluaciones · falta regla»).

### 6.5 Lo que se elimina

`EvidenciasCompetencia.jsx` y sus estilos; el texto «Evidencias» en `CalificarAlumno.jsx` y en
los mensajes de `publicacionSeccion.service.js`.

## 7. Pruebas

Suite nueva `tests/evaluaciones.test.js` (registrada en `scripts/test.js`); se elimina
`evidencias-calificacion.test.js` y se adaptan `calificaciones-alumno`, `publicacion-libretas`,
`libretas` y `auditoria`.

| Id | Caso |
| --- | --- |
| EVA-01 | Dominio: ponderado, `NO_RINDIO` = 0, justificadas fuera, 17,495 → 17,50 → 18 → AD, 17,49 → 17 → A, sin resultados → null |
| EVA-02 | Crear evaluación: camino correcto; fecha fuera del bimestre, peso 0 y 6, competencia de otro curso, docente no vigente |
| EVA-03 | Registrar nota con archivo recalcula promedio y letra; sin archivo → `FILE_REQUIRED`; nota 20,01 y 15,555 → 400 |
| EVA-04 | `NO_RINDIO` cuenta 0; `JUSTIFICADA` sin motivo → 400; con motivo no cuenta; pasar de `CALIFICADA` a `JUSTIFICADA` da de baja los archivos |
| EVA-05 | Cambiar el peso recalcula a toda la sección; cambiar la competencia con resultados → 409 |
| EVA-06 | Eliminar una evaluación con resultados los da de baja y recalcula; queda auditado con el conteo |
| EVA-07 | Cambiar la escala recalcula lo no publicado y deja intacto lo publicado; escala inválida → 400 |
| EVA-08 | Publicación bloqueada por cada pendiente de 3.4 por separado; con todo resuelto publica y fija `reglaId` |
| EVA-09 | Sección publicada: crear, editar, eliminar y registrar → 409 |
| EVA-10 | Concurrencia: dos `PUT` simultáneos de resultados del mismo alumno dejan el promedio de ambos; escala y nota simultáneas no dejan letra con la escala vieja (sin `sleep`, con `Promise.all`) |
| EVA-11 | Fallo a mitad de transacción (trigger que falla) no deja archivos en disco ni resultado |
| EVA-12 | Restricciones SQL: cada CHECK de 4.2 rechaza su caso (SQLSTATE 23514 + nombre) y el índice de escala vigente rechaza una segunda |
| EVA-13 | La familia no ve notas 0–20 ni archivos de resultados (403/404); la libreta anual sigue usando la regla del curso |
| EVA-14 | Migración: con una sección publicada y otra no, conserva lo publicado y borra lo demás |

## 8. Seed

- Escala por defecto (la crea la migración; el seed no la toca).
- Para 3.° B, I bimestre de Matemática: dos evaluaciones por competencia con resultados de
  todos los alumnos (archivo PDF de muestra), una `NO_RINDIO` y una `JUSTIFICADA`, para que el
  modal muestre los tres casos. Otra sección queda con pendientes para ver el bloqueo de
  publicación.
- `minimoNotas: 2` en las reglas del seed.

## 9. Documentación

- `docs/API.md`: secciones de escala, evaluaciones y resultados; se retira la de evidencia de
  calificación.
- `CLAUDE.md`: «Tres conceptos que no se mezclan» pasa a: evaluación (nota 0–20 con examen
  corregido, base de la letra), evidencia pedagógica (actividad del plan) y la letra calculada
  con la escala única. Nota sobre por qué la letra se guarda y no se deriva (3.3).
- `CHANGELOG.md`, y `docs/PRUEBAS_CALIFICACIONES.md` con el recorrido en el navegador.

## 10. Orden de implementación

1. Dominio `notaVigesimal.js` y su prueba.
2. Migración y esquema; probar la migración con datos.
3. Escala (repo, service, rutas) y su tarjeta.
4. Evaluaciones del salón (API y lista).
5. Resultados y recálculo (API y modal).
6. Publicación y reglas (`minimoNotas`, `sinRegla`, `reglaId` al publicar).
7. Eliminar evidencia de calificación (backend, frontend, pruebas).
8. Seed, documentación, `npm test`, `npm run lint`, recorrido en el navegador.

## 11. Riesgos y notas

- **Se pierden las evidencias de libretas ya publicadas.** Las letras publicadas se conservan,
  pero sus archivos de evidencia dejan de estar accesibles desde SAGE. Si hace falta
  conservarlos, hay que exportarlos antes de migrar.
- **US-019 cambia de significado.** El sustento de la nota pasa a ser el examen corregido en el
  resultado. Conviene avisar a quien lleve la trazabilidad de historias de usuario.
- **Justificaciones de inasistencia** (pendiente del proyecto): hoy la justificación es un motivo
  escrito por el docente. Cuando exista ese módulo, `JUSTIFICADA` podría enlazar a la
  justificación aprobada; queda fuera de este cambio.
- **Colisión con otras parejas**: `PublicacionLibretas`, `libretas` y la consulta US-020 leen
  `nivelLogro`. Que pase a opcional obliga a revisar esas lecturas (se cubre en EVA-08 y EVA-13).
- La rama aún no tiene integrado `main` (26bc6f8); conviene integrarlo antes de esta migración
  para no resolver conflictos de esquema después.
