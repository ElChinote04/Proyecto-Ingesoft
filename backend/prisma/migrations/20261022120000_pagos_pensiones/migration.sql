-- Módulo de pagos de pensiones: US-006 (emisión del compromiso), US-007A
-- (historial de boletas) y US-007B (pago mediante pasarela).

-- CreateEnum
CREATE TYPE "EstadoBoleta" AS ENUM ('PENDIENTE', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('INICIADO', 'PROCESANDO', 'CONFIRMADO', 'RECHAZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "PlanPago" (
    "id" SERIAL NOT NULL,
    "matriculaId" INTEGER NOT NULL,
    "montoPension" DECIMAL(10,2) NOT NULL,
    "numeroCuotas" INTEGER NOT NULL,
    "diaVencimiento" INTEGER NOT NULL,
    "mesInicio" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompromisoPago" (
    "id" SERIAL NOT NULL,
    "planPagoId" INTEGER NOT NULL,
    "numeroCuota" INTEGER NOT NULL,
    "concepto" VARCHAR(120) NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "estado" "EstadoBoleta" NOT NULL DEFAULT 'PENDIENTE',
    "pagadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompromisoPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "compromisoPagoId" INTEGER NOT NULL,
    "referencia" VARCHAR(64) NOT NULL,
    "referenciaExterna" VARCHAR(255),
    "monto" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoPago" NOT NULL DEFAULT 'INICIADO',
    "proveedor" VARCHAR(40) NOT NULL,
    "motivoRechazo" VARCHAR(200),
    "confirmadoEn" TIMESTAMP(3),
    "iniciadoPorId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPago_matriculaId_key" ON "PlanPago"("matriculaId");

-- CreateIndex
CREATE UNIQUE INDEX "CompromisoPago_planPagoId_numeroCuota_key" ON "CompromisoPago"("planPagoId", "numeroCuota");

-- CreateIndex
CREATE INDEX "CompromisoPago_estado_fechaVencimiento_idx" ON "CompromisoPago"("estado", "fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_referencia_key" ON "Pago"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_referenciaExterna_key" ON "Pago"("referenciaExterna");

-- CreateIndex
CREATE INDEX "Pago_compromisoPagoId_estado_idx" ON "Pago"("compromisoPagoId", "estado");

-- AddForeignKey
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompromisoPago" ADD CONSTRAINT "CompromisoPago_planPagoId_fkey" FOREIGN KEY ("planPagoId") REFERENCES "PlanPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_compromisoPagoId_fkey" FOREIGN KEY ("compromisoPagoId") REFERENCES "CompromisoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_iniciadoPorId_fkey" FOREIGN KEY ("iniciadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un único pago en curso por boleta. Es la garantía real frente a dos
-- solicitudes simultáneas del mismo apoderado: la comprobación previa en el
-- servicio puede perder la carrera, este índice no (US-007B: "evita envíos
-- duplicados"). Prisma no modela índices parciales, por eso va en SQL.
CREATE UNIQUE INDEX "Pago_en_curso_unico_por_boleta"
    ON "Pago"("compromisoPagoId")
    WHERE "estado" IN ('INICIADO', 'PROCESANDO');

-- El monto siempre es positivo y la cuota pertenece al rango pactado.
ALTER TABLE "CompromisoPago" ADD CONSTRAINT "CompromisoPago_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_cuotas_rango" CHECK ("numeroCuotas" BETWEEN 1 AND 12);
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_dia_rango" CHECK ("diaVencimiento" BETWEEN 1 AND 28);
ALTER TABLE "PlanPago" ADD CONSTRAINT "PlanPago_mes_rango" CHECK ("mesInicio" BETWEEN 1 AND 12);
