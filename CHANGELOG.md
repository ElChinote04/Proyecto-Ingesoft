# Registro de cambios

## Envío del comprobante con Brevo (US-009) — 2026-11-20

- Nuevo proveedor de correo `CORREO_PROVEEDOR=brevo`, que envía el comprobante con la API
  transaccional de Brevo (`BREVO_API_KEY`). Usa HTTPS, así que no depende de que la red permita los
  puertos SMTP. El remitente (`CORREO_REMITENTE`) debe estar validado en Brevo. Se mantienen
  `simulado` y `smtp`.
- La respuesta del reenvío incluye `simulado`. En modo simulado el diálogo ya no dice «Comprobante
  enviado»: avisa que no salió ningún correo.
- Nueva suite `tests/correo.test.js` (COR-01 a COR-03) con la API de Brevo simulada.

## Reenvío del comprobante por correo (US-009) — 2026-11-20

- Completa el criterio «se puede descargar o reenviar por correo» de US-009.
  `POST /compromisos-pago/:id/comprobante/envio` con `{ correo }` envía el PDF del comprobante como
  adjunto. Mismos permisos y errores que la descarga; 502 `CORREO_NO_ENVIADO` si el servidor de
  correo falla (se puede reintentar) y como máximo 10 envíos cada 15 minutos por usuario (429).
- Botón **Enviar por correo** junto a **Descargar comprobante** en Pagos y boletas y en la pantalla
  de resultado del pago. El último correo usado se recuerda en el navegador.
- Nueva integración `integrations/correo.js` con dos proveedores, como la pasarela: `simulado` (por
  defecto, no sale a la red) y `smtp`. Nuevas variables `CORREO_PROVEEDOR`, `CORREO_REMITENTE` y
  `SMTP_*` en `.env.example`. Nueva dependencia `nodemailer`.
- 5 pruebas nuevas en `tests/pagos.test.js`.
- `docs/API.md`: se documentan todos los endpoints de pagos que faltaban (US-006, US-007A, US-007B,
  US-009 y US-010).

## Evaluaciones con nota 0–20 y letra calculada — 2026-11-22

- El docente ya no elige la letra: crea las **evaluaciones del bimestre** del salón (competencia,
  fecha, peso de 1 a 5) y en el modal de cada alumno registra su nota de 0 a 20 con el examen
  corregido (1 a 3 archivos), «No rindió» (cuenta 0) o «Justificada» con motivo (no cuenta). El
  modal muestra «Promedio 16,33 → A» por competencia.
- La letra del bimestre es el promedio ponderado, redondeado al entero (17,5 → 18) y convertido
  con una **escala única** que el administrador configura en Competencias y reglas (por defecto
  AD ≥ 18, A ≥ 14, B ≥ 11). Cambiarla recalcula lo no publicado.
- La **evidencia de calificación** (US-019) se elimina: el examen corregido de cada alumno es el
  sustento de su nota. Se retiran su API, su pantalla y la suite `evidencias-calificacion`.
- Las reglas de consolidación solo calculan la letra anual; `minimoEvidencias` pasa a
  `minimoNotas`, el mínimo de notas por alumno y competencia para publicar. Calificar ya no exige
  regla; publicar sí, y la fija en las notas.
- Publicar exige que cada alumno tenga registradas todas las evaluaciones, una letra y el mínimo
  de notas; los pendientes se informan por curso.
- Se retiran las rutas que escribían la letra a mano: `PUT /matriculas/:id/calificaciones` y
  `POST`/`PUT` de `/calificaciones` y `/calificaciones-competencias`.
- Migración `20261122120000_evaluaciones_nota_vigesimal`: conserva las letras de libretas
  publicadas y borra lo no publicado. **Los archivos de las evidencias de calificación quedan en
  `EVIDENCIAS_DIR` sin fila que los referencie**; se pueden borrar a mano si no hacen falta.
- Nueva suite `evaluaciones` (EVA-01 a EVA-14); `evaluaciones-modelo` cubre las restricciones
  nuevas; `publicacion-libretas`, `libretas`, `calificaciones-alumno`, `calificaciones-permisos` y
  AUD-08 pasan al flujo de evaluaciones.
