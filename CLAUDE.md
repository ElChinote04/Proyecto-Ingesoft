# SAGE — contexto para asistentes de código

Sistema Académico de Gestión Educativa. Proyecto del curso 1INF28 Ingeniería de
Software, PUCP, equipo IngeSuaves. Diez integrantes repartidos en cinco parejas,
una por módulo de negocio.

Este archivo describe cómo está construido el sistema y qué convenciones hay que
respetar. Las reglas completas están en `Estándares de Programación - SAGE` y el
diseño en el `Documento de Arquitectura de SAGE`; aquí está lo que se necesita
para no romper nada al tocar el código.

## Stack

Node 24.21.0 · React 19 + Vite (frontend) · Express 5 (backend) · PostgreSQL 18.6
en Docker · Prisma 7.10 con `@prisma/adapter-pg` · Zod 4 · Winston.

El backend es JavaScript ESM puro, sin paso de compilación.

## Comandos

```bash
npm run setup      # crea los .env, instala dependencias y levanta PostgreSQL
npm run dev        # backend (3000) y frontend (5173)
npm test           # pruebas del backend
npm run lint       # OJO: hoy solo cubre el frontend
npm run format     # Prettier sobre todo el repositorio
```

En Windows, `scripts/Start-Sage.ps1` hace setup, migraciones y arranque en un
paso. Antes de usar npm en una terminal nueva: `. .\scripts\Use-Node.ps1`.

Las pruebas crean una base efímera por suite y la destruyen al terminar;
`TEST_DATABASE_URL` debe acabar en `_test` o el runner se niega a ejecutar. Las
suites están listadas en `backend/scripts/test.js`.

## Arquitectura del backend

Tres capas, y la dependencia va en un solo sentido:

```
routes → controllers → services → repositories → Prisma → PostgreSQL
                ↑                      ↑
            validators            integrations
```

| Carpeta         | Hace                                                 | No hace                         |
| --------------- | ---------------------------------------------------- | ------------------------------- |
| `routes/`       | Declara rutas, métodos y middleware                  | Reglas de negocio               |
| `middleware/`   | Autenticación, autorización, errores                 | Lógica de un caso de uso        |
| `validators/`   | Esquemas Zod de entrada                              | Consultar la base               |
| `controllers/`  | Leer params/query/body, llamar al service, responder | Tocar Prisma, resolver reglas   |
| `services/`     | Casos de uso, reglas, transacciones                  | Construir respuestas HTTP       |
| `repositories/` | Consultas y transacciones con Prisma                 | Decidir permisos o códigos HTTP |
| `integrations/` | Adaptadores de sistemas externos                     | Reglas de negocio               |
| `domain/`       | Reglas puras, sin infraestructura                    | Entrada/salida de ningún tipo   |

**Prisma se usa únicamente desde `repositories/`.** Es la regla que más se
incumple sin querer y la que más cuesta deshacer.

Los archivos se nombran `recurso.responsabilidad.js`: `pagos.service.js`,
`pagos.repository.js`. Hay archivos antiguos con otra convención
(`adminService.js`); los nuevos siguen la de arriba.

## Patrones que hay que respetar

**Respuestas uniformes.** Éxito `{ "data": ... }`, error
`{ "error": { "codigo", "mensaje", "detalles", "requestId" } }`. Nunca se
devuelve `success`, ni trazas, ni mensajes del driver.

**Errores.** Se lanzan con `new AppError(status, code, message, details)` desde
el service; `middleware/errorHandler.js` los convierte en respuesta. Un error no
controlado sale como 500 genérico y se registra con su traza.

**Validación.** `validate(esquema, 'body' | 'params' | 'query')` como middleware;
el resultado queda en `req.validated`. Todos los esquemas son `.strict()`: un
campo no declarado se rechaza con 400 en lugar de ignorarse. No se aceptan del
cliente identificadores de usuario, roles ni estados que el servidor pueda
derivar de la sesión.

**Autenticación.** Cookie `sage_session` con el JWT, `HttpOnly`, `SameSite=Lax`,
`Secure` en producción. El frontend nunca lee el token. El porqué está en el
ADR-001 del Documento de Arquitectura. `requireAuth` y `requireRole(rol)` en
`middleware/auth.js`.

**Mutaciones con auditoría.** En `adminService.js` existe el helper
`mutation(actor, requestId, EVENTO, async (db) => ({ data, detail }))`: abre una
transacción, ejecuta la operación y escribe el registro de auditoría **dentro de
la misma transacción**. Toda operación que modifique datos críticos debe
auditarse así; no vale auditar después.

**Concurrencia.** Las reglas que no pueden perder una carrera se garantizan en la
base de datos, no en el código: restricciones únicas, índices parciales y
transacciones. La comprobación previa en el service es para dar un mensaje
decente, no para garantizar nada.

**Nada de `sleep` para coordinar.** Ni en código ni en pruebas.

## Contrato de la API

