# Especificación: libreta de notas por competencias

**Módulo:** Gestión Académica y Evaluación · **Rama:** `rama/moduloGestionAcademica` · **Fecha:** 2026-11-06
**Historia:** US-020.

## 1. Historia

Como alumno o apoderado, debería poder visualizar la libreta de notas o informe de progreso por
competencias para conocer el rendimiento académico del alumno.

| Criterio de aceptación                                  | Cómo se cumple                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Muestra el logro alcanzado por competencia y periodo    | Cada competencia muestra el `nivelLogro` de cada bimestre publicado, más la calificación anual                        |
| Es consultable solo por el propio alumno o su apoderado | Rutas nuevas que autorizan por vínculo con el estudiante. Cualquier otra persona recibe 403, incluso el administrador |

Además, la libreta bimestral deja de ser una impresión de la web: toma el mismo formato de documento
que la anual.

## 2. Problemas actuales que esta historia corrige

| Problema                                                                                                           | Dónde                                           |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| La vista por bimestre muestra `logroConsolidado`, que mezcla todos los bimestres, y no el logro de ese periodo     | `pages/Libreta.jsx:40`                          |
| `GET /calificaciones` devuelve entidades completas: un apoderado recibe el DNI del docente, por lectura del código | `calificacionRepository.js:3`                   |
| El alumno con rol de apoderado recibe 403 al consultar a su hijo, porque la rama `ALUMNO` se evalúa primero        | `calificacionService.js:89`                     |
| «Descargar libreta PDF» imprime la pantalla entera: no existe ningún `@media print`                                | `pages/Libreta.jsx:126`                         |
| La libreta desaparece al cambiar de año: `/portal/estudiantes` y `/bimestres` solo devuelven el año activo         | `portal.repository.js:12`, `routes/index.js:56` |
| El portal solo ofrece el botón de libreta al apoderado, en una segunda sección con el mismo título                 | `pages/Portal.jsx:163`                          |
| El aviso y la etiqueta «Publicado» no alcanzan el contraste 4.5:1 del estándar                                     | `.published-notice`, `.published-badge`         |

## 3. Decisiones tomadas

| Tema                        | Decisión                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Generación del PDF          | Hoja de impresión: un componente de documento con `@media print`. El PDF contiene solo la libreta y se guarda desde el diálogo del navegador |
| Vista en pantalla           | Igual al documento: un solo componente para pantalla y papel, rodeado por los controles de SAGE                                              |
| Hoja                        | A4 vertical, una columna. Si la tabla no cabe, sigue en otra hoja repitiendo sus títulos                                                     |
| Estilo del documento        | Fiel a la imagen: lavanda en encabezados y columna anual, mayúsculas en títulos, notas en texto negro                                        |
| Datos de la institución     | Variables de entorno. Sin valor, la celda queda en blanco                                                                                    |
| Apreciación del tutor       | Se omite                                                                                                                                     |
| Firmas                      | Líneas en blanco de docente o tutor y de director, en ambas libretas                                                                         |
| Libreta bimestral           | Área, competencia y logro de ese bimestre, con el mismo encabezado, escala y firmas                                                          |
| Conclusión descriptiva      | No se muestra: ninguna pantalla permite escribirla                                                                                           |
| Calif. anual de competencia | Solo con todos los bimestres publicados. Aplica la regla del curso e ignora su mínimo                                                        |
| Calif. final del área       | Misma estrategia sobre las notas anuales de sus competencias. `reciente` pasa a nivel más frecuente                                          |
| Disponibilidad de la anual  | Desde el primer bimestre publicado, como informe de progreso. Los periodos pendientes quedan vacíos                                          |
| Años anteriores             | Se consultan, con selector de año                                                                                                            |
| Orden de las áreas          | Por `Curso.codigo`, sin migración. Las competencias siguen por `Competencia.codigo`                                                          |
| Acceso                      | Solo alumno y apoderado con vínculo activo. Administrador y docente reciben 403                                                              |
| Doble rol                   | Se autoriza por vínculo real, sin importar el orden de los roles                                                                             |
| Alumno retirado             | Ve lo ya publicado de su matrícula inactiva, si su persona sigue activa                                                                      |
| Morosidad                   | No afecta el acceso                                                                                                                          |
| `GET /calificaciones`       | Se cierra a alumno y apoderado. Queda un solo camino para ver notas publicadas                                                               |
| Vista inicial               | Último bimestre publicado. El selector lista todos y marca los pendientes                                                                    |
| Auditoría                   | No aplica: son consultas y el estándar audita operaciones críticas                                                                           |

