# Auditoría de transacciones críticas (US-003)

Guía para los módulos que registran **notas** (Gestión Académica) y **pagos** (Matrícula y Pagos).
El módulo de Seguridad y Acceso ofrece una función para dejar constancia de cada cambio: quién lo
hizo, cuándo, qué valor había antes, cuál quedó y por qué. El administrador lo consulta en
**Administración → Auditoría**, y nadie puede editar ni borrar esos registros.

## 1. Qué importar

```js
import { registrarTransaccionCritica } from './auditoria.service.js'; // desde backend/src/services/
```

## 2. Dónde llamarla

En **tu service**, **dentro de la misma transacción** en la que guardas la nota o el pago, pasando
el mismo `db`. Así, si la operación falla, el registro de auditoría tampoco se guarda, y al revés.

```js
await repository.transaction(async (db) => {
  const nota = await repository.actualizarNota(id, { nivelLogro: 'A' }, db);
  await registrarTransaccionCritica(db, {
    actorId: actor.id, // usuario que hace el cambio (null si es un proceso automático)
    evento: 'NOTA_MODIFICADA', // uno de la tabla de abajo
    entidad: 'Calificacion', // nombre de tu modelo
    entidadId: nota.id,
    anterior: { nivelLogro: 'B' }, // valores antes del cambio
    nuevo: { nivelLogro: 'A' }, // valores después
    motivo: 'Rectificación aprobada por coordinación',
    requestId, // el que recibes del controller (req.requestId)
  });
});
```

Campos opcionales: `contexto` (datos extra, por ejemplo `{ referencia, proveedor }`) y `resultado`
(`'EXITO'` por defecto; `'FALLO'` o `'DENEGADO'` si la operación no se completó).

## 3. Eventos disponibles

| Módulo    | Evento                       | Cuándo                                      | Exige `anterior`, `nuevo` y `motivo`   |
| --------- | ---------------------------- | ------------------------------------------- | -------------------------------------- |
| Académica | `NOTA_REGISTRADA`            | Primera calificación de un alumno           | No (envía `nuevo`)                     |
| Académica | `NOTA_MODIFICADA`            | Cambio de una calificación existente        | **Sí**                                 |
| Académica | `NOTA_PUBLICADA`             | Publicación de resultados del periodo       | No                                     |
| Pagos     | `COMPROMISO_PAGO_EMITIDO`    | Se genera el compromiso de pago             | No (envía `nuevo`)                     |
| Pagos     | `COMPROMISO_PAGO_MODIFICADO` | Cambio de monto o cronograma                | **Sí**                                 |
| Pagos     | `PAGO_INICIADO`              | Se inicia un pago                           | No (envía `nuevo`)                     |
| Pagos     | `PAGO_CONFIRMADO`            | La pasarela confirma el pago                | No (recomendado: estado antes/después) |
| Pagos     | `PAGO_NO_COMPLETADO`         | Pago rechazado o cancelado                  | No (recomendado: estado antes/después) |
| Pagos     | `PAGO_ANULADO`               | Anulación o corrección por el administrador | **Sí**                                 |

Si necesitas un evento nuevo, pídelo al módulo de Seguridad y Acceso: se agrega a
`EVENTOS_CRITICOS` en `auditoria.service.js`. Un evento fuera de la lista, o una modificación sin
`anterior`, `nuevo` y `motivo`, lanza un error y revierte tu transacción: es un error de
programación que debe verse en las pruebas, no en producción.

## 4. Para el módulo de Pagos

Tus cuatro eventos actuales (`COMPROMISO_PAGO_EMITIDO`, `PAGO_INICIADO`, `PAGO_CONFIRMADO`,
`PAGO_NO_COMPLETADO`) conservan su nombre. Solo reemplaza `repository.audit(db, usuarioId, evento,
entidadId, detalle, extra)` por `registrarTransaccionCritica(db, { ... })`, moviendo tu `detalle`
actual a `nuevo` o `contexto`. Tu resultado `'FALLO'` ya está admitido.

## 5. Cómo comprobarlo

- En tus pruebas: después de la operación, `GET /api/v1/admin/auditoria?tipoEvento=NOTA_MODIFICADA`
  como administrador debe devolver el registro con `detalle.anterior`, `detalle.nuevo` y `detalle.motivo`.
- En la aplicación: Administración → Auditoría, filtrando por el tipo de evento.
- Referencia de pruebas: `backend/tests/auditoria.test.js` (AUD-01 a AUD-06).
