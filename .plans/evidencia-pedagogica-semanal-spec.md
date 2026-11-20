# Evidencia pedagógica como actividad semanal del plan de trabajo

Rama: `rama/moduloGestionAcademica` (después de `83d56f3`, ya en origin).
Alcance: modelo, migración, backend y pruebas. **Fuera de alcance:** cálculo de
evaluaciones y cierre bimestral, y la pantalla final.

## Regla del dominio

La evidencia pedagógica es una **actividad del plan de trabajo del docente**, ubicada en
una semana del bimestre (Semana 1: exposición; Semana 2: ejercicios y un video…). No es
una nota ni la sustenta: no tiene alumno, competencia ni nivel. Se planifica por
adelantado y, cuando ocurre, se marca como realizada y se le adjunta el material. La
coordinación (administrador) puede revisarla.

Hay tres conceptos que no deben mezclarse:

| Concepto             | Modelo                               | Para qué                                                     |
| -------------------- | ------------------------------------ | ------------------------------------------------------------ |
| Evidencia pedagógica | `EvidenciaPedagogica` (este cambio)  | Actividad semanal del plan del docente                       |
| Evaluación continua  | `Evaluacion` / `ResultadoEvaluacion` | Nota 0–20 por alumno y competencia                           |
| Sustento de la nota  | `EvidenciaCalificacion` (US-019)     | Respaldo de la nota por competencia; la publicación lo exige |

## Qué choca hoy con esta separación

1. **La entidad ya no existe.** `83d56f3` borró `EvidenciaPedagogica` (migración
   `20261119120000_evaluacion_continua`, ya publicada), y el CHANGELOG dice que se
   «reemplaza» por `Evaluacion`. Esa lectura es la contraria a la regla nueva: hay que
   recrearla con una migración nueva y corregir la entrada del CHANGELOG y
   `.plans/evaluacion-continua-modelo-spec.md`.
2. **El término «evidencia pedagógica» ya está ocupado por US-019.** CLAUDE.md
   («la evidencia pedagógica de las notas (US-019)»), el CHANGELOG, `docs/API.md` §
   «Evidencia pedagógica de la calificación» y `.plans/evidencia-calificacion-spec.md`
   llaman así a `EvidenciaCalificacion`. En la documentación, eso pasa a llamarse
   «evidencia de calificación».
3. **El modal de calificar del frontend dice «Evidencia»** (`EvidenciasCompetencia.jsx`)
   refiriéndose al sustento de la nota. No se toca ahora, pero la pantalla final
   tendrá que diferenciar los dos términos.
4. **Habrá tres tipos de archivo «de evidencia»:** `ArchivoEvidenciaCalificacion`,
   `ArchivoEvaluacion` (que el paso anterior planeó para reemplazar al primero) y
   `ArchivoEvidenciaPedagogica`. Queda pendiente decidir el destino de los dos
   primeros cuando se haga la consolidación.
5. **No se puede planificar por adelantado.** `crearPlan` fija `fechaInicio = ahora`
   y exige que hoy caiga dentro del bimestre.
6. **El dueño del plan es el autor, no el docente vigente.** `canManage` compara con
   `asignacion.docenteId`: tras una reasignación, el docente anterior sigue editando y
   el nuevo no puede.
7. **Nada impide tener varios planes activos para la misma clase y bimestre.**
8. **Contrato REST:** hay dos POST para el mismo recurso con el rol en la ruta
   (`/planes-academicos` y `/planes-academicos/docente`); `PUT /:id` hace un cambio
   parcial y no tiene `requireRole`.
9. **Fuga de datos:** `GET /planes-academicos` devuelve a cualquier sesión, incluido
   alumno y apoderado, todos los planes con entidades anidadas completas (persona del
   docente con DNI).
10. **La versión borrada de la evidencia** aceptaba `docenteId` del cliente, dejaba
    revisar a cualquier docente y guardaba en `archivos` nombres de texto sin subir nada.
11. **Prisma fuera de `repositories/`:** `planAcademicoService.validateContext` usa
    `db.bimestreAcademico`, `db.cursoSeccionDocente` y `db.competencia`.
12. **Auditoría:** `auditPlanAcademico` ya se corrigió en `83d56f3` (AUD-10). Queda
    un riesgo nuevo: al recrear la tabla, su secuencia vuelve a 1, y los `entidadId`
    nuevos se mezclarían con los registros históricos de `entidad = 'EvidenciaPedagogica'`.
    Además, los eventos antiguos `EVIDENCIA_*` se confunden con `EVIDENCIA_CALIFICACION_*`.
13. **Guardado en dos llamadas:** el patrón del frontend de evidencias de calificación
    (PATCH de los datos y luego POST de los archivos) puede dejar actualizaciones a
    medias. La nueva API recibe los datos y los archivos en una sola petición.
