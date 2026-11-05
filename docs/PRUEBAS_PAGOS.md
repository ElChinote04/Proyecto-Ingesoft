# Cómo probar el módulo de pagos

Cubre **US-006** (emitir el compromiso de pago), **US-007A** (historial de boletas)
y **US-007B** (pagar una boleta por pasarela).

Hay tres formas de probarlo, de menos a más esfuerzo. La primera es la que vale
como evidencia para el curso; la tercera es la que conviene tener lista para la
exposición.

---

## 0. Preparación (una sola vez)

Necesitas **Docker Desktop abierto** y los puertos 5432, 3000 y 5173 libres.

> Si tienes el repositorio original corriendo, **deténlo antes**. Los dos usan el
> mismo contenedor de PostgreSQL (`sage-prototipo`) y los mismos puertos.

Abre la carpeta `Proyecto-Ingesoft-pagos` en VS Code y, en una terminal de
PowerShell dentro de ella:

```powershell
. .\scripts\Use-Node.ps1   # deja Node 24.21.0 en el PATH de esta terminal
npm run setup              # crea los .env, instala dependencias y levanta PostgreSQL
```

`npm run setup` crea `backend/.env` a partir de `backend/.env.example`, que ya
incluye las variables nuevas de la pasarela:

```
PAGOS_PROVEEDOR=simulada
PAGOS_MONEDA=PEN
PAGOS_TIMEOUT_MS=10000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=secreto_de_pruebas_simulada
```

Con `PAGOS_PROVEEDOR=simulada` no hace falta ninguna credencial ni salir a
internet.

---

## 1. Pruebas automáticas (lo primero que deberías correr)

```powershell
npm test
```

Cada suite se ejecuta sobre una base de datos efímera propia, que se crea y se
destruye sola. No toca tus datos.

Se ejecutan seis suites; las dos últimas son las del módulo de pagos:

| Suite            | Qué cubre                                                       |
| ---------------- | --------------------------------------------------------------- |
| `api`            | asistencia y sesiones (ya existía)                              |
| `administracion` | gestión de usuarios y catálogos (ya existía)                    |
| `perfiles`       | los cuatro roles y el cambio de contraseña inicial (ya existía) |
| `instalacion`    | alta del primer administrador (ya existía)                      |
| **`pagos`**      | 17 casos sobre US-006, US-007A y US-007B                        |
| **`cronograma`** | 9 casos de la lógica de cronograma, morosidad e idempotencia    |

Lo que verifican los casos nuevos, por historia:

**US-006** — el cronograma se emite completo y dentro de la misma transacción
que la matrícula; queda auditado; solo el administrador puede emitirlo; no se
puede emitir dos veces; se rechazan montos con tres decimales, más de 12 cuotas,
día 31 y campos no declarados en el cuerpo.

**US-007A** — el apoderado ve solo a sus hijos, ordenado por período
descendente; pedir el `estudianteId` de otro devuelve 403; sin boletas devuelve
lista vacía y no un error; la morosidad se calcula sobre la fecha de
vencimiento; sin sesión devuelve 401.

**US-007B** — iniciar el pago devuelve la URL del proveedor y **no** cambia la
boleta; un segundo pago en curso sobre la misma boleta devuelve 409; pagar la
boleta de otro devuelve 403; una notificación con firma inválida devuelve 401 y
no modifica nada; con la confirmación la boleta pasa a PAGADA una sola vez aunque
el evento llegue repetido; un pago rechazado deja la boleta como estaba y permite
reintentar; no se puede pagar dos veces la misma boleta.

Para correr solo una suite mientras desarrollas:

```powershell
cd backend
node --test tests/cronograma.test.js      # no necesita base de datos
```

---

## 2. A mano, con la pasarela simulada

Útil para ver el flujo completo y para capturar pantallas.

En una terminal, levanta la aplicación:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Sage.ps1
```

Abre <http://localhost:5173>, crea el primer administrador y, desde la interfaz,
crea al menos **un año académico activo, un grado y una sección**. El resto lo
hace el script.

En **otra** terminal:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Probar-Pagos.ps1 `
    -AdminUsuario admin@sage.local -AdminClave 'TuClave123!'