- Seed: competencias, regla y evaluaciones de demo de Matemática en 3.° B (IV bimestre).

## Seguridad y auditoría (US-001, US-003, US-004) — 2026-11-20

- Se audita el bloqueo de cuenta (`CUENTA_BLOQUEADA`) y el motivo de cada `LOGIN_FALLIDO`. Un
  login fallido ya no aparece dos veces en el log de errores.
- Auditoría y log de errores se enlazan por `requestId`, con un filtro nuevo en ambas consultas.
- Auditoría: historial por usuario o entidad, resumen de seguridad
  (`GET /admin/auditoria/resumen`) y cambios con el valor anterior y el nuevo destacados.

## Plan de trabajo semanal y evidencias pedagógicas — 2026-11-20

- La evidencia pedagógica vuelve como **actividad semanal del plan de trabajo del docente**
  (exposiciones, ejercicios, videos, avances). No es una nota ni la sustenta, y está separada de
  la evaluación continua y de la evidencia de calificación (US-019).
- Docente: nueva entrada «Plan de trabajo». Elige curso, sección y bimestre, crea el plan y
  registra actividades en una vista de filas por semana, con hasta 3 archivos y 5 enlaces, todo en
  una sola petición. Puede subirlas con anticipación (ocultas), publicarlas a mano, programarlas
  para una fecha u ocultarlas de nuevo.
- Los alumnos solo ven lo publicado. La visibilidad se deriva de `publicadaDesde` al consultar,
  sin ningún proceso programado: una actividad programada aparece sola el día indicado.
- Administrador: pestaña «Planes de trabajo» en Gestión académica para validar u observar lo
  publicado, y tabla de fechas de bimestre en Catálogos académicos (`PATCH /bimestres/:id`).
- Alumno y apoderado: nueva entrada «Actividades de clase», en solo lectura, con lo publicado.
- Modelo: `EvidenciaPedagogica` (con `numeroSemana`, tipo, `publicadaDesde` y revisión) y
  `ArchivoEvidenciaPedagogica`. `PlanAcademico` gana curso y sección con FK compuesta y un solo
  plan activo por clase y bimestre. La migración desactiva los planes duplicados y no borra nada.
- API: `GET /asignaciones`, una sola ruta `POST /planes-academicos` para los dos roles (se
  retira `/docente`) y `PATCH` en lugar del `PUT` parcial. El dueño del plan es el docente
  vigente. Los planes ya no los lee cualquier sesión.
- La rama vuelve a compilar: errores de sintaxis del frontend y fixtures de pruebas tomados de la
  corrección de `main` (`26bc6f8`), y tres errores de lint en las pantallas de asistencia.
- El seed de demo fija las fechas de los bimestres de 2026, vincula a la apoderada con Carlos
  Mendoza y crea un plan de Matemática con actividades.
- Nueva suite `evidencias-pedagogicas` (EVP-01 a EVP-19); AUD-10 pasa a la ruta unificada.

## Evaluación continua: modelo de datos — 2026-11-19

- Nuevos modelos `Evaluacion`, `ResultadoEvaluacion` y `ArchivoEvaluacion`, separados de la
  evidencia pedagógica. Esa tabla se retiró aquí y volvió el 2026-11-20 como actividad del plan
  de trabajo del docente (entrada anterior).
- Una evaluación es una actividad de una competencia en una clase y bimestre, con `peso` y estado
  `BORRADOR`/`REGISTRADA`. Cada resultado guarda una nota de 0 a 20 con dos decimales y un
  comentario opcional, con borrado lógico. Solo cambia el modelo: aún no hay API ni consolidación.
- La base garantiza la nota de 0 a 20, el peso positivo, un solo resultado activo por alumno
  (índice único parcial) y, con FK compuestas, que la asignación y la competencia sean del mismo
  curso y sección que la evaluación.
- Se retira la API `/evidencias-pedagogicas`, que ningún frontend usaba, y la prueba EVC-20.
- Corregidos: la auditoría de planes académicos escribía columnas inexistentes, así que crear,
  modificar o desactivar un plan fallaba siempre; y el modelo `Usuario` tenía campos duplicados
  tras un merge, lo que impedía validar el esquema.
