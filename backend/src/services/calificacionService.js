import * as repository from '../repositories/calificacionRepository.js';
import * as detalleRepository from '../repositories/calificacionCompetencia.js';
import { AppError } from '../errors/AppError.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

function requireRole(user, role) {
  if (!user?.roles?.includes(role))
    fail(403, 'FORBIDDEN', `Solo un ${role.toLowerCase()} puede realizar esta operación.`);
}

function snapshot(calificacion) {
  return {
    id: calificacion.id,
    matriculaId: calificacion.matriculaId,
    bimestreId: calificacion.bimestreId,
    asignacionId: calificacion.asignacionId,
    reglaId: calificacion.reglaId,
    activo: calificacion.activo,
    competencias: calificacion.competencias?.map((item) => ({
      competenciaId: item.competenciaId,
      nivelLogro: item.nivelLogro,
      conclusionDescriptiva: item.conclusionDescriptiva,
      activo: item.activo,
    })),
  };
}

async function validateContext(input, db) {
  const [matricula, bimestre, asignacion, regla, competencias] = await Promise.all([
    db.matricula.findUnique({ where: { id: input.matriculaId }, include: { seccion: true } }),
    db.bimestreAcademico.findUnique({ where: { id: input.bimestreId } }),
    db.cursoSeccionDocente.findUnique({
      where: { id: input.asignacionId },
      include: { seccion: true },
    }),
    db.reglaConsolidacion.findUnique({ where: { id: input.reglaId } }),
    db.competencia.findMany({
      where: { id: { in: input.competencias.map((item) => item.competenciaId) } },
    }),
  ]);
  if (!matricula?.activo)
    fail(404, 'ENROLLMENT_NOT_FOUND', 'La matrícula no existe o está inactiva.');
  if (!bimestre?.activo) fail(404, 'TERM_NOT_FOUND', 'El bimestre no existe o está inactivo.');
  if (!asignacion)
    fail(404, 'ASSIGNMENT_NOT_FOUND', 'La asignación del curso no existe o está inactiva.');
  if (!regla?.activo)
    fail(404, 'RULE_NOT_FOUND', 'La regla de consolidación no existe o está inactiva.');
  if (
    matricula.seccionId !== asignacion.seccionId ||
    matricula.anioAcademicoId !== asignacion.seccion.anioAcademicoId
  )
    fail(400, 'INVALID_ACADEMIC_CONTEXT', 'La matrícula no corresponde a la asignación del curso.');
  if (bimestre.anioAcademicoId !== asignacion.seccion.anioAcademicoId)
    fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año académico del curso.');
  if (regla.cursoId !== asignacion.cursoId || regla.gradoId !== matricula.seccion.gradoId)
    fail(400, 'INVALID_RULE_CONTEXT', 'La regla no corresponde al curso evaluado.');
  if (
    competencias.length !== input.competencias.length ||
    competencias.some((item) => !item.activo || item.cursoId !== asignacion.cursoId)
  )
    fail(
      400,
      'INVALID_COMPETENCY_CONTEXT',
      'Todas las competencias deben pertenecer al curso y estar activas.',
    );
  return { matricula, bimestre, asignacion, regla, competencias };
}

export async function listarCalificaciones(user, estudianteId) {
  if (!user?.roles?.length)
    fail(403, 'FORBIDDEN', 'No tienes un rol habilitado para consultar calificaciones.');
  const requestedStudentId = estudianteId ? Number(estudianteId) : null;
  if (user.roles.includes('ADMINISTRADOR'))
    return repository.listCalificaciones({
      activo: true,
      ...(requestedStudentId ? { matricula: { estudianteId: requestedStudentId } } : {}),
    });
  if (user.roles.includes('ALUMNO')) {
    if (!user.estudianteId || (requestedStudentId && requestedStudentId !== user.estudianteId))
      fail(403, 'FORBIDDEN', 'Solo puedes consultar tus propias calificaciones.');
    return repository.listCalificaciones({
      activo: true,
      matricula: { estudianteId: user.estudianteId },
    });
  }
  if (user.roles.includes('APODERADO')) {
    const matricula = {
      ...(requestedStudentId ? { estudianteId: requestedStudentId } : {}),
      estudiante: { apoderados: { some: { apoderadoId: user.apoderadoId, activo: true } } },
    };
    return repository.listCalificaciones({ activo: true, matricula });
  }
  if (user.roles.includes('DOCENTE'))
    return repository.listCalificaciones({
      activo: true,
      ...(user.docenteId ? { asignacion: { docenteId: user.docenteId } } : {}),
    });
  fail(403, 'FORBIDDEN', 'Tu usuario no tiene un rol académico habilitado.');
}

