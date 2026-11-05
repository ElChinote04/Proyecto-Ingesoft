import * as repository from '../repositories/asistenciaDocenteRepository.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

// Verificar que el usuario sea administrador
function requireAdmin(user) {
  if (!user?.roles?.includes('ADMINISTRADOR')) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'No tienes permisos para registrar asistencia docente.'
    );
  }
}

// Verificar que el ID del docente sea válido
function validarDocenteId(docenteId) {
  const id = Number(docenteId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(
      400,
      'INVALID_TEACHER_ID',
      'El identificador del docente no es válido.'
    );
  }

  return id;
}

// Validar fecha en formato YYYY-MM-DD
function validarFecha(fecha) {
  if (typeof fecha !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new AppError(
      400,
      'INVALID_DATE',
      'La fecha debe tener el formato YYYY-MM-DD.'
    );
  }

  const fechaDate = new Date(`${fecha}T00:00:00.000Z`);

  if (
    Number.isNaN(fechaDate.getTime()) ||
    fechaDate.toISOString().slice(0, 10) !== fecha
  ) {
    throw new AppError(
      400,
      'INVALID_DATE',
      'La fecha indicada no existe.'
    );
  }

  return fechaDate;
}

// Validar los datos de asistencia
function validarAsistencia(input) {
  const condiciones = ['PRESENTE', 'TARDANZA', 'AUSENTE'];

  if (!input || !condiciones.includes(input.condicion)) {
    throw new AppError(
      400,
      'INVALID_ATTENDANCE',
      'La condición debe ser PRESENTE, TARDANZA o AUSENTE.'
    );
  }

  const observacion = input.observacion ?? '';

  if (
    typeof observacion !== 'string' ||
    observacion.trim().length > 300
  ) {
    throw new AppError(
      400,
      'INVALID_OBSERVATION',
      'La observación debe ser un texto de máximo 300 caracteres.'
    );
  }

  return {
    condicion: input.condicion,
    observacion: observacion.trim()
  };
}

// Convertir el registro de Prisma a una respuesta de la API
function toDto(asistencia) {
  return {
    id: asistencia.id,
    docenteId: asistencia.docenteId,
    fecha: asistencia.fecha.toISOString().slice(0, 10),
    condicion: asistencia.condicion,
    observacion: asistencia.observacion,
    creadoEn: asistencia.creadoEn,
    modificadoEn: asistencia.modificadoEn
  };
}

// 1. Registrar o actualizar asistencia
export async function registrarAsistencia(
  docenteId,
  input,
  user,
  requestId
) {
  requireAdmin(user);

  const id = validarDocenteId(docenteId);
  const fecha = validarFecha(input?.fecha);
  const datos = validarAsistencia(input);

  const asistencia = await repository.inTransaction(
    id,
    async (db) => {
      const docente = await repository.findDocente(id, db);

      if (!docente || !docente.persona.activo) {
        throw new AppError(
          404,
          'TEACHER_NOT_FOUND',
          'El docente no existe o se encuentra inactivo.'
        );
      }

      return repository.saveAttendance(
        db,
        {
          docenteId: id,
          fecha,
          condicion: datos.condicion,
          observacion: datos.observacion
        },
        user.id
      );
    }
  );

  logger.info('Asistencia docente guardada', {
    module: 'asistenciaDocente',
    userId: user.id,
    docenteId: id,
    requestId
  });

  return toDto(asistencia);
}

// 2. Obtener historial de un docente
export async function obtenerHistorial(docenteId, user) {
  const id = validarDocenteId(docenteId);

  const esAdmin = user?.roles?.includes('ADMINISTRADOR');
  const esPropioDocente =
    user?.roles?.includes('DOCENTE') &&
    user.docenteId === id;

  if (!esAdmin && !esPropioDocente) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'No tienes permisos para consultar estas asistencias.'
    );
  }

  const docente = await repository.findDocente(id);

  if (!docente) {
    throw new AppError(
      404,
      'TEACHER_NOT_FOUND',
      'El docente no existe.'
    );
  }

  const asistencias = await repository.findByDocente(id);

  return {
    docenteId: id,
    nombre: `${docente.persona.nombres} ${docente.persona.apellidos}`,
    total: asistencias.length,
    asistencias: asistencias.map(toDto)
  };
}

// 3. Obtener reporte por intervalo de fechas
export async function obtenerReporte(filtros, user) {
  requireAdmin(user);

  const fechaInicio = validarFecha(filtros?.fechaInicio);
  const fechaFin = validarFecha(filtros?.fechaFin);

  if (fechaInicio > fechaFin) {
    throw new AppError(
      400,
      'INVALID_DATE_RANGE',
      'La fecha inicial no puede ser posterior a la final.'
    );
  }

  const dias =
    (fechaFin.getTime() - fechaInicio.getTime()) / 86400000;

  if (dias > 365) {
    throw new AppError(
      400,
      'DATE_RANGE_TOO_LARGE',
      'El intervalo no puede superar 366 días.'
    );
  }

  const docenteId =
    filtros.docenteId == null
      ? undefined
      : validarDocenteId(filtros.docenteId);

  const asistencias = await repository.findByDateRange({
    fechaInicio,
    fechaFin,
    docenteId
  });

  const resumen = {
    PRESENTE: 0,
    TARDANZA: 0,
    AUSENTE: 0
  };

  for (const asistencia of asistencias) {
    resumen[asistencia.condicion]++;
  }

  return {
    fechaInicio: filtros.fechaInicio,
    fechaFin: filtros.fechaFin,
    total: asistencias.length,
    resumen,
    asistencias: asistencias.map(toDto)
  };
}