- Nueva suite `evaluaciones-modelo` (EVM-01 a EVM-07) y prueba AUD-10.

## Pago en cuotas (US-010) — 2026-11-06

- `POST /compromisos-pago/:id/fracciones` (administrador) con `{ numeroCuotas, montoCuota,
fechaPrimerVencimiento }` divide una boleta pendiente en 2 a 6 cuotas que vencen una por mes. La
  última cuota se ajusta para que la suma sea exactamente el total (RF140): 400
  `FRACCIONES_EXCEDEN_TOTAL` o `FRACCIONES_NO_CUBREN_TOTAL` si no cuadra. Se audita como
  `BOLETA_FRACCIONADA`.
- Cada cuota es una boleta hija (`boletaOrigenId`, `numeroFraccion`) que el apoderado paga por la
  pasarela y que tiene su propio comprobante. La original pasa al nuevo estado `PARCIAL` y ya no se
  paga entera (409 `BOLETA_FRACCIONADA`); queda PAGADA al pagarse la última cuota (RF139).
- No se divide una boleta pagada, ya dividida, que ya es una cuota o con un pago en curso (409).
- Integración con lo existente: el reporte de pagos (US-012) cuenta las cuotas y no la original;
  anular el pago de una cuota (US-013) devuelve la original a `PARCIAL`.
- Botón **Pagar en cuotas** en Pagos y boletas (administrador) con vista previa de las cuotas.
- Migración `20261106170000_fraccionamiento_boletas`.

## Cobranza y anulación de pagos (US-008, US-011, US-012, US-013) — 2026-11-06

- **US-008 Morosidad:** `GET /reportes/pagos/morosidad` agrupa las boletas vencidas por
  estudiante, con su deuda, cantidad de boletas, atraso y apoderados vinculados. Filtros por año,
  grado y sección. Pestaña **Morosidad** en Pagos y boletas (administrador).
- **US-012 Reporte de pagos:** `GET /reportes/pagos?desde&hasta` devuelve lo emitido, recaudado,
  pendiente y moroso, en total y por periodo, filtrable por año, grado y sección. Con
  `formato=pdf|xlsx` lo descarga (PDF con `pdfkit`, Excel con la nueva dependencia
  `write-excel-file`). Pestaña **Reporte de pagos**.
- **US-013 Anulación:** `PUT /pagos/:id/anulacion` con `{ motivo }` (administrador). El pago queda
  ANULADO con quién, cuándo y por qué; su comprobante queda anulado y la boleta vuelve a
  PENDIENTE para cobrarse de nuevo. Se audita como `PAGO_ANULADO` con
  `registrarTransaccionCritica`. Botón **Anular pago** en el historial de boletas.
- **US-011 Aviso de vencimiento:** `GET /avisos-vencimiento` (apoderado) lista las boletas que vencen
  en los próximos `PAGOS_DIAS_AVISO` días (5 por defecto, nueva variable en `.env.example`). Aviso
  en el portal del apoderado y en Pagos y boletas. Sin correo.
- Migración `20261106150000_anulacion_pagos`: estado `ANULADO` en `EstadoPago`, columnas de
  anulación en `Pago` y `anuladoEn` en `Comprobante`. La unicidad del comprobante por boleta pasa a
  un índice parcial (solo el vigente), por lo que la relación `CompromisoPago.comprobante` ahora es
  `comprobantes` (las dos pruebas de US-009 que la consultaban se adaptaron).
- Un reenvío tardío de la pasarela sobre un pago anulado se ignora (`resolverConfirmacion`).
- Nueva suite `tests/cobranza.test.js` (22 pruebas).

## Libreta de notas por competencias (US-020) — 2026-11-06

- Alumno y apoderado consultan la libreta bimestral y la anual en `Mis evaluaciones`, con el formato
  del informe de progreso. La misma hoja se ve en pantalla y se imprime o guarda como PDF, sin el
  menú de SAGE. El alumno también tiene el acceso desde el portal.
- Nuevas rutas `GET /libretas` y `GET /libretas/:id`, solo para el alumno y su apoderado. Incluyen
  años anteriores y matrículas inactivas.
