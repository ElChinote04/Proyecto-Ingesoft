import { prisma } from '../config/database.js';

export const transaction = (fn) => prisma.$transaction(fn);

export const audit = (db, usuarioId, tipoEvento, entidadId, detalle, extra = {}) =>
  db.registroAuditoria.create({
    data: { usuarioId, tipoEvento, entidadId, detalle, ...extra },
  });

// ------------------------------------------------------------ planes y boletas
export const buscarPlanPorMatricula = (matriculaId, db = prisma) =>
  db.planPago.findUnique({ where: { matriculaId } });

export const crearPlanConBoletas = (datosPlan, cuotas, db = prisma) =>
  db.planPago.create({
    data: { ...datosPlan, boletas: { create: cuotas } },
    include: { boletas: { orderBy: { numeroCuota: 'asc' } } },
  });

export const buscarMatricula = (matriculaId, db = prisma) =>
  db.matricula.findUnique({
    where: { id: matriculaId },
    include: { anioAcademico: true, estudiante: { include: { persona: true } } },
  });

const EN_CURSO = ['INICIADO', 'PROCESANDO'];

const boletaInclude = {
  // Como mucho uno, por el índice único parcial sobre los pagos en curso.
  pagos: { where: { estado: { in: EN_CURSO } }, select: { id: true, iniciadoPorId: true } },
  // El comprobante vigente; los de pagos anulados (US-013) se conservan aparte.
  comprobantes: { where: { anuladoEn: null }, select: { id: true, serie: true, pagoId: true } },
  // US-010: avance de una boleta fraccionada y total de partes de una fracción.
  fracciones: { select: { estado: true, monto: true } },
  boletaOrigen: { select: { _count: { select: { fracciones: true } } } },
  planPago: {
    include: {
      matricula: {
        include: {
          anioAcademico: true,
          estudiante: { include: { persona: true } },
        },
      },
    },
  },
};

export async function listarBoletas(
  { estudianteIds, estudianteId, estado, morosaAntesDe },
  pagina,
  limite,
) {
  const where = {
    planPago: {
      matricula: {
        estudianteId: estudianteId ?? (estudianteIds ? { in: estudianteIds } : undefined),
      },
    },
    ...(estado && !['PENDIENTE', 'MOROSA'].includes(estado) && { estado }),
    // MOROSA no es un estado almacenado: es una boleta PENDIENTE ya vencida, y
    // por eso PENDIENTE excluye las vencidas.
    ...(estado === 'PENDIENTE' && {
      estado: 'PENDIENTE',
      fechaVencimiento: { gte: morosaAntesDe },
    }),
    ...(estado === 'MOROSA' && { estado: 'PENDIENTE', fechaVencimiento: { lt: morosaAntesDe } }),
  };
  const [total, registros] = await prisma.$transaction([
    prisma.compromisoPago.count({ where }),
    prisma.compromisoPago.findMany({
      where,
      skip: (pagina - 1) * limite,
      take: limite,
      include: boletaInclude,
      // Cada fracción aparece junto a la boleta de la que proviene.
      orderBy: [{ periodo: 'desc' }, { numeroCuota: 'desc' }, { numeroFraccion: 'asc' }],
    }),
  ]);
  return { total, registros };
}

export const buscarBoleta = (id, db = prisma) =>
  db.compromisoPago.findUnique({ where: { id }, include: boletaInclude });

export const marcarBoletaPagada = (id, fecha, db = prisma) =>
  db.compromisoPago.update({ where: { id }, data: { estado: 'PAGADA', pagadaEn: fecha } });

/**
 * US-010: bloquea la boleta original mientras se confirma (o anula) el pago de
 * una de sus fracciones. Si dos fracciones se confirman a la vez, la segunda
 * espera y ve la primera ya pagada, así la original no queda PARCIAL para siempre.
 */
export const bloquearBoleta = (id, db) =>
  db.$queryRaw`SELECT id FROM "CompromisoPago" WHERE id = ${id} FOR UPDATE`;

export const contarFraccionesSinPagar = (boletaOrigenId, db = prisma) =>
  db.compromisoPago.count({ where: { boletaOrigenId, estado: { not: 'PAGADA' } } });

/** Pasa la boleta de PENDIENTE a PARCIAL; 0 si otra solicitud se adelantó. */
export const marcarBoletaParcial = async (id, db) =>
  (
    await db.compromisoPago.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data: { estado: 'PARCIAL' },
    })
  ).count;

/** US-013 + US-010: si se anula el pago de una fracción, la original vuelve a PARCIAL. */
export const reabrirBoletaFraccionada = (id, db) =>
  db.compromisoPago.updateMany({
    where: { id, estado: 'PAGADA' },
    data: { estado: 'PARCIAL', pagadaEn: null },
  });

export const crearFracciones = (boleta, fracciones, db) =>
  db.compromisoPago.createManyAndReturn({
    data: fracciones.map((f) => ({
      planPagoId: boleta.planPagoId,
      numeroCuota: boleta.numeroCuota,
      concepto: boleta.concepto,
      periodo: boleta.periodo,
      boletaOrigenId: boleta.id,
      ...f,
    })),
  });

// ------------------------------------------------------------ comprobantes (US-009)
export const crearComprobante = ({ pagoId, compromisoPagoId, emitidoEn }, db = prisma) =>
  db.comprobante.create({ data: { pagoId, compromisoPagoId, emitidoEn } });