## 4. Modelo de datos

Sin cambios en `schema.prisma` ni migración. El mapa de la imagen a SAGE es:

| Imagen                         | Origen                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| Área curricular                | `Curso`                                                              |
| Competencia                    | `Competencia`                                                        |
| Calificativo por periodo       | `CalificacionCompetencia.nivelLogro`, por `BimestreAcademico.numero` |
| Apellidos y nombres            | `Persona.apellidos`, `Persona.nombres`                               |
| DNI                            | `Persona.numeroDocumento`                                            |
| Código del estudiante          | `Estudiante.codigoEstudiante`                                        |
| Grado y sección                | `Seccion.grado.nombre`, `Seccion.nombre`                             |
| Año del título                 | `AnioAcademico.codigo`                                               |
| DRE, UGEL, I.E., código, nivel | Variables de entorno (§6)                                            |
| Competencias transversales     | Un `Curso` más del catálogo, con sus competencias                    |

## 5. API

Base `/api/v1`. Respuestas `{ "data": ... }`. El recurso es la libreta y su identificador es el de la
matrícula, porque hay una libreta por alumno y año. El rol no forma parte de la ruta.

| Método y ruta       | Quién                          | Respuesta                                | Éxito |
| ------------------- | ------------------------------ | ---------------------------------------- | ----- |
| `GET /libretas`     | Alumno o apoderado con vínculo | Estudiantes autorizados y sus matrículas | 200   |
| `GET /libretas/:id` | Alumno o apoderado con vínculo | Libreta completa de esa matrícula        | 200   |

Las rutas llevan solo `requireAuth`. El vínculo se resuelve en el service, porque un rol no basta: un
docente que además es apoderado entra por su hijo, y un apoderado no entra a otro alumno.

`GET /libretas`, con las matrículas de todos los años, activas o no, de la más reciente a la más antigua:

```json
[
  {
    "id": 5,
    "nombre": "Ana Pérez Ríos",
    "matriculas": [
      { "id": 12, "anioAcademico": "2026", "seccion": "3.° B", "activa": true },
      { "id": 7, "anioAcademico": "2025", "seccion": "2.° A", "activa": true }
    ]
  }
]
```

`GET /libretas/:id`:

```json
{
  "institucion": {
    "nombre": "I.E. Ejemplo",
    "dre": "Lima Metropolitana",
    "ugel": "UGEL 03",
    "codigoModular": "0000000",
    "nivel": "Primaria"
  },
  "estudiante": { "apellidosNombres": "Pérez Ríos, Ana", "codigo": "E-001", "dni": "00000000" },
  "matricula": {
    "id": 12,
    "anioAcademico": "2026",
    "grado": "3.°",
    "seccion": "B",
    "activa": true
  },
  "periodos": [
    { "id": 1, "numero": 1, "nombre": "Bimestre 1", "publicado": true },
    { "id": 2, "numero": 2, "nombre": "Bimestre 2", "publicado": false }
  ],
  "anualCompleta": false,
  "areas": [
    {
      "id": 3,
      "codigo": "01-PS",
      "nombre": "Personal Social",
      "calificacionFinal": null,
      "competencias": [
        {
          "id": 9,
          "codigo": "PS-1",
          "nombre": "Construye su identidad",
          "logros": { "1": "A", "2": null },
          "calificacionAnual": null
        }
      ]
    }
  ]
}
```