- La libreta anual muestra cada bimestre publicado. La calificación anual y la final del área
  aparecen al publicar todos los bimestres.
- Corregido: la vista por bimestre mostraba un consolidado de todos los bimestres y no el logro de
  ese periodo.
- `GET /calificaciones` se cierra a alumnos y apoderados, porque devolvía entidades completas, con
  el DNI del docente incluido. Las pruebas CAL-03 y CAL-07 cambian en consecuencia.
- `consolidar` pasa a `domain/consolidacion.js`. Nuevas variables `INSTITUCION_*`.
- Nueva suite `libretas` (LIB-01 a LIB-29).

## Evidencia pedagógica y publicación de libretas (US-019) — 2026-11-06

- El docente registra evidencia por nota desde Calificar alumno: título, descripción y hasta tres
  archivos PDF, JPG o PNG. Queda ligada al alumno, curso y competencia, y conserva el nivel con que
  se registró. El modal sigue abierto tras guardar para continuar con la evidencia.
- Nuevos modelos `EvidenciaCalificacion`, `ArchivoEvidenciaCalificacion` y `PublicacionSeccion`.
  Los archivos van a `EVIDENCIAS_DIR` y requieren `multer`. La migración conserva lo ya publicado.
- La libreta la publica el administrador, por sección o de forma masiva, solo con nota y evidencia
  en todas las competencias. La ruta del docente deja de existir.
- Con la sección publicada, notas y evidencia quedan en solo lectura para el docente. El
  administrador corrige por API con motivo obligatorio.
- Tras reasignar un curso, el docente nuevo ve las notas del anterior y las actualiza sin duplicarlas.
- Corregidos: la auditoría de `EvidenciaPedagogica` escribía columnas inexistentes, y
  `/calificaciones-competencias` fallaba con 500 en toda escritura por una transacción no exportada.
- Nuevas suites `evidencias-calificacion` (EVC-01 a EVC-20) y `publicacion-libretas` (PUB-01 a PUB-24).

## Calificación por alumno — 2026-11-05

- El docente elige un salón, ve a sus alumnos y califica todas las competencias de cada uno en una
  sola vista. Los salones salen de sus asignaciones, así que ya no depende de tener sesiones.
- `GET /secciones`, `GET /secciones/:id/alumnos`, `GET` y `PUT /matriculas/:id/calificaciones`.
- Se retiran `GET /calificaciones/contexto` y `POST /calificaciones/competencias/bulk`.
- Al sobrescribir una nota, la auditoría conserva el nivel anterior.
- Nueva suite `tests/calificaciones-alumno.test.js` (CAA-01 a CAA-13).

## Log de errores (US-004) — 2026-11-05

- `GET /errores` con filtros (severidad, código, usuario, rango de fechas) y paginación 10/25/50.
  Lee `app.log` y sus copias rotadas; sin cambios de esquema ni migraciones.
- Permiso `errores.consultar`, hoy asignado al administrador, y middleware `requirePermiso`.
- Pantalla **Log de errores**, que el menú muestra según el permiso.
- `errorHandler` registra el módulo de la ruta que falló en lugar del valor fijo `http`.
- Nueva suite `tests/errores.test.js` (ERR-01 a ERR-08).

## Auditoría de transacciones críticas (US-003) — 2026-10-23

- `registrarTransaccionCritica(db, datos)` en `auditoria.service.js`: los módulos de notas y pagos
  registran cada cambio dentro de su transacción, con usuario, fecha, valor anterior, valor nuevo,
  motivo y requestId. Catálogo cerrado `EVENTOS_CRITICOS`; las modificaciones y anulaciones exigen
  motivo. Contrato en `docs/AUDITORIA_TRANSACCIONES.md`.
- `GET /admin/auditoria` con filtros (tipo de evento, entidad, usuario, resultado, rango de fechas)
  y paginación 10/25/50; responde `{ total, pagina, limite, tiposEvento, registros }` en lugar de
  la lista de los últimos 100 eventos.
- Pantalla de auditoría con filtros, paginación y detalle de valores anterior/nuevo.
- Nueva suite `tests/auditoria.test.js` (AUD-01 a AUD-06). Sin cambios de esquema ni migraciones.