/** Todo lo que se imprime en el comprobante vigente, en una sola consulta. */
export const buscarComprobanteDeBoleta = (compromisoPagoId, db = prisma) =>
  db.comprobante.findFirst({
    where: { compromisoPagoId, anuladoEn: null },
    include: {
      pago: { include: { iniciadoPor: { include: { persona: true } } } },
      compromisoPago: {
        include: {
          planPago: {
            include: {
              matricula: {
                include: {
                  anioAcademico: true,
                  seccion: { include: { grado: true } },
                  estudiante: { include: { persona: true } },
                },
              },
            },
          },
        },
      },
    },
  });

// ------------------------------------------------------------ apoderado
export const buscarApoderadoDeUsuario = (usuarioId, db = prisma) =>
  db.apoderado.findFirst({
    where: { persona: { usuario: { is: { id: usuarioId } } } },
    include: { estudiantes: { where: { activo: true } } },
  });

// ------------------------------------------------------------ pagos
export const crearPago = (data, db = prisma) => db.pago.create({ data });

export const buscarPagoPorReferencia = (referencia, db = prisma) =>
  db.pago.findUnique({ where: { referencia }, include: { compromisoPago: true } });

export const buscarPago = (id, db = prisma) =>
  db.pago.findUnique({ where: { id }, include: { compromisoPago: { include: boletaInclude } } });

export const buscarPagoEnCurso = (compromisoPagoId, db = prisma) =>
  db.pago.findFirst({
    where: { compromisoPagoId, estado: { in: EN_CURSO } },
  });

export const actualizarPago = (id, data, db = prisma) => db.pago.update({ where: { id }, data });

/**
 * Cambia el estado solo si el pago sigue en uno de los estados de partida.
 * Devuelve cuántas filas cambió: 0 significa que otra solicitud (el reenvío del
 * webhook o una cancelación simultánea) ya lo cerró.
 */
export const cerrarPago = async (id, desde, data, db = prisma) =>
  (await db.pago.updateMany({ where: { id, estado: { in: desde } }, data })).count;

// ------------------------------------------------------------ anulación (US-013)
/** Devuelve 0 si la boleta ya no estaba PAGADA (otra solicitud la cambió). */
export const reabrirBoleta = async (id, db = prisma) =>
  (
    await db.compromisoPago.updateMany({
      where: { id, estado: 'PAGADA' },
      data: { estado: 'PENDIENTE', pagadaEn: null },
    })
  ).count;

export const anularComprobanteDePago = async (pagoId, fecha, db = prisma) =>
  (
    await db.comprobante.updateMany({
      where: { pagoId, anuladoEn: null },
      data: { anuladoEn: fecha },
    })
  ).count;

export const buscarComprobanteDePago = (pagoId, db = prisma) =>
  db.comprobante.findUnique({ where: { pagoId } });

// ------------------------------------------------------------ reportes (US-008, US-012)
/** Filtro común por año, grado y sección de la matrícula de la boleta. */
const filtroMatricula = ({ anioAcademicoId, gradoId, seccionId }) => ({
  planPago: {
    matricula: {
      ...(anioAcademicoId && { anioAcademicoId }),
      ...(seccionId && { seccionId }),
      ...(gradoId && { seccion: { gradoId } }),
    },
  },
});

/** Boletas morosas (PENDIENTE y vencidas) con su estudiante, aula y apoderados. */
export const listarBoletasMorosas = (filtros, morosaAntesDe) =>
  prisma.compromisoPago.findMany({
    where: {
      estado: 'PENDIENTE',
      fechaVencimiento: { lt: morosaAntesDe },
      ...filtroMatricula(filtros),
    },
    select: {
      id: true,
      monto: true,
      fechaVencimiento: true,
      planPago: {
        select: {
          matricula: {
            select: {
              anioAcademico: { select: { codigo: true } },
              seccion: { select: { nombre: true, grado: { select: { nombre: true } } } },
              estudiante: {
                select: {
                  id: true,
                  codigoEstudiante: true,
                  persona: { select: { nombres: true, apellidos: true, numeroDocumento: true } },
                  apoderados: {
                    where: { activo: true },
                    select: {
                      parentesco: true,
                      apoderado: {
                        select: { persona: { select: { nombres: true, apellidos: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { fechaVencimiento: 'asc' },
  });

/**
 * Boletas no anuladas que vencen en el rango, para el reporte de pagos. Una
 * boleta fraccionada (US-010) no entra: se cuentan sus fracciones, que son las
 * que se cobran, para no sumar dos veces el mismo dinero.
 */
export const listarBoletasDelPeriodo = (filtros, desde, hasta) =>
  prisma.compromisoPago.findMany({
    where: {
      estado: { in: ['PENDIENTE', 'PAGADA'] },
      fracciones: { none: {} },
      fechaVencimiento: { gte: desde, lte: hasta },
      ...filtroMatricula(filtros),
    },
    select: { periodo: true, monto: true, estado: true, fechaVencimiento: true },
    orderBy: { periodo: 'asc' },
  });

export const buscarSeccion = (id) =>
  prisma.seccion.findUnique({
    where: { id },
    select: { nombre: true, grado: { select: { nombre: true } }, anioAcademico: true },
  });
export const buscarGrado = (id) => prisma.grado.findUnique({ where: { id } });
export const buscarAnio = (id) => prisma.anioAcademico.findUnique({ where: { id } });

// ------------------------------------------------------------ avisos (US-011)
export const listarBoletasPorVencer = (estudianteIds, desde, hasta) =>
  prisma.compromisoPago.findMany({
    where: {
      estado: 'PENDIENTE',
      fechaVencimiento: { gte: desde, lte: hasta },
      planPago: { matricula: { estudianteId: { in: estudianteIds } } },
    },
    include: boletaInclude,
    orderBy: [{ fechaVencimiento: 'asc' }, { id: 'asc' }],
  });