```

El script crea un apoderado y un estudiante con un sufijo aleatorio, los vincula,
matricula emitiendo el cronograma, lista el historial, inicia un pago, comprueba
que la boleta **no** cambia antes de la confirmación, confirma, y verifica que el
reenvío de la confirmación no vuelva a aplicarse. Puedes ejecutarlo varias veces
seguidas.

### El atajo de confirmación

Con la pasarela simulada no hay nadie que envíe el webhook, así que existe una
ruta de desarrollo que fija el resultado del proveedor y aplica la confirmación:

```
POST /api/v1/pagos/{id}/simular     { "resultado": "PAGADO" }
```

Acepta `PAGADO`, `RECHAZADO`, `EXPIRADO` y `PENDIENTE`. **Solo se registra cuando
`PAGOS_PROVEEDOR=simulada` y `NODE_ENV` no es production**: en el despliegue real
esa ruta no existe. El camino de verdad, con verificación de firma, es
`POST /api/v1/pagos/notificaciones`, y es el que ejercitan las pruebas
automáticas.

---

## 3. Con Stripe de verdad

Es lo que conviene tener listo para la exposición: demuestra que la integración
con la pasarela es real y no un simulacro. Verificado de extremo a extremo con
una cuenta de prueba y moneda PEN.

### 3.1 Cuenta y llave

No hace falta crear una cuenta nueva ni verificar la empresa: esa verificación
es para cobrar dinero real y aquí nunca se sale del modo de prueba. Basta
cualquier cuenta de Stripe con su entorno de prueba.

La **clave secreta** (`sk_test_...`) está en **Desarrolladores → Claves de API**.
Pulsa _Revelar_ para verla completa. La clave publicable no se usa: con Checkout
la tarjeta se captura en el dominio de Stripe, que es lo que mantiene a SAGE
fuera del alcance de PCI DSS (AC015).

### 3.2 La CLI de Stripe

Stripe vive en internet y el backend en `localhost`, así que Stripe no puede
entregar el webhook directamente. La CLI abre ese túnel:

```
Stripe  ->  stripe listen (tu PC)  ->  localhost:3000
```

Si no la tienes, bájala de <https://github.com/stripe/stripe-cli/releases>,
descomprímela y ejecútala con su ruta completa; no hace falta añadirla al PATH.

```powershell
stripe login
stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:3000/api/v1/pagos/notificaciones
```

Tres cosas que cuestan un rato si no se saben:

- **Las versiones recientes exigen `--events`.** Sin esa bandera la CLI se niega
  a arrancar. Copia la lista completa de arriba: si dejas puntos suspensivos, la
  CLI avisa `"..." isn't a valid event` y el evento que importa puede no
  registrarse.
- **`stripe listen` es un proceso que se queda corriendo**, como el backend. No
  es un comando que ejecutas y termina. Si cierras esa ventana, el túnel
  desaparece y los pagos se quedan en `PROCESANDO` para siempre, porque la
  confirmación nunca llega.
- **El `whsec_` que imprime al arrancar** es el que va en el `.env`. Si
  reinicias la CLI, comprueba que sigue siendo el mismo.

### 3.3 Configuración y arranque

En `backend/.env` — no en `.env.example`, y asegúrate de que es el de este
repositorio y no el del original:

```
PAGOS_PROVEEDOR=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

La línea de `PAGOS_PROVEEDOR` es la que realmente cambia de proveedor: con las
llaves puestas pero `simulada`, se sigue usando la pasarela falsa.

El `.env` se lee **una sola vez al arrancar**, así que reinicia el backend
después de editarlo, y comprueba que quedó guardado:

```powershell
Get-Content .\backend\.env | Select-String '^PAGOS_PROVEEDOR|^STRIPE_'
```

> **Cuidado con las variables de entorno.** Si en esa terminal definiste
> `$env:STRIPE_WEBHOOK_SECRET` o similar, ese valor **gana** sobre el `.env`,
> porque dotenv no sobrescribe lo que ya está en el proceso. Si no cuadran las
> cosas, arranca el backend desde una terminal nueva y limpia.

### 3.4 La prueba

Con las tres terminales en marcha —`stripe listen`, `Start-Sage.ps1` y una
libre— lanza el recorrido de siempre:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Probar-Pagos.ps1 -AdminUsuario <admin> -AdminClave '<clave>'
```

