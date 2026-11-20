import * as repository from '../repositories/bimestres.repository.js';
import { registrarTransaccionCritica } from './auditoria.service.js';
import { aTexto, estaCerrado, totalSemanas } from '../domain/semanasBimestre.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message, details) => {
  throw new AppError(status, code, message, details);
};

const presentar = (bimestre) => ({
  id: bimestre.id,
  anioAcademicoId: bimestre.anioAcademicoId,
  numero: bimestre.numero,
  nombre: bimestre.nombre,
  fechaInicio: bimestre.fechaInicio && aTexto(bimestre.fechaInicio),
  fechaFin: bimestre.fechaFin && aTexto(bimestre.fechaFin),
  activo: bimestre.activo,
  semanas: totalSemanas(bimestre),
  cerrado: estaCerrado(bimestre),
});

const snapshot = ({ fechaInicio, fechaFin }) => ({
  fechaInicio: fechaInicio && aTexto(fechaInicio),
  fechaFin: fechaFin && aTexto(fechaFin),
});

export async function listarBimestres() {
  return (await repository.listBimestresDelAnioActivo()).map(presentar);
}

function exigirCoherencia(bimestre, { fechaInicio, fechaFin }, otros) {
  if (fechaInicio > fechaFin)
    fail(400, 'INVALID_TERM_DATES', 'La fecha de inicio no puede ser posterior a la de fin.');
  const { anioAcademico } = bimestre;
  if (
    (anioAcademico.fechaInicio && fechaInicio < aTexto(anioAcademico.fechaInicio)) ||
    (anioAcademico.fechaFin && fechaFin > aTexto(anioAcademico.fechaFin))
  )
    fail(400, 'TERM_OUTSIDE_YEAR', 'El bimestre debe quedar dentro del año académico.');
  for (const otro of otros) {
    if (!otro.fechaInicio || !otro.fechaFin) continue;
    const inicio = aTexto(otro.fechaInicio);
    const fin = aTexto(otro.fechaFin);
    if (fechaInicio <= fin && inicio <= fechaFin)
      fail(409, 'TERM_OVERLAP', `Las fechas se cruzan con el ${otro.nombre}.`);
    // El orden de las fechas debe respetar el número: el II no puede ir antes que el I.
    if (otro.numero < bimestre.numero !== fin < fechaInicio)
      fail(
        409,
        'TERM_ORDER',
        `El ${bimestre.nombre} debe ir después del ${otro.nombre} y antes de los siguientes.`,
      );
  }
}

export async function modificarFechas(id, input, actor, requestId) {
  return repository.transaction(async (db) => {
    const encontrado = await repository.findBimestre(id, db);
    if (!encontrado?.activo) fail(404, 'TERM_NOT_FOUND', 'El bimestre no existe o está inactivo.');
    await repository.bloquearBimestresDelAnio(encontrado.anioAcademicoId, db);
    const anterior = await repository.findBimestre(id, db);
    const otros = await repository.listOtrosBimestres(
      { anioAcademicoId: anterior.anioAcademicoId, excluirId: id },
      db,
    );
    exigirCoherencia(anterior, input, otros);

    await repository.bloquearPlanesDelBimestre(id, db);
    const semanas = totalSemanas(input);
    const ocupadas = await repository.listSemanasOcupadas(
      { bimestreId: id, desdeSemana: semanas + 1 },
      db,
    );
    if (ocupadas.length)
      fail(
        409,
        'TERM_HAS_LATER_WEEKS',
        `Con esas fechas el bimestre tendría ${semanas} semanas, pero hay actividades registradas en semanas posteriores.`,
        ocupadas.map(({ numeroSemana, plan }) => ({
          planId: plan.id,
          clase: `${plan.curso.nombre} – ${plan.seccion.grado.nombre} ${plan.seccion.nombre}`,
          semana: numeroSemana,
        })),
      );

    const bimestre = await repository.updateFechas(
      id,
      {
        fechaInicio: new Date(`${input.fechaInicio}T00:00:00.000Z`),
        fechaFin: new Date(`${input.fechaFin}T00:00:00.000Z`),
      },
      db,
    );
    await registrarTransaccionCritica(db, {
      actorId: actor.id,
      evento: 'BIMESTRE_FECHAS_MODIFICADAS',
      entidad: 'BimestreAcademico',
      entidadId: id,
      anterior: snapshot(anterior),
      nuevo: snapshot(bimestre),
      requestId,
    });
    return presentar(bimestre);
  });
}