## Administración y recorrido completo sin seed — 2026-10-01

La preparación académica ya no depende del seed. Un administrador puede crear las cuentas, catálogos, alumnos, matrículas, asignaciones y sesiones necesarios para que un docente registre asistencia de principio a fin. Amplía el alcance inicial de US-001/US-014 con gestión de US-002, registro/matrícula de US-005 y asignación/validaciones de US-021/US-022.

### Interfaz y recorrido

- Configuración del primer administrador desde formulario con clave local; inicio con menú según roles.
- Inicio administrativo con pasos del recorrido. Pantallas de usuarios, catálogos, alumnos/matrículas, horarios/sesiones y auditoría.
- Alta de usuarios con varios roles; edición de identificador, roles, actividad y contraseña opcional. La interfaz muestra el perfil docente generado.
- Catálogos de año, grado, sección, curso y aula con alta y listados reales.
- Registro de alumno independiente de su cuenta de login y matrícula por año/grado/sección.
- Matriz semanal filtrable por año y sección/docente/aula; asignación manual y creación de sesiones con fecha.
- Consulta de los últimos 100 eventos de auditoría con detalles expandibles y hora de Lima.
- Formularios con estados de carga, doble envío deshabilitado, errores completos y confirmación de guardado. Adaptación de las nuevas referencias de Figma al flujo real y multirrol.
- Selección docente identifica las secciones por año para evitar ambigüedad entre promociones.
- Restauración de autenticación limpia la cuenta tras 401, incluido cambio de contraseña propia.

### Backend, dominio y consistencia

- Dieciocho nuevas combinaciones método/ruta: dos de instalación y dieciséis administrativas; veintiséis en total.
- Nuevas capas admin de rutas/controllers/services/repositories y esquemas Zod estrictos, respetando la arquitectura existente.
- Instalación inicial única, protegida con INITIAL_SETUP_KEY aleatoria y comparación de tiempo constante. Creación transaccional de roles, cuenta y marcador; sin contraseña administradora predefinida.
- Migración aditiva: Instalacion y Usuario.version; conserva todos los registros anteriores.
- Perfiles Docente/Estudiante creados o reutilizados según rol. Reutilización de Persona por documento y coincidencia de nombres; una sola cuenta por persona.
- Matrícula única por estudiante/año, año derivado de la sección. Referencias existentes y personas activas requeridas.
- Asignación curso/sección/docente y bloque aula/día/horas. Requiere docente con cuenta activa y rol DOCENTE.
- Prevención de solapamientos de docente, aula y sección dentro del año, permitiendo bloques contiguos. Bloqueo transaccional PostgreSQL antes de leer invariantes y guardar; sin asignaciones parciales en un rechazo.
- Sesión única por bloque/fecha, año y día coherentes, horas derivadas del bloque. El padrón sigue obteniéndose de matrículas activas.
- Edición de usuarios con versión, protección del acceso propio y del último administrador activo. Cambio de roles efectivo por petición; desactivación/cambio de contraseña revoca sesiones y conserva perfiles/historial.
- Todos los cambios administrativos guardan RegistroAuditoria en la misma transacción y emiten log después de commit. Se reutiliza la estrategia existente; sin contraseñas, hashes o claves en auditoría/logs/respuestas.

### Instalación, pruebas y documentación

- Setup aplica migraciones sin ejecutar seed, añade la clave inicial a instalaciones anteriores y conserva configuración/datos. Nuevo comando setup:key para el operador local.
- Seed anterior permanece opcional e idempotente, conservando la compatibilidad con la demo previa.
- Dieciocho pruebas nuevas sobre BD vacía sin seed; treinta y ocho en total. Cada suite utiliza una BD efímera y logs aislados. Incluyen instalación/asignación/edición simultáneas, multirrol, permisos, matrícula, fechas, asistencia, revocación y ausencia de secretos.
- Recorrido comprobado por UI con nuevos datos, contrastado con PostgreSQL, auditoría, logs y recarga. Verificados mensajes en 360 px y consola sin errores durante el recorrido.
- README, API, arquitectura y verificación actualizados. Nueva guía clic por clic y script SQL de solo lectura con comprobaciones de coherencia.
- Nuevas evidencias de asistencia recargada y auditoría; las evidencias y datos del recorrido inicial se mantienen.

