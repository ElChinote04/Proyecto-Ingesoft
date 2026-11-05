import { randomUUID } from 'node:crypto';
import * as repository from '../repositories/pagos.repository.js';
import { pasarela, RESULTADO } from '../integrations/pasarelaPagos.js';
import {
  construirCronograma,
  estadoVisible,
  inicioDelDia,
  resolverConfirmacion,
} from '../domain/cronograma.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { env } from '../config/env.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const dinero = (valor) => Number(valor).toFixed(2);

const EN_CURSO = ['INICIADO', 'PROCESANDO'];

// ------------------------------------------------------------------ US-006
/**
 * Construye el plan y sus boletas. Se expone como función para que el registro
 * de matrícula la invoque dentro de su propia transacción (ADR-002, US-006).
 */
export async function emitirCompromisos(matricula, plan, db, actor, requestId) {
  const anio = Number(matricula.anioAcademico.codigo);
  if (!Number.isInteger(anio))
    fail(409, 'ANIO_INVALIDO', 'El año académico de la matrícula no tiene un código numérico.');
  const cuotas = construirCronograma({
    anio,
    mesInicio: plan.mesInicio,
    numeroCuotas: plan.numeroCuotas,
    diaVencimiento: plan.diaVencimiento,
    montoPension: plan.montoPension,
    concepto: plan.concepto,
  });
  const creado = await repository.crearPlanConBoletas(
    {
      matriculaId: matricula.id,
      montoPension: plan.montoPension,
      numeroCuotas: plan.numeroCuotas,
      diaVencimiento: plan.diaVencimiento,
      mesInicio: plan.mesInicio,
    },
    cuotas,
    db,
  );
  // La emisión se audita aquí y no en quien llama, para que quede registrada
  // tanto si viene del registro de matrícula como del alta directa del plan.
  await repository.audit(
    db,
    actor.id,
    'COMPROMISO_PAGO_EMITIDO',
    creado.id,
    {
      matriculaId: matricula.id,
      cuotas: creado.boletas.length,
      montoPension: dinero(plan.montoPension),
    },
    { requestId, entidad: 'PlanPago' },
  );
  return creado;
}

/** Alta del plan sobre una matrícula ya registrada. */
export async function crearPlanDePago(matriculaId, plan, actor, requestId) {
  const resultado = await repository.transaction(async (db) => {
    const matricula = await repository.buscarMatricula(matriculaId, db);
    if (!matricula) fail(404, 'REFERENCE_NOT_FOUND', 'La matrícula no existe.');
    if (!matricula.activo) fail(409, 'MATRICULA_INACTIVA', 'La matrícula no está activa.');
    if (await repository.buscarPlanPorMatricula(matriculaId, db))
      fail(409, 'PLAN_DUPLICADO', 'Esta matrícula ya tiene un compromiso de pago emitido.');
    return emitirCompromisos(matricula, plan, db, actor, requestId);
  });
  logger.info('COMPROMISO_PAGO_EMITIDO', {
    module: 'pagos',
    requestId,
    userId: actor.id,
    entidadId: resultado.id,
  });
  return planDto(resultado);
}

export const planDto = (plan) => ({
  id: plan.id,
  matriculaId: plan.matriculaId,
  montoPension: dinero(plan.montoPension),
  numeroCuotas: plan.numeroCuotas,
  diaVencimiento: plan.diaVencimiento,
  boletas: (plan.boletas ?? []).map(boletaResumenDto),
});

// ------------------------------------------------------------------ US-007A
const boletaResumenDto = (b) => ({
  id: b.id,
  numeroCuota: b.numeroCuota,
  concepto: b.concepto,
  periodo: b.periodo,
  monto: dinero(b.monto),
  fechaVencimiento: b.fechaVencimiento.toISOString().slice(0, 10),
  estado: estadoVisible(b),
  pagadaEn: b.pagadaEn?.toISOString() ?? null,
});

/**
 * pagoEnCursoId permite a la pantalla ofrecer «retomar o cancelar» en lugar de
 * un botón Pagar que respondería 409. Solo se expone a quien puede abrir ese
 * pago (GET /pagos/:id): el administrador o quien lo inició.
 */
const boletaDetalleDto = (b, actor) => ({
  ...boletaResumenDto(b),
  pagoEnCursoId:
    (b.pagos ?? []).find(
      (p) => actor?.roles.includes('ADMINISTRADOR') || p.iniciadoPorId === actor?.id,
    )?.id ?? null,
  estudiante: {
    id: b.planPago.matricula.estudianteId,
    nombres: b.planPago.matricula.estudiante.persona.nombres,
    apellidos: b.planPago.matricula.estudiante.persona.apellidos,
  },
  anioAcademico: b.planPago.matricula.anioAcademico.codigo,
});