14. **`recibirArchivos` admite como máximo 5 campos multipart**; una actividad envía más.

## Modelo (`backend/prisma/schema.prisma`)

```prisma
enum TipoActividadPedagogica {
  EXPOSICION
  EJERCICIO
  VIDEO
  AVANCE_PLAN
  OTRO
}

enum EstadoActividadPedagogica {
  PLANIFICADA
  REALIZADA
}

enum EstadoRevisionEvidencia {
  PENDIENTE_REVISION
  OBSERVADA
  VALIDADA
}

model PlanAcademico {
  // ...campos actuales...
  cursoId    Int
  seccionId  Int
  asignacion CursoSeccionDocente @relation(fields: [asignacionId, cursoId, seccionId], references: [id, cursoId, seccionId])
  curso      Curso   @relation(fields: [cursoId], references: [id])
  seccion    Seccion @relation(fields: [seccionId], references: [id])
  evidencias EvidenciaPedagogica[]
  // Un plan activo por clase y bimestre: índice único parcial en SQL.
}

model EvidenciaPedagogica {
  id                    Int                        @id @default(autoincrement())
  planId                Int
  plan                  PlanAcademico              @relation(fields: [planId], references: [id])
  numeroSemana          Int
  tipo                  TipoActividadPedagogica
  titulo                String                     @db.VarChar(200)
  descripcion           String?                    @db.VarChar(2000)
  estado                EstadoActividadPedagogica  @default(PLANIFICADA)
  fechaRealizacion      DateTime?                  @db.Date
  enlaces               String[]
  estadoRevision        EstadoRevisionEvidencia    @default(PENDIENTE_REVISION)
  observacionesRevision String?                    @db.VarChar(2000)
  revisorId             Int?
  revisor               Usuario?                   @relation("EvidenciaPedagogicaRevisor", fields: [revisorId], references: [id])
  fechaRevision         DateTime?
  activo                Boolean                    @default(true)
  creadoPorId           Int
  modificadoPorId       Int
  creadoEn              DateTime                   @default(now())
  modificadoEn          DateTime                   @updatedAt
  archivos              ArchivoEvidenciaPedagogica[]

  @@index([planId, numeroSemana, activo])
}

model ArchivoEvidenciaPedagogica {
  // Misma forma que ArchivoEvidenciaCalificacion, con FK a EvidenciaPedagogica.
  @@index([evidenciaId, activo])
}
```

Se añaden las relaciones inversas en `Curso`, `Seccion` (`planes`) y en `Usuario`
(`evidenciasPedagogicasRevisadas`). No hay `docenteId` en la actividad: el dueño se
obtiene del plan (docente vigente) y el autor queda en `creadoPorId` y en la auditoría.

## Migración nueva (`2026112xxxxxxx_evidencia_pedagogica_semanal`)

No se edita `20261119120000`, porque ya está publicada. Pasos, generados con
`migrate diff` y completados a mano:

1. `PlanAcademico`: añadir `cursoId` y `seccionId` como columnas nulables, rellenarlas
   desde `CursoSeccionDocente` por `asignacionId`, pasarlas a `NOT NULL` y crear la FK
   compuesta `(asignacionId, cursoId, seccionId)`.
2. Planes duplicados: por cada `(cursoId, seccionId, bimestreId)` con varios planes
   activos, conservar el de mayor `modificadoEn` (y luego mayor `id`) y poner
   `activo = false` en los demás. No se borra nada.
3. Crear `CREATE UNIQUE INDEX "PlanAcademico_activo_unico" ON "PlanAcademico"("cursoId",
"seccionId", "bimestreId") WHERE "activo" = true;`
4. Crear los enums y las tablas `EvidenciaPedagogica` y `ArchivoEvidenciaPedagogica`.
5. CHECK de integridad (con un comentario explicativo cada uno):
   - `"numeroSemana" >= 1` (el máximo depende de las fechas del bimestre; lo valida
     el servicio).
   - `("estado" = 'REALIZADA') = ("fechaRealizacion" IS NOT NULL)`.
   - `"estadoRevision" = 'PENDIENTE_REVISION' OR "estado" = 'REALIZADA'` (solo se
     revisa lo realizado).
   - `"estadoRevision" <> 'OBSERVADA' OR "observacionesRevision" IS NOT NULL`.
   - `cardinality("enlaces") <= 5`.
6. Secuencia: `SELECT setval(pg_get_serial_sequence('"EvidenciaPedagogica"', 'id'),
GREATEST(COALESCE((SELECT MAX("entidadId") FROM "RegistroAuditoria" WHERE "entidad" =
'EvidenciaPedagogica'), 0), 1), ...)` para que los ids nuevos no choquen con la
   auditoría histórica.

## Reglas del servicio

