-- US-010: pagos parciales o en cuotas. Una boleta puede fraccionarse en
-- varias boletas hijas; mientras no se paguen todas, la original queda PARCIAL.
ALTER TYPE "EstadoBoleta" ADD VALUE 'PARCIAL' BEFORE 'PAGADA';

ALTER TABLE "CompromisoPago" ADD COLUMN "boletaOrigenId" INTEGER;
ALTER TABLE "CompromisoPago" ADD COLUMN "numeroFraccion" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "CompromisoPago_planPagoId_numeroCuota_key";
CREATE UNIQUE INDEX "CompromisoPago_planPagoId_numeroCuota_numeroFraccion_key" ON "CompromisoPago"("planPagoId", "numeroCuota", "numeroFraccion");
CREATE INDEX "CompromisoPago_boletaOrigenId_idx" ON "CompromisoPago"("boletaOrigenId");

ALTER TABLE "CompromisoPago" ADD CONSTRAINT "CompromisoPago_boletaOrigenId_fkey" FOREIGN KEY ("boletaOrigenId") REFERENCES "CompromisoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