Una sola respuesta alimenta las dos vistas: cambiar de bimestre o de tipo no consulta al servidor.
`GET` no acepta query, así que no hace falta esquema nuevo: basta `idSchema`.

### Reglas

**Publicación.** Solo salen del servidor las notas de bimestres con `PublicacionSeccion` para la
sección de la matrícula. El filtro se aplica en la consulta, no después: la nota no publicada no llega
a la respuesta ni como dato oculto.

**Autorización.** `portal.service.js` separa y exporta el filtro de `estudiantesAutorizados`, y
`libretas.service.js` lo reutiliza con su propia consulta, sin limitar a matrículas activas ni al año
activo. Se conserva `persona: { activo: true }` y el `activo: true` del vínculo con el apoderado.

**Áreas y competencias.** Se muestra la unión de:

- Los cursos con asignación activa en la sección, con sus competencias activas.
- Los cursos y competencias que tengan una nota publicada, aunque hoy estén inactivos.

Se agrupa por curso, no por asignación: reasignar un curso crea otra asignación y no debe duplicar el
área. Un área sin competencias no se muestra. El orden usa `localeCompare` con `numeric: true`.

**Calificación anual de la competencia.**

1. `anualCompleta` es `true` si hay periodos y todos los bimestres activos del año están publicados.
2. Si es `false`, `calificacionAnual` y `calificacionFinal` son `null`.
3. Si es `true`, se aplica la regla a las notas de la competencia, ordenadas por `numero`.
4. La regla es la de la `Calificacion` del último bimestre con nota de ese curso, no la vigente hoy.
   Así, cambiar una regla no altera la libreta de un año cerrado.
5. El mínimo se ignora: la condición real es el paso 1. Sin esto, un mínimo mayor a 4 dejaría la nota
   vacía para siempre, porque `consolidar` cuenta notas por bimestre y no evidencias.

**Calificación final del área.** Es `null` si alguna competencia del área no tiene `calificacionAnual`.
Si todas tienen, se toma la regla del paso 4, sin mínimo:

| Estrategia de la regla | Cálculo sobre las notas anuales del área              |
| ---------------------- | ----------------------------------------------------- |
| `frecuencia`           | Nivel más frecuente, con su desempate `alto` o `bajo` |
| `prioridad`            | Nivel más alto                                        |
| `reciente`             | Nivel más frecuente y, si hay empate, el más bajo     |

El desempate `reciente` de `frecuencia` también pasa a `bajo`, porque las competencias no tienen orden
en el tiempo.

**Salida mínima.** Nunca salen datos del docente, de la regla, ni `hashContrasena`. El único documento
de identidad es el del propio estudiante, en `estudiante.dni`.