El script detecta solo que está en modo Stripe: en vez de usar el atajo
`/simular`, abre el navegador en la página real de Stripe y se queda consultando
`GET /pagos/{id}` hasta que el webhook confirme.

Paga con `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC. La
`4000 0000 0000 0002` la rechaza y la `4000 0025 0000 3155` exige autenticación
adicional del titular, que es el criterio de aceptación de US-007B sobre
verificación adicional.

Si la URL de checkout empieza por `https://checkout.stripe.com/` estás en
Stripe; si sale `http://localhost:5173/...?simulado=` sigues en la falsa.

> Stripe no da de alta negocios peruanos para cobros reales. Para el curso no
> importa, porque nunca se sale del modo de prueba. Si lo preguntan: en
> producción se sustituiría el adaptador por Culqi o Niubiz, y por eso la
> integración está detrás de la interfaz `IPasarelaPagos` (ADR-002 del Documento
> de Arquitectura).

---

## Qué mirar para comprobar que funcionó

**En la base de datos** (pgAdmin, DBeaver o la extensión de VS Code, contra
`localhost:5432`, base `sage`, usuario `sage`):

```sql
-- el cronograma emitido
SELECT b.periodo, b.monto, b."fechaVencimiento", b.estado
FROM "CompromisoPago" b
JOIN "PlanPago" p ON p.id = b."planPagoId"
ORDER BY b.periodo;

-- los intentos de pago y su referencia con el proveedor
SELECT id, referencia, "referenciaExterna", estado, "confirmadoEn", "motivoRechazo"
FROM "Pago" ORDER BY id DESC;

-- la traza de auditoría
SELECT "fechaHora", "tipoEvento", "entidadId", detalle
FROM "RegistroAuditoria"
WHERE "tipoEvento" LIKE 'PAGO%' OR "tipoEvento" = 'COMPROMISO_PAGO_EMITIDO'
ORDER BY "fechaHora" DESC;
```

**En los logs**: `backend/logs/`, eventos `COMPROMISO_PAGO_EMITIDO`,
`PAGO_INICIADO`, `PAGO_CONFIRMADO` y `PAGO_NO_COMPLETADO`.

**La comprobación que más vale la pena enseñar** es la de envíos duplicados, que
está garantizada por la base de datos y no por el código. Con un pago en curso,
intenta insertar otro a mano:

```sql
INSERT INTO "Pago"("compromisoPagoId","referencia","monto","estado","proveedor","iniciadoPorId","modificadoEn")
VALUES (<idBoleta>, 'prueba-manual', 350.00, 'INICIADO', 'simulada', 1, now());
```

Debe fallar con `duplicate key value violates unique constraint
"Pago_en_curso_unico_por_boleta"`. Ese índice parcial es lo que realmente cumple
el criterio «evita envíos duplicados» de US-007B: la comprobación previa en el
servicio puede perder la carrera entre dos clics simultáneos, el índice no.

---

## 4. Desde la pantalla, como lo hará el apoderado

Los recorridos anteriores llaman a la API directamente. Esta es la misma
secuencia, pero por la interfaz, que es lo que conviene enseñar en la
sustentación.

1. Levanta todo con `npm run dev` (backend en 3000 y frontend en 5173).
2. Entra en `http://localhost:5173` con la cuenta de un apoderado que tenga un
   estudiante matriculado y con plan de pago emitido. Si no tienes una,
   `scripts\Probar-Pagos.ps1` crea una y te imprime sus credenciales al final.
