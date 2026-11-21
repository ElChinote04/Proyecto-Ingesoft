# Evaluación continua — paso 1: modelo de datos

Rama: `rama/moduloGestionAcademica`. Alcance: solo esquema, migración, limpieza del
backend y pruebas. **Fuera de alcance:** cálculo de cierre de bimestre, conversión
del promedio a AD/A/B/C, endpoints de `/evaluaciones` y cualquier cambio de frontend.

## Contexto y decisión principal

`EvidenciaPedagogica` no es una evaluación: es el informe de avance de un docente
sobre un `PlanAcademico` (sin alumno, competencia ni nota), con un flujo de
revisión. Un renombrado no la convertiría en evaluación continua, así que este paso
**reemplaza** el modelo por `Evaluacion` + `ResultadoEvaluacion` + `ArchivoEvaluacion`.
La tabla vieja no tiene datos que conservar (el seed no la llena), por lo que la
migración la elimina y crea las nuevas; no hay `ALTER TABLE RENAME`.

Flujo objetivo (pasos posteriores): el docente crea una actividad (`Evaluacion`)
para una competencia de su clase en un bimestre, la registra y pone una nota 0–20
a cada alumno. Al cerrar el bimestre, el promedio ponderado (por `peso`) de las
evaluaciones `REGISTRADA` y activas se convierte a AD/A/B/C y se guarda en
`CalificacionCompetencia.nivelLogro`, como hoy. Más adelante los archivos de la
evaluación reemplazarán a `EvidenciaCalificacion`.

## Esquema (`backend/prisma/schema.prisma`)

Convención del proyecto: **sin `@@map`**; las tablas se llaman como el modelo
(PascalCase). Auditoría por columnas `creadoPorId`/`modificadoPorId` sin relación,
igual que el resto.

### Se elimina

- `model EvidenciaPedagogica` y `enum EstadoEvidenciaPedagogica`.
- Relaciones inversas: `Usuario.evidenciasRevisadas` (`@relation("EvidenciaRevisor")`),
  `Docente.evidencias`, `PlanAcademico.evidencias`.

### Se añade

```prisma
enum EstadoEvaluacion {
  BORRADOR
  REGISTRADA
}

model Evaluacion {
  id              Int                   @id @default(autoincrement())
  asignacionId    Int
  cursoId         Int
  seccionId       Int
  bimestreId      Int
  competenciaId   Int
  asignacion      CursoSeccionDocente   @relation(fields: [asignacionId, cursoId, seccionId], references: [id, cursoId, seccionId])
  curso           Curso                 @relation(fields: [cursoId], references: [id])
  seccion         Seccion               @relation(fields: [seccionId], references: [id])
  bimestre        BimestreAcademico     @relation(fields: [bimestreId], references: [id])
  competencia     Competencia           @relation(fields: [competenciaId, cursoId], references: [id, cursoId])
  titulo          String
  descripcion     String?
  fecha           DateTime              @db.Date
  peso            Decimal               @default(1) @db.Decimal(5, 2)
  estado          EstadoEvaluacion      @default(BORRADOR)
  activo          Boolean               @default(true)
  creadoPorId     Int
  modificadoPorId Int
  creadoEn        DateTime              @default(now())
  modificadoEn    DateTime              @updatedAt
  resultados      ResultadoEvaluacion[]
  archivos        ArchivoEvaluacion[]

  @@index([cursoId, seccionId, bimestreId, activo])
}

model ResultadoEvaluacion {
  id              Int        @id @default(autoincrement())
  evaluacionId    Int
  evaluacion      Evaluacion @relation(fields: [evaluacionId], references: [id])
  matriculaId     Int
  matricula       Matricula  @relation(fields: [matriculaId], references: [id])
  nota            Decimal    @db.Decimal(4, 2)
  comentario      String?    @db.VarChar(500)
  activo          Boolean    @default(true)
  creadoPorId     Int
  modificadoPorId Int
  creadoEn        DateTime   @default(now())
  modificadoEn    DateTime   @updatedAt

  // Un solo resultado ACTIVO por alumno y evaluación: índice único parcial en SQL.
  @@index([evaluacionId, activo])
  @@index([matriculaId])
}

model ArchivoEvaluacion {
  // Misma forma que ArchivoEvidenciaCalificacion; revisar ese modelo y copiar sus
  // campos exactos (nombreOriginal, nombreAlmacenado @unique, tipoMime,
  // tamanoBytes, activo, creadoPorId, creadoEn…) cambiando la FK a evaluacionId.
  @@index([evaluacionId, activo])
}
```