/**
 * Historial de boletas. Un apoderado solo ve las de los estudiantes a su cargo;
 * el administrador ve las que pida. El alcance lo decide el servidor, nunca el
 * parámetro que envía el cliente.
 */
export async function listarBoletas(filtros, actor) {
  const esAdministrador = actor.roles.includes('ADMINISTRADOR');
  let estudianteIds;
  if (!esAdministrador) {
    const apoderado = await repository.buscarApoderadoDeUsuario(actor.id);
    if (!apoderado)
      fail(403, 'FORBIDDEN', 'Tu usuario no está registrado como apoderado de ningún estudiante.');
    estudianteIds = apoderado.estudiantes.map((v) => v.estudianteId);
    if (filtros.estudianteId && !estudianteIds.includes(filtros.estudianteId))
      fail(403, 'FORBIDDEN', 'Solo puedes consultar las boletas de los estudiantes a tu cargo.');
    if (estudianteIds.length === 0) return { boletas: [], total: 0, pagina: filtros.pagina };
  }
  const { total, registros } = await repository.listarBoletas(
    {
      estudianteIds,
      estudianteId: filtros.estudianteId,
      estado: filtros.estado,
      morosaAntesDe: inicioDelDia(),
    },
    filtros.pagina,
    filtros.limite,
  );
  return {
    boletas: registros.map((b) => boletaDetalleDto(b, actor)),
    total,
    pagina: filtros.pagina,
    limite: filtros.limite,
  };
}

// ------------------------------------------------------------------ US-007B
async function boletaDelApoderado(compromisoPagoId, actor) {
  const boleta = await repository.buscarBoleta(compromisoPagoId);
  if (!boleta) fail(404, 'REFERENCE_NOT_FOUND', 'La boleta no existe.');
  const apoderado = await repository.buscarApoderadoDeUsuario(actor.id);
  const aCargo = apoderado?.estudiantes.some(
    (v) => v.estudianteId === boleta.planPago.matricula.estudianteId,
  );
  if (!aCargo)
    fail(403, 'FORBIDDEN', 'Solo puedes pagar las boletas de los estudiantes a tu cargo.');
  return boleta;
}

/**
 * Fase 1 del pago. Crea el pago en estado INICIADO antes de contactar a la
 * pasarela, de modo que una caída del proveedor deje un registro recuperable y
 * nunca una boleta pagada sin confirmar (QAS010).
 */
export async function iniciarPago({ compromisoPagoId }, actor, requestId) {
  const boleta = await boletaDelApoderado(compromisoPagoId, actor);
  if (boleta.estado === 'PAGADA')
    fail(409, 'BOLETA_YA_PAGADA', 'Esta boleta ya figura como pagada.');
  if (boleta.estado === 'ANULADA') fail(409, 'BOLETA_ANULADA', 'Esta boleta fue anulada.');

  const enCurso = await repository.buscarPagoEnCurso(compromisoPagoId);
  if (enCurso)
    fail(
      409,
      'PAGO_EN_CURSO',
      'Ya hay un pago en proceso para esta boleta. Espera su confirmación antes de volver a intentarlo.',
    );

  const referencia = `sage_${randomUUID()}`;
  let pago;
  try {
    pago = await repository.crearPago({
      compromisoPagoId,
      referencia,
      monto: boleta.monto,
      estado: 'INICIADO',
      proveedor: pasarela.nombre,
      iniciadoPorId: actor.id,
    });
  } catch (error) {
    // El índice parcial de la base de datos es la garantía real frente a dos
    // solicitudes simultáneas: la segunda choca aquí aunque haya pasado la
    // comprobación anterior.
    if (error.code === 'P2002')
      fail(409, 'PAGO_EN_CURSO', 'Ya hay un pago en proceso para esta boleta.');
    throw error;
  }

  let intento;
  try {
    intento = await pasarela.crearIntento({
      referencia,
      montoSoles: String(boleta.monto),
      concepto: `${boleta.concepto} · ${boleta.planPago.matricula.estudiante.persona.apellidos}`,
      urlExito: `${env.FRONTEND_URL}/#/pagos/${pago.id}/resultado`,
      urlCancelacion: `${env.FRONTEND_URL}/#/pagos/${pago.id}/cancelado`,
    });
  } catch (error) {
    // Sin cerrarlo, el índice parcial dejaría la boleta bloqueada. Si el
    // proveedor sí llegó a crear la sesión y luego notifica el cobro,
    // resolverConfirmacion confirma igualmente un pago RECHAZADO.
    await repository.cerrarPago(pago.id, EN_CURSO, {
      estado: 'RECHAZADO',
      motivoRechazo: 'La pasarela no respondió al crear el pago',
    });
    throw error;
  }

  const actualizado = await repository.transaction(async (db) => {
    const p = await repository.actualizarPago(
      pago.id,
      { referenciaExterna: intento.idExterno, estado: 'PROCESANDO' },
      db,
    );
    await repository.audit(
      db,
      actor.id,
      'PAGO_INICIADO',
      p.id,
      { compromisoPagoId, referencia, proveedor: pasarela.nombre, monto: dinero(boleta.monto) },
      { requestId, entidad: 'Pago' },
    );
    return p;
  });

  logger.info('PAGO_INICIADO', {
    module: 'pagos',
    requestId,
    userId: actor.id,
    entidadId: actualizado.id,
  });
  return {
    pagoId: actualizado.id,
    estado: actualizado.estado,
    monto: dinero(boleta.monto),
    urlCheckout: intento.urlCheckout,
  };
}