3. En el menú lateral aparece **Pagos y boletas**. Verás el saldo pendiente, las
   boletas vencidas, el próximo vencimiento y el cronograma completo con sus
   filtros.
4. Pulsa **Pagar** en cualquier boleta pendiente. Un diálogo muestra alumno,
   concepto, vencimiento, estado y monto; al confirmar, el navegador sale hacia
   la pasarela. La boleta sigue en «Pendiente» mientras tanto, que es lo
   correcto, y en el historial aparece «Pago en proceso · ver» en lugar del
   botón, para retomar o cancelar ese intento.
5. Al volver, la pantalla de resultado consulta el pago cada tres segundos hasta
   que llega la confirmación del webhook. Con `PAGOS_PROVEEDOR=simulada` no hay
   cobro real, así que esa pantalla muestra en desarrollo dos botones para fijar
   el resultado y cerrar el recorrido.

Si vuelves sin pagar (el botón «atrás» de Stripe), la pantalla lo detecta y
ofrece **retomar el pago** con el mismo enlace o **cancelar el intento**.
Cancelar es lo que permite volver a pagar esa boleta enseguida: sin eso habría
que esperar a que Stripe expire la sesión, que son 24 horas. Antes de cancelar,
el servidor le pregunta al proveedor si el cobro se hizo; si se hizo, confirma
el pago en lugar de cancelarlo y responde 409.

---

## Problemas frecuentes

| Síntoma                                            | Causa y solución                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm` no se reconoce                               | Ejecuta `. .\scripts\Use-Node.ps1` en esa terminal (con el punto y el espacio al inicio).                     |
| `Docker no esta disponible`                        | Abre Docker Desktop y espera a que termine de iniciar.                                                        |
| `TEST_DATABASE_URL debe terminar en _test`         | Falta la variable en `backend/.env`. Cópiala de `backend/.env.example`.                                       |
| El puerto 5432, 3000 o 5173 está ocupado           | Tienes el repositorio original corriendo. Deténlo con Ctrl+C.                                                 |
| `PASARELA_NO_DISPONIBLE` (503) con Stripe          | La llave es incorrecta o no hay salida a internet. Con `PAGOS_PROVEEDOR=simulada` no debería ocurrir.         |
| La boleta no pasa a PAGADA                         | Es el comportamiento correcto hasta que la pasarela confirme. Usa `/pagos/{id}/simular` o paga en Stripe.     |
| `PAGO_EN_CURSO` (409) al reintentar                | Ya hay un pago `INICIADO` o `PROCESANDO` sobre esa boleta. Conclúyelo o márcalo como `RECHAZADO`.             |
| `scripts\...ps1 no existe`                         | Estás fuera de la carpeta del proyecto. Haz `cd` a `Proyecto-Ingesoft-pagos` o usa la ruta completa.          |
| `la ejecución de scripts está deshabilitada`       | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` en esa terminal.                                 |
| `stripe` no se reconoce                            | La CLI no está instalada o no está en el PATH. Ejecútala con su ruta completa.                                |
| `must specify events to forward`                   | Falta `--events` con la lista completa de la sección 3.2.                                                     |
| El pago queda en `PROCESANDO` para siempre         | La ventana de `stripe listen` no estaba abierta al pagar, o el `whsec_` no coincide. Mira su salida.          |
| `stripe listen` responde `[401]`                   | El `whsec_` del backend no es el de esa sesión de la CLI. Revisa el `.env` y las variables de entorno.        |
| Acentos rotos (`Pensi?n`) en la página de Stripe   | PowerShell 5.1 envía el cuerpo en ISO-8859-1 si el `Content-Type` no declara `charset=utf-8`.                 |
| Vuelves de la pasarela a la portada, sin resultado | Tu `FRONTEND_URL` apunta a otro puerto, o el backend es anterior al arreglo de las URL con `/#/`.             |
| `PAGO_EN_CURSO` (409) tras salir del checkout      | Entra al pago desde la pantalla de resultado y pulsa «Cancelar este intento», o llama a `DELETE /pagos/{id}`. |