### Se modifica en modelos existentes

- `CursoSeccionDocente`: `@@unique([id, cursoId, seccionId])` (destino de la FK
  compuesta) y `evaluaciones Evaluacion[]`.
- `Competencia`: `@@unique([id, cursoId])` y `evaluaciones Evaluacion[]`.
- `Curso`, `Seccion`, `BimestreAcademico`: `evaluaciones Evaluacion[]`.
- `Matricula`: `resultadosEvaluacion ResultadoEvaluacion[]`.

Los campos `cursoId` de `Evaluacion` participan en dos relaciones (asignación y
competencia). Prisma lo permite en PostgreSQL; si `prisma validate` exige acciones
referenciales explícitas, usar `onDelete: Restrict, onUpdate: Cascade` igual en ambas.

### Por qué las FK compuestas

`Evaluacion` guarda `asignacionId` (quién la creó y quién es dueño) **y**
`cursoId`/`seccionId` desnormalizados (si cambian de docente se crea otra
asignación, y la consolidación debe juntar las evaluaciones de ambos por clase).
La FK `(asignacionId, cursoId, seccionId)` hace imposible que se desincronicen, y
`(competenciaId, cursoId)` impide evaluar una competencia de otro curso. Lo
garantiza la base de datos, como pide CLAUDE.md.

## Migración

1. Con Docker levantado: `npx prisma migrate dev --create-only --name evaluacion_continua`.
2. Revisar el SQL generado: debe hacer `DROP TABLE "EvidenciaPedagogica"`,
   `DROP TYPE "EstadoEvidenciaPedagogica"`, crear el enum, las tres tablas, los dos
   índices únicos nuevos sobre `CursoSeccionDocente` y `Competencia`, y las FK.
3. Añadir a mano (Prisma no los modela), con un comentario que explique cada uno:
   ```sql
   ALTER TABLE "ResultadoEvaluacion"
     ADD CONSTRAINT "ResultadoEvaluacion_nota_rango" CHECK ("nota" >= 0 AND "nota" <= 20);
   ALTER TABLE "Evaluacion"
     ADD CONSTRAINT "Evaluacion_peso_positivo" CHECK ("peso" > 0);
   CREATE UNIQUE INDEX "ResultadoEvaluacion_activo_unico"
     ON "ResultadoEvaluacion"("evaluacionId", "matriculaId") WHERE "activo" = true;
   ```
   El índice es parcial para que un resultado dado de baja se conserve como fila
   propia y el alumno pueda recibir otra nota, igual que los pagos en curso.
4. `npx prisma migrate reset` en local y `npx prisma generate`.

No se tocan los registros existentes de `RegistroAuditoria` con
`entidad = 'EvidenciaPedagogica'` ni sus eventos `EVIDENCIA_*`: la auditoría es
inmutable. Los eventos nuevos se llamarán `EVALUACION_*` cuando exista el servicio.

## Reglas que quedan para el servicio (paso siguiente, no implementar)

Se validan dentro de la transacción, bloqueando la fila de la evaluación:

- Un `BORRADOR` no admite resultados; solo `REGISTRADA` consolida.
- `REGISTRADA` no vuelve a `BORRADOR`.
- La matrícula del resultado pertenece a `seccionId` de la evaluación.
- El bimestre pertenece al año de la sección y `fecha` cae dentro del bimestre.
- Alumno sin fila de resultado = no cuenta en el promedio (ausente, exonerado…).
- Baja lógica con `activo = false`; bloqueo por sección publicada como en
  `exigirSeccionSinPublicar`.

## Limpieza del backend (se elimina la API `/evidencias-pedagogicas`)

Ningún frontend la usa. Borrar:

- `src/routes/evidenciaPedagogica.js` y su import + `router.use` en `src/routes/index.js`.
- `src/controllers/evidenciaPedagogicaController.js`.
- `src/services/evidenciaPedagodicaService.js`.
- `src/repositories/evidenciaPedagogicaRepository.js`.
- En `src/validators/adminSchemas.js`: `createEvidenciaPedagogicaSchema`,
  `updateEvidenciaPedagogicaSchema`, `reviewEvidenciaPedagogicaSchema`, y
  `evidenceDate`/`evidenceFiles` (solo los usan esos esquemas).
- En `src/repositories/PlanAcademicoRepository.js`: quitar `evidencias` del `include`.
- En `tests/evidencias-calificacion.test.js`: la prueba `EVC-20` (evidencia del plan).

Comprobar con `grep -ri "evidenciaPedagogica\|EvidenciaPedagogica\|evidencias-pedagogicas\|EstadoEvidencia\|EvidenciaRevisor"`
sobre `backend/src` y `backend/tests` que no queda ninguna referencia.

## Corrección de `auditPlanAcademico()`

En `src/repositories/PlanAcademicoRepository.js`, escribir solo columnas que
existen, con el mismo formato que usaba `evidenciaPedagogicaRepository`:

```js
db.registroAuditoria.create({
  data: {
    usuarioId,
    tipoEvento,
    resultado: 'EXITO',
    entidad: 'PlanAcademico',
    entidadId: planId,
    requestId,
    // Pasa por JSON porque el plan trae fechas Date y el campo guarda JSON.
    detalle: JSON.parse(
      JSON.stringify({ valorAnterior: valorAnterior ?? null, valorNuevo: valorNuevo ?? null }),
    ),
  },
});
```

## Pruebas

**Nueva suite `tests/evaluaciones-modelo.test.js`**, registrada en
`backend/scripts/test.js`. Usa Prisma directamente (es una prueba del modelo, no
de la API) y verifica que la base:

- Acepta una evaluación válida con dos resultados (nota 0 y 20, decimales).
- Rechaza `nota` 20.01 y −0.01 (CHECK).
- Rechaza `peso` 0 y negativo (CHECK); acepta el valor por defecto 1.
- Rechaza un segundo resultado activo para la misma `(evaluacionId, matriculaId)`
  y lo acepta después de dar de baja el anterior.
- Rechaza un comentario de más de 500 caracteres.
- Rechaza `asignacionId` cuyo curso o sección no coinciden con `cursoId`/`seccionId`.
- Rechaza una `competenciaId` de otro curso.

Los rechazos se comprueban por el código de error de Prisma/PostgreSQL
(`P2002`, `P2003`, violación de CHECK), no por el texto.

**Prueba de `auditPlanAcademico`**: crear un plan por `POST /planes-academicos`
(como administrador) y por `POST /planes-academicos/docente`, y comprobar que
existe un `RegistroAuditoria` con `tipoEvento = 'PLAN_ACADEMICO_CREADO'`,
`entidad = 'PlanAcademico'` y `entidadId` del plan; también modificar y
desactivar. El servicio exige que la fecha actual caiga dentro del bimestre, así
que el fixture debe crear un bimestre que contenga hoy. Ubicarla en
`tests/evaluaciones-modelo.test.js` o en la suite de auditoría, la que tenga los
fixtures más cercanos.

## Documentación

- `CHANGELOG.md`: entrada con la eliminación de `/evidencias-pedagogicas`, el
  modelo `Evaluacion`/`ResultadoEvaluacion`/`ArchivoEvaluacion` y la corrección de
  la auditoría de planes.
- `.env.example`: sin cambios.

## Verificación (todo debe pasar antes de integrar)

```bash
npx prisma validate
npx prisma generate
node -e "import('./src/app.js')"   # el backend carga sin imports rotos
npm run format:check
npm run lint
npm test                           # las 16 suites, con Docker levantado
```

## Decisiones

- `ResultadoEvaluacion` tiene borrado lógico (`activo`) y comentario opcional
  de hasta 500 caracteres (decidido con el equipo).
- `titulo` no es único por clase y bimestre (por defecto, revisable).