Las altas y consultas de catálogos, matrículas, bloques y sesiones cubren el recorrido pedido. Sus bajas, traslados y reprogramaciones, así como pagos, calificaciones, justificaciones y recuperación de contraseña, siguen fuera del alcance. No se crea pull request ni se configura despliegue público con esta ampliación.

## Prototipo de arquitectura — 2026-10-01

Implementación inicial del flujo US-001 (autenticación y permisos) + US-014 (asistencia por sesión), sobre la estructura inicial React/Vite y backend vacío. La documentación detallada está en [README](README.md), [arquitectura](docs/ARQUITECTURA.md), [API](docs/API.md) y [verificación](docs/VERIFICACION.md).

### Funcionalidad e interfaz

- Sustitución de la pantalla de ejemplo de Vite por login, selección de sesión, registro y confirmación de asistencia.
- Referencia visual Figma: Inter servida localmente, paleta morada, menú lateral, cabecera, formularios, radios y confirmación con resumen real. Vectores originales incluidos en `frontend/public/figma`.
- Login con identificador/contraseña, validación de campos, credenciales incorrectas y mensajes completos sin truncado ni tooltips.
- Estado de autenticación compartido, restauración de sesión, aviso de expiración, cierre de sesión y vista de acceso restringido según roles.
- Selección de sección, curso, fecha/bloque; contexto de docente, año y aula obtenido de la API.
- Padrón de alumnos leído desde PostgreSQL, sin alumnos hardcodeados en React.
- Un estado por alumno: PRESENTE, TARDANZA o AUSENTE; observación opcional de hasta 300 caracteres.
- Carga, reintento, listas vacías, validaciones, guardado en curso, errores y confirmación con total, distribución, autor e instante.
- Advertencia de cambios pendientes para navegación desde la aplicación y cierre/recarga de página; recarga explícita tras conflicto de versión.
- Diseño adaptable, tabla con desplazamiento horizontal en pantallas pequeñas, etiquetas accesibles, foco visible y reducción de movimiento.

### Backend y seguridad

- API Express ESM con presentación (`routes`, `controllers`, `middleware`), negocio (`services`) y datos (`repositories`, Prisma).
- Ocho endpoints: health, login, me, logout, listado/detalle de sesiones, padrón y guardado de asistencia.
- bcrypt costo 12, comparación de costo equivalente para usuario inexistente, validación de actividad y roles, DTO sin contraseñas ni tokens.
- JWT HS256 con subject, issuer, audience y jti; cookie HttpOnly/SameSite=Lax, Secure en producción, sin almacenamiento de token en localStorage.
- Sesiones de autenticación persistidas con vencimiento y revocación inmediata al cerrar sesión; roles consultados en cada petición.
- `requireAuth` y `requireRole('DOCENTE')`; restricciones backend de acceso a sesiones del propio docente.
- Validación Zod estricta: campos, IDs, lista no vacía/completa, matrícula activa, enum, observación, propiedades extra, duplicados y versión.
- Transacción serializable para guardar toda la asistencia y su auditoría; upsert con restricción única y control de versión para evitar pérdida de cambios concurrentes.
- Errores JSON centralizados con requestId y estados 400/401/403/404/409/413/429/500; sin detalles internos en la interfaz.
- CORS limitado al frontend configurado, cookies con credenciales, Helmet, no-store, límite de body y límite de login por IP.
- Health check con consulta real a PostgreSQL y arranque que verifica disponibilidad de BD.

### Dominio y persistencia

