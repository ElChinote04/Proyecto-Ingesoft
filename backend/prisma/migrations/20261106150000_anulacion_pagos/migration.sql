-- US-013: anulación o corrección de un pago registrado por error.
-- El pago no se borra: pasa a ANULADO con quién, cuándo y por qué.
ALTER TYPE "EstadoPago" ADD VALUE 'ANULADO';

ALTER TABLE "Pago" ADD COLUMN "anuladoEn" TIMESTAMP(3),
ADD COLUMN "anuladoPorId" INTEGER,
ADD COLUMN "motivoAnulacion" VARCHAR(300);

ALTER TABLE "Pago" ADD CONSTRAINT "Pago_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El comprobante de un pago anulado se conserva marcado como anulado, y la
-- boleta puede recibir uno nuevo cuando se vuelva a pagar. Por eso la unicidad
-- por boleta pasa a valer solo para el comprobante vigente.
ALTER TABLE "Comprobante" ADD COLUMN "anuladoEn" TIMESTAMP(3);

DROP INDEX "Comprobante_compromisoPagoId_key";
CREATE INDEX "Comprobante_compromisoPagoId_idx" ON "Comprobante"("compromisoPagoId");
CREATE UNIQUE INDEX "Comprobante_compromisoPagoId_vigente" ON "Comprobante"("compromisoPagoId")
    WHERE "anuladoEn" IS NULL;