| Código                 | HTTP | Cuándo                                                            |
| ---------------------- | ---- | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`     | 400  | `:id` no es un entero positivo                                    |
| —                      | 401  | Sin sesión                                                        |
| `FORBIDDEN`            | 403  | Cualquiera de las dos rutas, sin perfil de alumno ni de apoderado |
| `STUDENT_FORBIDDEN`    | 403  | La matrícula es de un estudiante sin vínculo con la sesión        |
| `ENROLLMENT_NOT_FOUND` | 404  | La matrícula no existe                                            |

### Cierre de `GET /calificaciones`

- `listarCalificaciones` pierde las ramas `ALUMNO` y `APODERADO`. Esos roles reciben 403, y
  `GET /calificaciones/:id` queda igual porque depende de esa función.
- Un docente que también es apoderado pasa a la rama `DOCENTE`, que hoy nunca alcanzaba.
- `filtrarPublicadas` se elimina al quedar sin uso.
- Las ramas de administrador y docente no cambian (§12).

## 6. Configuración

Opcionales, con `vacioEsAusente`, en `config/env.js` y documentadas en `backend/.env.example`:

```
INSTITUCION_NOMBRE=
INSTITUCION_DRE=
INSTITUCION_UGEL=
INSTITUCION_CODIGO_MODULAR=
INSTITUCION_NIVEL=
```

## 7. Interfaz

### `pages/Libreta.jsx` (se reescribe)

- **Pestaña:** se mantiene `SAGE | Mis evaluaciones · Libreta`.
- **H1:** «Libreta de notas», único en la pantalla.
- **Controles, en este orden:**
  - «Consultar estudiante», si hay más de uno.
  - «Año académico», si hay más de uno. Una matrícula inactiva se marca «2025 (matrícula inactiva)».
  - «Tipo de libreta»: radios Bimestral y Anual dentro de un `fieldset`.
  - «Bimestre», solo en Bimestral. Los pendientes se marcan «Bimestre 3 (no publicado)».
- **Acción:** un botón primario «Imprimir o guardar PDF», deshabilitado si no hay nada que imprimir.
- **Valores iniciales:** la matrícula activa del año más reciente, tipo Bimestral y el último bimestre
  publicado. Si no hay ninguno publicado, el primer bimestre.
- Cambiar de estudiante o de año reinicia el tipo y el bimestre, con `key={matricula.id}`.

| Estado                         | Qué se muestra                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Cargando                       | `Loading`                                                                                                          |
| Error                          | `ResourceError` con reintento                                                                                      |
| Sin matrículas                 | `Feedback` «Libreta no disponible»                                                                                 |
| Bimestre no publicado          | `Feedback` «Bimestre no publicado», sin documento y sin impresión                                                  |
| Anual sin bimestres publicados | `Feedback` «Todavía no hay bimestres publicados», sin documento y sin impresión                                    |
| Anual parcial                  | Documento, más `Feedback` «2 de 4 bimestres publicados. Las calificaciones anuales aparecen al publicar el último» |
| Publicado                      | Documento                                                                                                          |

### `components/DocumentoLibreta.jsx` (nuevo)

Componente de presentación: recibe la libreta, el `tipo` y el `periodo`, y no consulta al servidor.

1. **Título:** «Informe de progreso del aprendizaje del estudiante - 2026». En la bimestral agrega el
   periodo: «… - Bimestre 1 - 2026». Las mayúsculas se aplican con CSS. No usa `h1`, que es de la pantalla.
2. **Datos:** tabla con DRE, UGEL, Nivel, Código Modular, Institución Educativa, Grado, Sección,
   Apellidos y nombres, Código del estudiante y DNI.
3. **Tabla de notas:**
   - Anual: Área curricular, Competencias, Calificativo por periodo (1 a n), Calif. anual de Comp. y
     Calif. final del área. La columna anual va en lavanda y su título, girado.
   - Bimestral: Área curricular, Competencias y Calificativo.
4. **Escala de calificaciones del CNEB:** AD Logro destacado, A Logro esperado, B En proceso y C En
   inicio, con su descripción. Es una constante del componente y reemplaza a `progressByLevel`.
5. **Firmas:** «Firma y sello del Docente o Tutor(a)» y «Firma y sello del Director(a)».

La cantidad de columnas sale de `periodos`, no de un 4 fijo.

**Accesibilidad:** `caption` para lector de pantalla, `th` con `scope`, y un `tbody` por área con su
`th scope="rowgroup"`. Una celda vacía lleva «Sin calificación» solo para lector de pantalla. Las notas
son texto, así que no dependen del color.

### Impresión (`styles/app.css`)

- En `@media print` se ocultan barra lateral, encabezado, breadcrumb, título de pantalla, controles y
  avisos, y `.app-shell`, `.workspace` y `main` pierden su diseño de pantalla.
- `@page { size: A4 portrait; margin: 0 }` evita que el navegador agregue fecha y URL. El margen visual
  lo da el propio documento. Una fila vacía en `thead` y `tfoot` conserva el margen en la hoja siguiente.
- `print-color-adjust: exact` para que el lavanda se imprima.
- `thead` se repite en cada hoja y `break-inside: avoid` mantiene junta cada área, la escala y las firmas.
- El nombre sugerido del PDF se fija en `beforeprint` cambiando `document.title` a
  `Libreta-2026-Perez-Rios`, y se restaura en `afterprint`.
- El color de la hoja se define con variables `--libreta-*`, no con valores sueltos.

En pantalla, la hoja va en un contenedor con desplazamiento horizontal para tablet.

### `pages/Portal.jsx`

El botón «Ver y descargar libreta» pasa a la sección «Acciones frecuentes» que ya existe, para alumno y
apoderado. Desaparece el segundo título repetido.

### Limpieza

Se eliminan `.published-notice`, `.published-badge`, `.unpublished-badge`, `.evaluations-card` y
`.progress-copy`, que solo usa `Libreta.jsx`. Se conserva `.achievement`, que usa
`ReglasConsolidacion.jsx`.

## 8. Alineación con los estándares

**Programación:**

| Regla                                | Aplicación                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Prisma solo en `repositories/`       | Las consultas nuevas viven en `libretas.repository.js`                  |
| Autorización en el servidor          | El vínculo se comprueba en el service, no por ocultar opciones en React |
| Reglas puras separadas               | El cálculo va en `domain/`, sin entrada ni salida                       |
| Nombres `recurso.responsabilidad.js` | `libretas.service.js` y equivalentes                                    |
| Rutas en plural, sin verbos ni rol   | `/libretas`, `/libretas/:id`                                            |
| Salida mínima                        | Se arma una forma propia, nunca la entidad de Prisma                    |
| Valores mágicos                      | Niveles y escala en constantes                                          |
| Estados de UI                        | Carga, éxito, vacío y error (§7)                                        |
| `key` estable en listas              | Identificadores de área, competencia y periodo, no el índice            |
| Pruebas                              | Camino correcto, datos inválidos, reglas, 401, 403 y regresión (§10)    |
| Configuración                        | `.env.example` versionado, sin `.env`                                   |

**Interfaz:** un solo H1, un solo botón primario con texto concreto, altura mínima de 40 px, etiquetas
visibles, foco visible, breadcrumb, sección activa en el menú y estados con texto además de color.

**Desviaciones que se mantienen a propósito:**

- El documento usa lavanda, mayúsculas y texto menor a 12 px, y sus encabezados no son `#F9FAFB`: es un
  documento con formato propio, no una pantalla. Todo vive bajo `.libreta-*` y el texto cumple 4.5:1.