- Esquema Prisma con Persona, Usuario, Rol, UsuarioRol, SesionAuth, Docente, Estudiante, AnioAcademico, Grado, Seccion, Matricula, Curso, CursoSeccionDocente, Aula, CursoSeccionDocenteAula, SesionClase, AsistenciaEstudiante y RegistroAuditoria.
- Persona con perfiles independientes y roles N:M: una misma persona puede tener DOCENTE y APODERADO, sin jerarquía excluyente.
- Se conserva Estudiante del diagrama; `alumnoId` es el nombre del campo en el contrato REST.
- Contexto de asistencia obtenido mediante matrícula, sesión y asignación académica, sin duplicar curso/docente/fecha en cada fila.
- Migración inicial versionada con relaciones, enums, índices y restricciones únicas; configuración Prisma 7 con adaptador PostgreSQL.
- Auditoría reutilizable de creador/modificador y timestamps, separada del historial de eventos de guardado.
- Seed transaccional e idempotente: cuatro roles, Ana Torres DOCENTE, Elena Mendoza APODERADO, cinco alumnos matriculados, Matemática 3.° B, aula A-203 y sesión 02/10/2026 de 08:00 a 08:45.
- Seed con contraseña desde entorno, almacenamiento bcrypt y protección contra ejecución en producción; conserva contraseñas y asistencias existentes.

### Instalación, configuración y herramientas

- Versiones principales fijadas: Node 24.21.0; React/React DOM 19.3.0; Vite 8.3.1; Express 5.2.1; PostgreSQL 18.6; Prisma/client/adapter 7.10.0; Zod 4.6.5; jsonwebtoken 9.0.3; bcrypt 6.0.0; Winston 3.19.0.
- Docker Compose con PostgreSQL 18.6, volumen persistente, healthcheck y puerto enlazado a loopback.
- `.env.example` para raíz, backend y frontend; setup genera únicamente archivos ausentes y un secreto JWT aleatorio.
- Scripts de instalación, desarrollo conjunto, migración, generación, seed, pruebas, lint, build y formato; lockfiles para instalación reproducible mediante npm ci.
- Ayudantes PowerShell para Windows x64: descarga de Node desde el proveedor oficial, verificación SHA256, runtime local `.tools`, instalación e inicio sin alterar Node global.
- Winston crea app.log/error.log automáticamente, formato JSON, rotación, timestamps y contexto; excluye secretos y registra diagnóstico seguro de errores internos.
- ESLint, Prettier, `.nvmrc`, `.gitattributes` y reglas Git que excluyen entornos reales, logs, runtime, dependencias y compilados.
- Correcciones de dependencias transitivas y lockfiles; overrides de deepmerge-ts/mysql2 para herramientas Prisma. PostgreSQL sigue siendo el único motor usado por el producto.
- Eliminación de estilos, imágenes e iconos sin uso del ejemplo inicial de Vite; actualización del título y metadatos de la aplicación.

### Pruebas y evidencias

- 20 pruebas de integración con node:test y Supertest sobre PostgreSQL real, cubriendo éxito, validaciones, 401/403, propiedad de sesión, matrícula ajena, persistencia, duplicados, concurrencia, múltiples roles, tokens, CORS, seed, logout y logs sin secretos.
- Cada ejecución crea una BD temporal de nombre aleatorio, aplica la migración desde cero y elimina exclusivamente esa BD; no reinicia la demo.
- Verificados instalación completa, generación Prisma, migración, seed repetido, arranque, health, flujo manual del navegador, escritura por SQL y conservación al recargar.
- Resultados locales: 20/20 tests aprobados; lint, build, formato y sintaxis correctos; auditorías npm sin vulnerabilidades reportadas al verificar.
- Capturas en `docs/evidencias`: sesión, asistencia recargada, confirmación y mensaje de login completo en ancho reducido.

### Documentación y límites

- README con requisitos, stack, capas, estructura, variables, instalación, scripts, credenciales exclusivamente demo, endpoints, pruebas, logs, solución de problemas y demostración.
- Contrato de API con requests/responses, cookies, validaciones y códigos de error.
- Trazabilidad con Plan, Backlog, modelo de clases, Figma y retroalimentación; decisiones menores y alcance documentados.
- Informe de verificaciones con resultados observados y evidencias.
- Alcance cerrado a Login + Asistencia. Sin pagos, calificaciones, CRUD de matrícula, administración de horarios, justificaciones ni recuperación de contraseña.
- Verificación local; no se configura CI remoto ni despliegue público/AWS/TLS. Producción exige infraestructura, secretos y configuración propios. El limitador de login es de una instancia, en memoria.
