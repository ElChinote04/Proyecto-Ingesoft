import { prisma } from '../config/database.js';

// Se usa el "db" de la transacción del módulo que audita: la operación y su registro se
// guardan juntos o no se guarda ninguno.
export const registrarEvento = (datos, db) => db.registroAuditoria.create({ data: datos });

export async function buscarEventos(where, pagina, limite) {
  const [total, registros] = await prisma.$transaction([
    prisma.registroAuditoria.count({ where }),
    prisma.registroAuditoria.findMany({
      where,
      skip: (pagina - 1) * limite,
      take: limite,
      include: { usuario: { select: { identificador: true } } },
      orderBy: { id: 'desc' },
    }),
  ]);
  return { total, registros };
}

export async function obtenerTiposEvento() {
  const filas = await prisma.registroAuditoria.findMany({
    distinct: ['tipoEvento'],
    select: { tipoEvento: true },
    orderBy: { tipoEvento: 'asc' },
  });
  return filas.map((fila) => fila.tipoEvento);
}