- La tabla del documento no pagina ni ordena: su tamaño lo limita el plan de estudios y su orden es el
  del informe. Las notas van centradas, porque son niveles y no cifras.
- Los avisos usan `Feedback` en línea y no toast, porque es lo que existe en el proyecto.
- Sin íconos Lucide: la dependencia no está instalada y las acciones llevan texto.
- El estándar no prioriza móvil: se verifica en escritorio y tablet.

## 9. Archivos

**Nuevos, backend:** `routes/libretas.js`, `controllers/libretas.controller.js`,
`services/libretas.service.js`, `repositories/libretas.repository.js`, `domain/consolidacion.js`,
`domain/libreta.js`, `tests/libretas.test.js`.

- `domain/consolidacion.js` recibe `consolidar` y `metodoRegla`, que hoy están en
  `calificacionesAlumno.service.js`, porque `domain/` no puede depender de `services/`. Se separa una
  función que aplica una regla ya interpretada, para calcular sin mínimo. `consolidar` conserva su firma.
- `domain/libreta.js` calcula `anualCompleta`, las notas anuales, la final del área y el armado de áreas.

**Nuevos, frontend:** `components/DocumentoLibreta.jsx`.

**Modificados:**

| Archivo                                    | Cambio                                       |
| ------------------------------------------ | -------------------------------------------- |
| `services/calificacionesAlumno.service.js` | Importa `consolidar` desde `domain/`         |
| `services/calificacionService.js`          | Quita las ramas de alumno y apoderado        |
| `services/publicacionSeccion.service.js`   | Quita `filtrarPublicadas`                    |
| `services/portal.service.js`               | Exporta el filtro de estudiantes autorizados |
| `routes/index.js`                          | Monta el router                              |
| `config/env.js`, `backend/.env.example`    | Variables de institución                     |
| `scripts/test.js`                          | Suite `libretas`                             |
| `pages/Libreta.jsx`, `pages/Portal.jsx`    | Pantalla nueva y botón para el alumno        |
| `styles/app.css`                           | Estilos del documento, impresión y limpieza  |
| `docs/API.md`, `CHANGELOG.md`, `CLAUDE.md` | Documentación y estado actual                |