/**
 * Fase 2 del pago. La notificación ya viene con la firma verificada por el
 * controlador; aquí no se confía en el contenido del mensaje: se consulta el
 * estado real al proveedor y se aplica el cambio una sola vez (QAS008).
 */
export async function confirmarDesdeNotificacion({ referencia }, requestId) {
  if (!referencia) return { aplicado: false, motivo: 'SIN_REFERENCIA' };
  const pago = await repository.buscarPagoPorReferencia(referencia);
  if (!pago) {
    logger.warn('PAGO_NOTIFICACION_DESCONOCIDA', { module: 'pagos', requestId });
    return { aplicado: false, motivo: 'REFERENCIA_DESCONOCIDA' };
  }
  if (pago.estado === 'CONFIRMADO') return { aplicado: false, motivo: 'YA_CONFIRMADO' };

  const { resultado } = await pasarela.consultarIntento(pago.referenciaExterna);
  const decision = resolverConfirmacion(pago, resultado);
  if (
    decision.accion !== 'CONFIRMAR' &&
    decision.accion !== 'RECHAZAR' &&
    decision.accion !== 'CANCELAR'
  )
    return { aplicado: false, motivo: decision.motivo };

  const ahora = new Date();
  // El cambio es condicional al estado de partida: si dos notificaciones (o una
  // notificación y una cancelación) llegan a la vez, solo una lo aplica y la
  // otra no vuelve a marcar la boleta ni duplica la auditoría.
  const aplicado = await repository.transaction(async (db) => {
    if (decision.accion === 'CONFIRMAR') {
      const cambiados = await repository.cerrarPago(
        pago.id,
        [...EN_CURSO, 'RECHAZADO', 'CANCELADO'],
        { estado: 'CONFIRMADO', confirmadoEn: ahora },
        db,
      );
      if (!cambiados) return false;
      await repository.marcarBoletaPagada(pago.compromisoPagoId, ahora, db);
      await repository.audit(
        db,
        pago.iniciadoPorId,
        'PAGO_CONFIRMADO',
        pago.id,
        { compromisoPagoId: pago.compromisoPagoId, referencia, monto: dinero(pago.monto) },
        { requestId, entidad: 'Pago' },
      );
      return true;
    }
    const estado = decision.accion === 'CANCELAR' ? 'CANCELADO' : 'RECHAZADO';
    const cambiados = await repository.cerrarPago(
      pago.id,
      EN_CURSO,
      { estado, motivoRechazo: `Resultado del proveedor: ${resultado}` },
      db,
    );
    if (!cambiados) return false;
    await repository.audit(
      db,
      pago.iniciadoPorId,
      'PAGO_NO_COMPLETADO',
      pago.id,
      { compromisoPagoId: pago.compromisoPagoId, referencia, estado },
      { requestId, entidad: 'Pago', resultado: 'FALLO' },
    );
    return true;
  });
  if (!aplicado) return { aplicado: false, motivo: 'YA_APLICADO' };

  logger.info(decision.accion === 'CONFIRMAR' ? 'PAGO_CONFIRMADO' : 'PAGO_NO_COMPLETADO', {
    module: 'pagos',
    requestId,
    entidadId: pago.id,
  });
  return { aplicado: true, accion: decision.accion };
}