Toda escritura va en una transacción: el plan (o la actividad) se bloquea con
`SELECT … FOR UPDATE` desde el repositorio, se aplica el cambio y se escribe la
auditoría en esa misma transacción. Prisma solo se usa en `repositories/`; se mueve
ahí lo que hoy hace `validateContext`.

**Docente vigente.** Puede gestionar el plan y sus actividades el docente que tenga
una asignación activa en `(plan.cursoId, plan.seccionId)`, reutilizando
`contarAsignacionesVigentes` de las evidencias de calificación. El administrador
puede siempre.

**Plan**

- Se puede crear antes del bimestre o durante él, nunca después de `fechaFin`.
- El bimestre debe tener `fechaInicio` y `fechaFin`; si no las tiene, responde
  `409 TERM_WITHOUT_DATES`.
- `fechaInicio` es la del bimestre, salvo que se envíe otra dentro de él.
- Un segundo plan activo para la clase y el bimestre responde `409 PLAN_EXISTS`;
  la garantía real es el índice parcial, que se traduce desde `P2002`.
- Desactivar un plan desactiva sus actividades en la misma transacción.

**Actividad**

- `numeroSemana` va de 1 a `ceil((fechaFin − fechaInicio + 1 día) / 7)` del bimestre
  del plan. Si el bimestre no tiene fechas, `409 TERM_WITHOUT_DATES`.
- Nace `PLANIFICADA`. Pasar a `REALIZADA` fija `fechaRealizacion` = hoy (Lima) en el
  servidor. No hay vuelta a `PLANIFICADA`.
- Bloqueo por fecha: pasada la `fechaFin` del bimestre, el docente no crea, edita ni
  da de baja actividades; el administrador sí, con `motivo` obligatorio que queda en
  la auditoría. Este bloqueo es independiente de la publicación de libretas.
- Una actividad `VALIDADA` ya no la edita el docente; solo el administrador.
- Editar una actividad `OBSERVADA` no cambia su estado de revisión: la vuelve a
  revisar el administrador.
- Revisión: solo el administrador, y solo sobre una actividad `REALIZADA`. `OBSERVADA`
  exige observaciones. Fija `revisorId` y `fechaRevision`.
- Material: hasta 3 archivos PDF/JPG/PNG de 5 MB, validados por contenido
  (`domain/archivoEvidencia.js`), y hasta 5 enlaces `https://`. Los archivos se
  escriben primero en disco y se borran si la transacción falla, igual que en
  `conArchivosEnDisco`. El tope de 3 archivos activos se comprueba con la actividad
  bloqueada para que dos subidas simultáneas no lo superen.
- Ningún identificador de usuario, docente, estado de revisión o fecha de realización
  se acepta del cliente.

**Lectura**

- Administrador: todo, filtrable.
- Docente: solo las clases en las que es docente vigente.
- Alumno/apoderado: solo actividades `REALIZADA` con `estadoRevision ≠ OBSERVADA` de
  los cursos de la sección de sus matrículas visibles, con salida mínima (semana, tipo,
  título, descripción, fecha de realización, enlaces y archivos por nombre original),
  sin datos del docente ni de la revisión. Las matrículas visibles se obtienen con la
  misma regla que usan las libretas.
- Las respuestas no anidan entidades completas: nombres y ids, nunca la persona del
  docente.

## API

Planes:

| Método y ruta                                         | Quién                  | Notas                                         |
| ----------------------------------------------------- | ---------------------- | --------------------------------------------- |
| `GET /planes-academicos?bimestreId&cursoId&seccionId` | admin, docente         | Alumno/apoderado: 403                         |
| `GET /planes-academicos/:id`                          | admin, docente vigente |                                               |
| `POST /planes-academicos`                             | admin, docente vigente | **Una sola ruta**; se retira `/docente`       |
| `PATCH /planes-academicos/:id`                        | admin, docente vigente | Reemplaza al `PUT` parcial; con `requireRole` |
| `DELETE /planes-academicos/:id`                       | admin                  | Desactiva el plan y sus actividades           |

Evidencias pedagógicas:

| Método y ruta                                            | Quién                                                           | Notas                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /evidencias-pedagogicas?planId&numeroSemana&estado` | todos, con alcance                                              | Alumno/apoderado con salida mínima                                                                                          |
| `GET /evidencias-pedagogicas/:id`                        | según el alcance                                                |                                                                                                                             |
| `POST /evidencias-pedagogicas`                           | docente vigente, admin                                          | Multipart: `planId`, `numeroSemana`, `tipo`, `titulo`, `descripcion?`, `enlaces?` (JSON), `archivos[]`                      |
| `PATCH /evidencias-pedagogicas/:id`                      | docente vigente, admin                                          | Multipart; datos, `estado: REALIZADA` y archivos nuevos en **una** petición; `motivo` si es el administrador tras el cierre |
| `PUT /evidencias-pedagogicas/:id/revision`               | admin                                                           | `estadoRevision`, `observacionesRevision`                                                                                   |
| `DELETE /evidencias-pedagogicas/:id`                     | docente vigente (antes del cierre y si no está VALIDADA), admin | Baja lógica                                                                                                                 |
| `GET /evidencias-pedagogicas/:id/archivos/:archivoId`    | según el alcance                                                | Devuelve el nombre original, nunca el almacenado                                                                            |
| `DELETE /evidencias-pedagogicas/:id/archivos/:archivoId` | docente vigente, admin                                          | Baja lógica del archivo                                                                                                     |

Archivos nuevos:

- `routes/evidenciasPedagogicas.js`
- `controllers/evidenciasPedagogicas.controller.js`
- `services/evidenciasPedagogicas.service.js`
- `repositories/evidenciasPedagogicas.repository.js`
- `validators/evidenciasPedagogicas.schemas.js` (todos `.strict()`)

`middleware/archivosEvidencia.js` pasa a exportar una fábrica con el límite de campos
como parámetro (las actividades necesitan unos 8).

Auditoría: entidad `EvidenciaPedagogica`, eventos `EVIDENCIA_PEDAGOGICA_REGISTRADA`,
`_MODIFICADA`, `_REALIZADA`, `_REVISADA` y `_DADA_DE_BAJA`, con valor anterior y
nuevo (incluidos los archivos añadidos y quitados) y el `motivo` cuando lo haya. Los
planes mantienen `PLAN_ACADEMICO_*` con el formato que ya corrigió AUD-10, y se añade
`PLAN_ACADEMICO_DESACTIVADO` con el número de actividades desactivadas.

## Pruebas

Nueva suite `tests/evidencias-pedagogicas.test.js` (EVP-xx), registrada en
`scripts/test.js`, con al menos:

- Crear con archivos y enlaces en una sola petición; descargar devuelve el mismo
  contenido y el nombre original.
- Si falla la transacción, no queda ni fila ni archivo en disco.
- Pasar a REALIZADA con archivos en un solo PATCH. Un fallo no deja ni el estado ni
  los archivos aplicados.
- Semana 0 o mayor que las semanas del bimestre: 400. Bimestre sin fechas: 409.
- Docente ajeno: 403. Tras una reasignación, el docente nuevo edita y el anterior no.
- Pasada la `fechaFin` del bimestre: el docente recibe 403/409; el administrador sin
  motivo recibe 400 y con motivo, 200.
- Revisar una actividad PLANIFICADA: 409; OBSERVADA sin observaciones: 400; revisión
  hecha por un docente: 403. El docente no edita una actividad VALIDADA.
- Alumno/apoderado: solo ve actividades REALIZADAS no observadas de su sección, sin
  datos del docente, y recibe 403 en cualquier escritura.
- Campos no declarados, `docenteId` o `estadoRevision` enviados por el cliente: 400.
- Cuatro archivos, más de 5 MB, un ejecutable renombrado o un enlace `http://`: 400.
- Dos subidas simultáneas no superan 3 archivos activos.
- Dos `POST /planes-academicos` simultáneos para la misma clase y bimestre dejan un
  solo plan (el segundo responde 409).
- Desactivar el plan desactiva sus actividades y lo audita.
- Los CHECK de la base: REALIZADA sin fecha, revisión de una PLANIFICADA, OBSERVADA sin
  observaciones y más de 5 enlaces se rechazan aunque se inserte con Prisma.

Se actualiza AUD-10 (usa `/planes-academicos/docente` y la fecha de hoy dentro del
bimestre) a la ruta unificada y a la regla de planificar por adelantado.

## Documentación

- CHANGELOG: nueva entrada, y corrección de la de `83d56f3` («se reemplaza» → «se
  separa»).
- CLAUDE.md, `docs/API.md` y `.plans/evidencia-calificacion-spec.md`: «evidencia
  pedagógica» de US-019 pasa a «evidencia de calificación»; `docs/API.md` documenta
  las rutas nuevas.

## Verificación

`npx prisma validate`, `npx prisma generate`, carga de `src/app.js`, la nueva suite
y `auditoria`. La suite completa sigue bloqueada por los fallos previos de la rama
(fixtures con DNI inválido y errores de sintaxis del frontend) hasta incorporar
`main` (`26bc6f8`, PR #16).

## Decisiones tomadas por defecto (revisables)

- REALIZADA no vuelve a PLANIFICADA.
- Después de la `fechaFin` del bimestre, el administrador edita con motivo obligatorio.
- El alumno/apoderado no ve las actividades OBSERVADAS.
- `PUT /planes-academicos/:id` pasa a `PATCH` (no lo usa ningún frontend).