async function bulkContext(input, actor, db) {
  const asignacion = await db.cursoSeccionDocente.findFirst({
    where: {
      cursoId: input.cursoId,
      seccionId: input.seccionId,
      ...(actor.roles.includes('DOCENTE') && { docenteId: actor.docenteId }),
    },
    include: {
      curso: true,
      seccion: { include: { grado: true, anioAcademico: true } },
      docente: true,
    },
  });
  const bimestre = await db.bimestreAcademico.findUnique({ where: { id: input.bimestreId } });
  if (!asignacion || !asignacion.curso.activo)
    fail(404, 'ASSIGNMENT_NOT_FOUND', 'La asignación no existe o está inactiva.');
  if (
    !actor.roles.includes('ADMINISTRADOR') &&
    (!actor.docenteId || actor.docenteId !== asignacion.docenteId)
  )
    fail(403, 'FORBIDDEN', 'Solo puedes consultar tus propios salones.');
  if (!bimestre?.activo || bimestre.anioAcademicoId !== asignacion.seccion.anioAcademicoId)
    fail(400, 'INVALID_TERM_CONTEXT', 'El bimestre no corresponde al año académico del salón.');
  const regla = await db.reglaConsolidacion.findFirst({
    where: {
      activo: true,
      gradoId: asignacion.seccion.gradoId,
      cursoId: asignacion.cursoId,
      vigenteDesde: { lte: new Date() },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: new Date() } }],
    },
    orderBy: { version: 'desc' },
  });
  if (!regla) fail(404, 'RULE_NOT_FOUND', 'No existe una regla vigente para el curso y grado.');
  const competencia = await db.competencia.findUnique({ where: { id: input.competenciaId } });
  if (!competencia?.activo || competencia.cursoId !== asignacion.cursoId)
    fail(
      400,
      'INVALID_COMPETENCY_CONTEXT',
      'La competencia no pertenece al curso o está inactiva.',
    );
  return { asignacion, bimestre, competencia, regla };
}

export async function obtenerContextoCalificacion(input, actor) {
  return repository.transaction(async (db) => {
    const context = await bulkContext(input, actor, db);
    const matriculas = await db.matricula.findMany({
      where: {
        activo: true,
        seccionId: context.asignacion.seccionId,
        anioAcademicoId: context.asignacion.seccion.anioAcademicoId,
      },
      include: {
        estudiante: { include: { persona: true } },
        calificaciones: {
          where: {
            activo: true,
            bimestreId: input.bimestreId,
            asignacionId: context.asignacion.id,
          },
          include: {
            competencias: {
              where: { activo: true, competenciaId: context.competencia.id },
            },
          },
        },
      },
      orderBy: { estudiante: { persona: { apellidos: 'asc' } } },
    });
    return {
      curso: context.asignacion.curso,
      seccion: context.asignacion.seccion,
      bimestre: context.bimestre,
      competencia: context.competencia,
      regla: context.regla,
      alumnos: matriculas.map((matricula) => ({
        matriculaId: matricula.id,
        estudianteId: matricula.estudianteId,
        nombre: `${matricula.estudiante.persona.nombres} ${matricula.estudiante.persona.apellidos}`,
        nivelLogro: matricula.calificaciones[0]?.competencias[0]?.nivelLogro ?? null,
      })),
    };
  });
}

export async function guardarCalificacionesMasivas(input, actor, requestId) {
  requireRole(actor, 'DOCENTE');
  return repository.transaction(async (db) => {
    const context = await bulkContext(input, actor, db);
    const matriculaIds = input.calificaciones.map(({ matriculaId }) => matriculaId);
    const matriculas = await db.matricula.findMany({
      where: {
        id: { in: matriculaIds },
        activo: true,
        seccionId: context.asignacion.seccionId,
        anioAcademicoId: context.asignacion.seccion.anioAcademicoId,
      },
    });
    if (matriculas.length !== matriculaIds.length)
      fail(
        400,
        'INVALID_STUDENTS',
        'Todos los alumnos deben pertenecer al salón seleccionado y estar activos.',
      );
    const resultados = [];
    for (const item of input.calificaciones) {
      const key = {
        matriculaId_bimestreId_asignacionId: {
          matriculaId: item.matriculaId,
          bimestreId: input.bimestreId,
          asignacionId: context.asignacion.id,
        },
      };
      let calificacion = await db.calificacion.findUnique({ where: key });
      if (calificacion)
        calificacion = await db.calificacion.update({
          where: { id: calificacion.id },
          data: { reglaId: context.regla.id, activo: true, modificadoPorId: actor.id },
          include: { competencias: true },
        });
      else
        calificacion = await db.calificacion.create({
          data: {
            matriculaId: item.matriculaId,
            bimestreId: input.bimestreId,
            asignacionId: context.asignacion.id,
            reglaId: context.regla.id,
            creadoPorId: actor.id,
            modificadoPorId: actor.id,
          },
          include: { competencias: true },
        });
      const detalleExistente = await db.calificacionCompetencia.findUnique({
        where: {
          calificacionId_competenciaId: {
            calificacionId: calificacion.id,
            competenciaId: context.competencia.id,
          },
        },
      });
      const detalle = detalleExistente
        ? await db.calificacionCompetencia.update({
            where: { id: detalleExistente.id },
            data: { nivelLogro: item.nivelLogro, activo: true, modificadoPorId: actor.id },
          })
        : await db.calificacionCompetencia.create({
            data: {
              calificacionId: calificacion.id,
              competenciaId: context.competencia.id,
              nivelLogro: item.nivelLogro,
              creadoPorId: actor.id,
              modificadoPorId: actor.id,
            },
          });
      await repository.auditCalificacion(db, {
        usuarioId: actor.id,
        tipoEvento: 'CALIFICACION_GUARDADA',
        calificacionId: calificacion.id,
        valorNuevo: { competenciaId: context.competencia.id, nivelLogro: detalle.nivelLogro },
        requestId,
      });
      resultados.push({
        matriculaId: item.matriculaId,
        calificacionId: calificacion.id,
        competenciaId: context.competencia.id,
        nivelLogro: detalle.nivelLogro,
      });
    }
    return { total: resultados.length, resultados };
  });
}