/** Consulta del estado de un pago; la usa el frontend mientras espera. */
export async function obtenerPago(id, actor) {
  const pago = await repository.buscarPago(id);
  if (!pago) fail(404, 'REFERENCE_NOT_FOUND', 'El pago no existe.');
  if (!actor.roles.includes('ADMINISTRADOR') && pago.iniciadoPorId !== actor.id)
    fail(403, 'FORBIDDEN', 'Solo puedes consultar los pagos que tú iniciaste.');
  return {
    id: pago.id,
    estado: pago.estado,
    monto: dinero(pago.monto),
    referencia: pago.referencia,
    confirmadoEn: pago.confirmadoEn?.toISOString() ?? null,
    motivoRechazo: pago.motivoRechazo,
    boleta: boletaDetalleDto(pago.compromisoPago, actor),
  };
}

/**
 * El apoderado abandona el checkout y quiere volver a intentarlo. El índice
 * parcial impide un segundo pago en curso sobre la misma boleta, así que hay
 * que cerrar el anterior de forma explícita en lugar de esperar a que la
 * pasarela lo expire por su cuenta (en Stripe, 24 horas).
 */
export async function cancelarPago(id, actor, requestId) {
  const pago = await repository.buscarPago(id);
  if (!pago) fail(404, 'REFERENCE_NOT_FOUND', 'El pago no existe.');
  if (!actor.roles.includes('ADMINISTRADOR') && pago.iniciadoPorId !== actor.id)
    fail(403, 'FORBIDDEN', 'Solo puedes cancelar los pagos que tú iniciaste.');
  if (pago.estado === 'CONFIRMADO')
    fail(409, 'PAGO_CONFIRMADO', 'Este pago ya fue confirmado por la pasarela.');
  if (!EN_CURSO.includes(pago.estado)) return { id: pago.id, estado: pago.estado, yaCerrado: true };

  // Antes de cerrarlo hay que preguntarle al proveedor. Si el apoderado sí
  // pagó y la notificación todavía no ha llegado, cancelar aquí dejaría la
  // boleta impaga con el dinero ya cobrado.
  if (pago.referenciaExterna) {
    const { resultado } = await pasarela.consultarIntento(pago.referenciaExterna);
    if (resultado === RESULTADO.PAGADO) {
      await confirmarDesdeNotificacion({ referencia: pago.referencia }, requestId);
      fail(409, 'PAGO_CONFIRMADO', 'La pasarela confirmó este pago; la boleta quedó pagada.');
    }
    const cerrado = await pasarela.expirarIntento(pago.referenciaExterna);
    if (!cerrado)
      logger.warn('PAGO_INTENTO_NO_EXPIRADO', {
        module: 'pagos',
        requestId,
        entidadId: pago.id,
      });
  }

  const cancelado = await repository.transaction(async (db) => {
    const cambiados = await repository.cerrarPago(
      pago.id,
      EN_CURSO,
      { estado: 'CANCELADO', motivoRechazo: 'Cancelado por el usuario' },
      db,
    );
    if (!cambiados) return false;
    await repository.audit(
      db,
      actor.id,
      'PAGO_NO_COMPLETADO',
      pago.id,
      { compromisoPagoId: pago.compromisoPagoId, referencia: pago.referencia, estado: 'CANCELADO' },
      { requestId, entidad: 'Pago', resultado: 'FALLO' },
    );
    return true;
  });
  if (!cancelado) {
    // Otra solicitud lo cerró entre la lectura y este punto.
    const actual = await repository.buscarPago(id);
    return { id: actual.id, estado: actual.estado, yaCerrado: true };
  }

  logger.info('PAGO_NO_COMPLETADO', {
    module: 'pagos',
    requestId,
    userId: actor.id,
    entidadId: pago.id,
  });
  return { id: pago.id, estado: 'CANCELADO' };
}

export { RESULTADO };

/** Ver pagos.controller.simularResultado. No se expone en producción. */
export async function simularResultadoPasarela(pagoId, resultado, actor, requestId) {
  const { simulada } = await import('../integrations/pasarelaPagos.js');
  const pago = await repository.buscarPago(pagoId);
  if (!pago) fail(404, 'REFERENCE_NOT_FOUND', 'El pago no existe.');
  simulada.marcar(pago.referenciaExterna, resultado);
  logger.warn('PAGO_SIMULADO', {
    module: 'pagos',
    requestId,
    userId: actor.id,
    entidadId: pago.id,
    resultado,
  });
  const aplicado = await confirmarDesdeNotificacion({ referencia: pago.referencia }, requestId);
  return { pagoId, resultadoSimulado: resultado, ...aplicado };
}
