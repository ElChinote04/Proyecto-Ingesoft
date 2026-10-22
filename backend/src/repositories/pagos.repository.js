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

const boletaInclude = {
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

export async function listarBoletas({ estudianteIds, estudianteId, estado }, pagina, limite) {
  const where = {
    planPago: {
      matricula: {
        estudianteId: estudianteId ?? (estudianteIds ? { in: estudianteIds } : undefined),
      },
    },
    ...(estado && estado !== 'MOROSA' && { estado }),
    // MOROSA no es un estado almacenado: es una boleta PENDIENTE ya vencida.
    ...(estado === 'MOROSA' && { estado: 'PENDIENTE', fechaVencimiento: { lt: new Date() } }),
  };
  const [total, registros] = await prisma.$transaction([
    prisma.compromisoPago.count({ where }),
    prisma.compromisoPago.findMany({
      where,
      skip: (pagina - 1) * limite,
      take: limite,
      include: boletaInclude,
      orderBy: [{ periodo: 'desc' }, { id: 'desc' }],
    }),
  ]);
  return { total, registros };
}

export const buscarBoleta = (id, db = prisma) =>
  db.compromisoPago.findUnique({ where: { id }, include: boletaInclude });

export const marcarBoletaPagada = (id, fecha, db = prisma) =>
  db.compromisoPago.update({ where: { id }, data: { estado: 'PAGADA', pagadaEn: fecha } });

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
    where: { compromisoPagoId, estado: { in: ['INICIADO', 'PROCESANDO'] } },
  });

export const actualizarPago = (id, data, db = prisma) => db.pago.update({ where: { id }, data });