Base `/api/v1`. Las reglas completas están en la sección 13 del Documento de
Arquitectura; en resumen:

- Recursos en plural y minúsculas, con guion: `/bloques-horario`,
  `/compromisos-pago`. Ninguna ruta contiene verbos ni acciones.
- El rol **no** forma parte de la ruta. Un recurso tiene una sola ruta y el
  alcance lo resuelve el middleware de autorización. Los prefijos `/admin` y
  `/portal` que quedan en el código son deuda pendiente de corregir.
- `GET` consulta, `POST` crea, `PUT` reemplaza con identificador en la ruta,
  `PATCH` cambia parte, `DELETE` da de baja.
- Códigos: 200, 201, 204, 400, 401, 403, 404, 409, 500, 503.
- Salida mínima: solo los campos que consume la pantalla. Nunca hashes, tokens ni
  entidades anidadas completas.

## Módulo de pagos

Implementa US-006 (emitir el compromiso), US-007A (historial de boletas) y
US-007B (pagar por pasarela), con backend y pantallas. Está verificado de
extremo a extremo contra Stripe Checkout en modo de prueba. Detalles operativos
en `docs/PRUEBAS_PAGOS.md`.

El frontend son dos pantallas: `pages/Pagos.jsx` (boletas, filtros y el botón
que lleva al checkout) y `pages/ResultadoPago.jsx` (retorno de la pasarela, que
sondea `GET /pagos/:id` hasta que el webhook aplica la confirmación). La
aplicación enruta por hash, así que las URL de retorno que el backend entrega al
proveedor llevan `/#/`.

Cinco decisiones que conviene no deshacer sin entenderlas:

**El pago ocurre en dos fases.** `POST /pagos` crea el pago en `INICIADO`
_antes_ de llamar al proveedor y devuelve la URL de checkout; la boleta no
cambia. `POST /pagos/notificaciones` aplica la confirmación, y solo después de
verificar la firma HMAC **y consultar el estado real al proveedor**, porque el
contenido de una notificación que llega por la red pública no es fuente de
verdad.

**Dos referencias, no una.** `referencia` la genera SAGE antes de contactar al
proveedor —es lo que permite recuperar un pago si la pasarela se cae a medio
camino— y `referenciaExterna` es el identificador del proveedor. La idempotencia
se resuelve sobre la primera.

**Un índice único parcial** impide dos pagos en curso sobre la misma boleta:
`CREATE UNIQUE INDEX ... ON "Pago"("compromisoPagoId") WHERE "estado" IN
('INICIADO','PROCESANDO')`. Prisma no modela índices parciales, por eso vive en
el SQL de la migración. Es la garantía real de «evita envíos duplicados».

**El estado MOROSA no se almacena**: se deriva de `fechaVencimiento` al
consultar. Si fuera un estado guardado haría falta un proceso programado que lo
actualice, y entre el vencimiento y esa ejecución el sistema mentiría.

**Un intento abandonado se cierra a mano.** Si el apoderado sale del checkout
sin pagar, el índice parcial le impide volver a intentarlo hasta que el pago
anterior deje de estar en curso, y Stripe tarda 24 horas en expirar la sesión
por su cuenta. Por eso existe `DELETE /pagos/:id`: consulta primero al proveedor
—si resulta que sí cobró, confirma en vez de cancelar— y solo entonces cierra el
intento.

El proveedor está detrás del adaptador `integrations/pasarelaPagos.js`, con dos
implementaciones de la misma interfaz: `stripe` y `simulada`. `PAGOS_PROVEEDOR`
elige. Las pruebas usan siempre la simulada, así que corren sin credenciales ni
red. La ruta `POST /pagos/:id/simular` solo se registra con la pasarela simulada
y fuera de producción.

## Estado actual

Implementado: acceso y roles, gestión de usuarios, catálogos, estudiantes,
matrícula, horarios, sesiones, asistencia, auditoría y el módulo de pagos.

Pendiente: evaluación por competencias, justificaciones de inasistencia,
reportes, y la boleta en PDF (US-009).

## Cosas que no hay que hacer

- Tocar Prisma fuera de `repositories/`.
- Cambiar `schema.prisma` sin generar la migración y actualizar el código en el
  mismo pull request. Hay un precedente reciente de lo que ocurre: un cambio de
  esquema sin migración ni código dejó `main` sin arrancar.
- Versionar `.env`. Las variables nuevas se documentan en `.env.example`, que sí
  se versiona.
- Dejar `console.log`, imports sin usar o código comentado.
- Añadir una funcionalidad sin al menos una prueba del camino correcto y otra de
  datos inválidos.

## Verificación antes de integrar

```bash
npm run format:check
npm run lint
npm test
```

La lista completa de revisión de pull request está en la sección 16.3 de los
Estándares de Programación. El backend todavía no tiene ESLint configurado: es
una tarea pendiente y la causa de que varias desviaciones del contrato REST
llegaran a la entrega sin detectarse.