export async function obtenerCalificacion(id) {
  const calificacion = await repository.findCalificacion(id);
  if (!calificacion?.activo)
    fail(404, 'GRADE_NOT_FOUND', 'La calificación no existe o está inactiva.');
  return calificacion;
}

export async function crearCalificacion(input, actor, requestId) {
  requireRole(actor, 'DOCENTE');
  return repository.transaction(async (db) => {
    await validateContext(input, db);
    const existente = await repository.findCalificacionByKey(input, db);
    if (existente?.activo)
      fail(409, 'GRADE_EXISTS', 'Ya existe una calificación para ese alumno, curso y bimestre.');
    const calificacion = await repository.createCalificacion(
      {
        matriculaId: input.matriculaId,
        bimestreId: input.bimestreId,
        asignacionId: input.asignacionId,
        reglaId: input.reglaId,
        creadoPorId: actor.id,
        modificadoPorId: actor.id,
      },
      db,
    );
    for (const item of input.competencias)
      await detalleRepository.createCalificacionCompetencia(
        {
          ...item,
          calificacionId: calificacion.id,
          creadoPorId: actor.id,
          modificadoPorId: actor.id,
        },
        db,
      );
    const result = await repository.findCalificacion(calificacion.id, db);
    await repository.auditCalificacion(db, {
      usuarioId: actor.id,
      tipoEvento: 'CALIFICACION_CREADA',
      calificacionId: result.id,
      valorNuevo: snapshot(result),
      requestId,
    });
    return result;
  });
}

export async function modificarCalificacion(id, input, actor, requestId) {
  requireRole(actor, 'ADMINISTRADOR');
  return repository.transaction(async (db) => {
    const actual = await repository.findCalificacion(id, db);
    if (!actual?.activo) fail(404, 'GRADE_NOT_FOUND', 'La calificación no existe o está inactiva.');
    if (input.competencias)
      await validateContext({ ...actual, competencias: input.competencias }, db);
    const calificacion = await repository.updateCalificacion(id, { modificadoPorId: actor.id }, db);
    if (input.competencias) {
      for (const item of input.competencias) {
        const detalle = await detalleRepository.findCalificacionCompetenciaByKey(
          { calificacionId: id, competenciaId: item.competenciaId },
          db,
        );
        if (detalle)
          await detalleRepository.updateCalificacionCompetencia(
            detalle.id,
            {
              nivelLogro: item.nivelLogro,
              conclusionDescriptiva: item.conclusionDescriptiva,
              activo: true,
              modificadoPorId: actor.id,
            },
            db,
          );
        else
          await detalleRepository.createCalificacionCompetencia(
            { ...item, calificacionId: id, creadoPorId: actor.id, modificadoPorId: actor.id },
            db,
          );
      }
    }
    const result = await repository.findCalificacion(id, db);
    await repository.auditCalificacion(db, {
      usuarioId: actor.id,
      tipoEvento: 'CALIFICACION_MODIFICADA',
      calificacionId: id,
      valorAnterior: snapshot(actual),
      valorNuevo: snapshot(result),
      requestId,
    });
    return result;
  });
}

export async function desactivarCalificacion(id, actor, requestId) {
  requireRole(actor, 'ADMINISTRADOR');
  return repository.transaction(async (db) => {
    const actual = await repository.findCalificacion(id, db);
    if (!actual?.activo)
      fail(404, 'GRADE_NOT_FOUND', 'La calificación no existe o ya está inactiva.');
    const result = await repository.deleteCalificacion(id, db);
    await db.calificacionCompetencia.updateMany({
      where: { calificacionId: id, activo: true },
      data: { activo: false, modificadoPorId: actor.id },
    });
    await repository.auditCalificacion(db, {
      usuarioId: actor.id,
      tipoEvento: 'CALIFICACION_DESACTIVADA',
      calificacionId: id,
      valorAnterior: snapshot(actual),
      valorNuevo: snapshot(result),
      requestId,
    });
    return result;
  });
}
