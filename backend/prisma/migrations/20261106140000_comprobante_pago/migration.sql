-- US-009: comprobante de pago. Uno por boleta pagada; el id es el correlativo.
CREATE TABLE "Comprobante" (
    "id" SERIAL NOT NULL,
    "serie" VARCHAR(4) NOT NULL DEFAULT 'B001',
    "pagoId" INTEGER NOT NULL,
    "compromisoPagoId" INTEGER NOT NULL,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Comprobante_pagoId_key" ON "Comprobante"("pagoId");
CREATE UNIQUE INDEX "Comprobante_compromisoPagoId_key" ON "Comprobante"("compromisoPagoId");

ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_compromisoPagoId_fkey" FOREIGN KEY ("compromisoPagoId") REFERENCES "CompromisoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las boletas pagadas antes de esta migración reciben su comprobante, en el
-- orden en que se confirmaron, para que ninguna quede sin uno.
INSERT INTO "Comprobante" ("pagoId", "compromisoPagoId", "emitidoEn")
SELECT "id", "compromisoPagoId", "emitidoEn"
FROM (
    SELECT DISTINCT ON (p."compromisoPagoId")
        p."id", p."compromisoPagoId", COALESCE(p."confirmadoEn", p."modificadoEn") AS "emitidoEn"
    FROM "Pago" p
    WHERE p."estado" = 'CONFIRMADO'
    ORDER BY p."compromisoPagoId", p."confirmadoEn"
) confirmados
ORDER BY "emitidoEn", "id";