## 10. Pruebas

Suite `libretas`. Publica como administrador, con evidencia, igual que `publicacion-libretas`.

| ID     | Caso                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| LIB-01 | El alumno consulta su libreta (200) con áreas, competencias y logros por periodo                                                 |
| LIB-02 | El apoderado vinculado consulta la libreta de su hijo                                                                            |
| LIB-03 | Otro alumno y otro apoderado reciben `STUDENT_FORBIDDEN`                                                                         |
| LIB-04 | Un apoderado con el vínculo inactivo recibe 403                                                                                  |
| LIB-05 | Administrador y docente, incluso el del curso, reciben 403 en ambas rutas                                                        |
| LIB-06 | Sin sesión responde 401 en ambas rutas                                                                                           |
| LIB-07 | `:id` inválido responde 400 y una matrícula inexistente, 404                                                                     |
| LIB-08 | Quien es alumno y apoderado consulta su libreta y la de su hijo                                                                  |
| LIB-09 | Un administrador que es apoderado ve a su hijo, y sin notas no publicadas                                                        |
| LIB-10 | Una nota de un bimestre sin publicar no aparece en ninguna parte de la respuesta                                                 |
| LIB-11 | Regresión: con B en el bimestre 1 y A en el 2, cada periodo muestra su propio nivel                                              |
| LIB-12 | Con un bimestre sin publicar, `anualCompleta` es `false` y las notas anuales son `null`                                          |
| LIB-13 | Con todos publicados, la nota anual sigue la regla en sus tres estrategias                                                       |
| LIB-14 | Un mínimo mayor a 4 no impide la nota anual                                                                                      |
| LIB-15 | Cambiar la regla después de publicar no altera la nota anual                                                                     |
| LIB-16 | La final del área aplica `frecuencia` y `prioridad`, y `reciente` usa frecuencia con empate al más bajo                          |
| LIB-17 | La final del área es `null` si falta una nota anual                                                                              |
| LIB-18 | Las áreas se ordenan por código de curso y las competencias por su código                                                        |
| LIB-19 | Reasignar un curso no duplica el área                                                                                            |
| LIB-20 | Una competencia inactiva con nota publicada se mantiene, y una activa sin nota queda vacía                                       |
| LIB-21 | Al activar otro año, la libreta del año anterior sigue disponible                                                                |
| LIB-22 | Una matrícula inactiva se lista y muestra lo publicado                                                                           |
| LIB-23 | La respuesta no expone docente, regla ni hash, y el único documento es el del estudiante                                         |
| LIB-24 | `institucion` refleja las variables y, sin valor, devuelve `null`                                                                |
| LIB-25 | `GET /libretas` lista solo estudiantes autorizados, con años de más reciente a más antiguo                                       |
| LIB-26 | Una boleta vencida no impide consultar la libreta                                                                                |
| LIB-27 | Alumno y apoderado reciben 403 en `GET /calificaciones` y `GET /calificaciones/:id`                                              |
| LIB-28 | Un docente que también es apoderado sigue consultando `GET /calificaciones` como docente                                         |
| LIB-29 | Un curso «Competencias transversales» creado en la prueba sale como un área más, al final según su código, con su final del área |

El curso de LIB-29 existe solo en la base temporal de la suite. No se agrega a `seed.js` ni a ninguna
base de desarrollo: si el colegio quiere esas filas, el administrador lo crea desde el catálogo.

**Pruebas existentes que cambian:** `calificaciones-alumno.test.js` importa `consolidar` desde
`domain/` y su caso de visibilidad pasa a `GET /libretas/:id`. `publicacion-libretas.test.js` hace lo
mismo en PUB-06 y PUB-08. Hay que revisar también `calificaciones-permisos.test.js`, que define
`notas` sobre la misma ruta.

