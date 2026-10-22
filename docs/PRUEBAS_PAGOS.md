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
con la pasarela es real y no un simulacro.

1. Crea una cuenta en <https://dashboard.stripe.com>. **No hace falta activarla
   ni dar datos de empresa** para usar el modo de prueba.
2. Copia la llave secreta de prueba (empieza con `sk_test_`).
3. Instala la CLI de Stripe y deja corriendo el reenvío del webhook:

   ```powershell
   stripe login
   stripe listen --forward-to localhost:3000/api/v1/pagos/notificaciones
   ```

   Ese comando imprime un secreto de firma que empieza con `whsec_`.

4. En `backend/.env`:

   ```
   PAGOS_PROVEEDOR=stripe
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

5. Reinicia el backend, inicia un pago con `POST /api/v1/pagos` y abre en el
   navegador la `urlCheckout` que devuelve. Paga con la tarjeta de prueba
   `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC.
6. Stripe envía el evento, la CLI lo reenvía a tu backend, el backend verifica la
   firma, consulta el estado real y marca la boleta como pagada.

Tarjetas útiles para probar los otros caminos: `4000 0000 0000 0002` la rechaza,
y `4000 0025 0000 3155` exige autenticación adicional del titular, que es el
criterio de aceptación de US-007B sobre verificación adicional.

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

## Problemas frecuentes

| Síntoma                                    | Causa y solución                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `npm` no se reconoce                       | Ejecuta `. .\scripts\Use-Node.ps1` en esa terminal (con el punto y el espacio al inicio).                 |
| `Docker no esta disponible`                | Abre Docker Desktop y espera a que termine de iniciar.                                                    |
| `TEST_DATABASE_URL debe terminar en _test` | Falta la variable en `backend/.env`. Cópiala de `backend/.env.example`.                                   |
| El puerto 5432, 3000 o 5173 está ocupado   | Tienes el repositorio original corriendo. Deténlo con Ctrl+C.                                             |
| `PASARELA_NO_DISPONIBLE` (503) con Stripe  | La llave es incorrecta o no hay salida a internet. Con `PAGOS_PROVEEDOR=simulada` no debería ocurrir.     |
| La boleta no pasa a PAGADA                 | Es el comportamiento correcto hasta que la pasarela confirme. Usa `/pagos/{id}/simular` o paga en Stripe. |
| `PAGO_EN_CURSO` (409) al reintentar        | Ya hay un pago `INICIADO` o `PROCESANDO` sobre esa boleta. Conclúyelo o márcalo como `RECHAZADO`.         |