El frontend no tiene pruebas automatizadas. Se verifica en el navegador:

- Alumno y apoderado con dos hijos, en ambos tipos de libreta y con selector de año.
- Bimestre sin publicar, anual parcial y anual completa.
- Vista previa de impresión en Chrome y Edge: sin menú ni URL, colores visibles, y una tabla larga que
  continúa en otra hoja con sus títulos y su margen.
- Ancho de tablet (768 px) y navegación por teclado.

**Antes de integrar:** `npm run format:check`, `npm run lint`, `npm test`.

## 11. Orden de trabajo

1. Mover `consolidar` a `domain/` sin cambiar comportamiento, con las pruebas actuales en verde.
2. Crear `domain/libreta.js`, repositorio, service, rutas y suite `libretas`.
3. Cerrar `GET /calificaciones` y migrar las pruebas existentes.
4. Reescribir `Libreta.jsx`, crear `DocumentoLibreta.jsx` y ajustar `Portal.jsx`.
5. Agregar estilos de impresión y limpiar los que quedan sin uso.
6. Verificar en el navegador y actualizar la documentación.

Los pasos 3 y 4 van en el mismo cambio: cerrar la ruta sin la pantalla nueva deja la libreta sin datos.

## 11.1 Ajustes hechos al implementar

- **Anchos de columna:** se definen con `colgroup`. Con `table-layout: fixed`, la primera fila manda, y
  esa es la fila de margen.
- **Estilos globales de tabla:** `td:last-child`, `tbody th` y `thead` deformaban la hoja al imprimir.
  Se anulan dentro de `.libreta-hoja`.
- **Bimestral:** la columna «Calificativo» tiene ancho propio, porque el título no cabía.
- **Verificación del PDF:** se generó con Chrome sin ventana, con fondos desactivados y encabezados
  activos. Salió en A4, sin URL ni menú y con el lavanda visible. Con el plan completo de la imagen,
  ambas libretas ocupan dos hojas. No se probó en Edge ni con el diálogo de impresión manual.

## 12. Límites conocidos

- **PDF desde el navegador:** se guarda desde el diálogo de impresión y el resultado puede variar un
  poco entre navegadores. No es una descarga directa.
- **Sin validez verificable:** el PDF no lleva firma digital ni código de verificación.
- **Un solo nivel:** `INSTITUCION_NIVEL` es único, así que un colegio con primaria y secundaria mostraría
  el mismo nivel en todas sus libretas.
- **Competencias transversales:** no aparecen en la libreta hasta que el administrador cree un curso
  para ellas, con sus competencias, un docente por sección y una regla por grado, porque SAGE no tiene
  figura de tutor. Ese curso cuenta como cualquier otro: sin sus notas y evidencias, la sección no se
  publica.
- **Correcciones tras publicar:** una corrección del administrador cambia la libreta. Un PDF ya guardado
  queda desactualizado.
- **`GET /calificaciones` para docente y administrador:** sigue devolviendo entidades completas.
- **Semántica de `minimoEvidencias`:** la pantalla de reglas habla de evidencias, pero `consolidar` cuenta
  notas por bimestre. La libreta lo ignora y el problema sigue en los demás usos.
- **Secciones migradas sin nota:** una competencia sin nota en un periodo publicado queda vacía, y la
  anual se calcula con las notas que existan.
- **Persona inactiva:** si se desactiva la persona del estudiante, ni su apoderado ve la libreta.

## 13. Fuera de alcance

Apreciación del tutor, figura de tutor de sección, conclusión descriptiva, descarga directa del PDF,
firma digital, vista de libreta para administrador o docente, campo de orden en `Curso`, condicionar la
libreta a la deuda, acceso de alumno y apoderado a la evidencia, boleta en PDF (US-009) y la corrección
de `/bimestres`, que usa Prisma desde la ruta.
