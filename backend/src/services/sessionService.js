
import * as repository from '../repositories/sessionRepository.js';
import { prisma } from '../config/database.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

function requireTeacher(user) {
  if (!user.docenteId) {
    throw new AppError(
      403,
      'NO_TEACHER_PROFILE',
      'Tu cuenta no tiene un perfil docente asociado.',
    );
  }
}

function checkSession(session, user) {
  requireTeacher(user);

  if (!session || !session.activo) {
    throw new AppError(
      404,
      'SESSION_NOT_FOUND',
      'La sesión de clase no existe o no está disponible.',
    );
  }

  if (session.bloque.asignacion.docenteId !== user.docenteId) {
    throw new AppError(
      403,
      'SESSION_FORBIDDEN',
      'Solo puedes acceder a tus propias sesiones de clase.',
    );
  }
}

function dto(session) {
  const { curso, seccion, docente } = session.bloque.asignacion;

  return {
    id: session.id,
    curso: {
      id: curso.id,
      nombre: curso.nombre,
    },
    seccion: {
      id: seccion.id,
      gradoId: seccion.gradoId,
      nombre: `${seccion.grado.nombre} ${seccion.nombre}`,
    },
    docente: {
      id: docente.id,
      nombre: `${docente.persona.nombres} ${docente.persona.apellidos}`,
    },
    anioAcademicoId: seccion.anioAcademico.id,
    anioAcademico: seccion.anioAcademico.codigo,
    fecha: session.fecha.toISOString().slice(0, 10),
    horaInicio: session.horaInicio,
    horaFin: session.horaFin,
    aula: session.bloque.aula.codigo,
  };
}

function studentDto(matricula) {
  const asistencia = matricula.asistencias[0];

  return {
    alumnoId: matricula.estudianteId,
    nombre: `${matricula.estudiante.persona.nombres} ${matricula.estudiante.persona.apellidos}`,
    codigo: matricula.estudiante.codigoEstudiante,
    estado: asistencia?.condicion ?? null,
    observacion: asistencia?.observacion ?? '',
  };
}

export async function list(user, requestId) {
  requireTeacher(user);

  const sessions = await repository.listSessions(user.docenteId);

  logger.info('Consulta de sesiones', {
    module: 'asistencia',
    userId: user.id,
    requestId,
  });

  return sessions.map(dto);
}

export async function detail(id, user) {
  const session = await repository.findSession(id);

  checkSession(session, user);

  return dto(session);
}

export async function students(id, user) {
  const session = await repository.findSession(id);

  checkSession(session, user);

  return {
    sesion: dto(session),
    alumnos: (
      await repository.findStudents(
        session.bloque.asignacion.seccionId,
        id
      )
    ).map(studentDto),
  };
}

export async function save(id, input, user, requestId) {
  const result = await repository.inTransaction(
    id,
    async (db) => {
      const session = await repository.findSession(id, db);

      checkSession(session, user);

      const students = await repository.findStudents(
        session.bloque.asignacion.seccionId,
        id,
        db
      );

      const ids = input.asistencias.map((a) => a.alumnoId);

      if (new Set(ids).size !== ids.length) {
        throw new AppError(
          409,
          'DUPLICATE_STUDENT',
          'Cada alumno debe aparecer una sola vez.',
        );
      }

      const byId = new Map(
        students.map((m) => [m.estudianteId, m])
      );

      if (ids.some((studentId) => !byId.has(studentId))) {
        throw new AppError(
          400,
          'STUDENT_NOT_ENROLLED',
          'Uno de los alumnos no tiene matrícula activa en esta sección.',
        );
      }

      if (ids.length !== students.length) {
        throw new AppError(
          400,
          'INCOMPLETE_ATTENDANCE',
          'Registra un estado para cada alumno matriculado.',
        );
      }

      const records = input.asistencias.map((a) => ({
        ...a,
        matriculaId: byId.get(a.alumnoId).id,
        anterior:
          byId.get(a.alumnoId).asistencias[0]?.condicion ?? null,
      }));

      const saved = await repository.saveAttendance(
        db,
        id,
        records,
        user.id
      );

      const resumen = {
        PRESENTE: 0,
        TARDANZA: 0,
        AUSENTE: 0,
      };

      records.forEach((r) => {
        resumen[r.estado]++;
      });

      return {
        ...saved,
        sesion: dto(session),
        total: records.length,
        resumen,
        registradoPor: user.nombre,
      };
    }
  );

  logger.info('Asistencia guardada', {
    module: 'asistencia',
    userId: user.id,
    requestId,
    sesionId: id,
    total: result.total,
  });

  return result;
}

function validarIdOpcional(valor, campo) {
  if (valor == null || valor === '') {
    return undefined;
  }

  const texto = String(valor);

  if (!/^[1-9]\d*$/.test(texto)) {
    throw new AppError(
      400,
      'INVALID_FILTER',
      `El identificador de ${campo} no es válido.`,
    );
  }

  const id = Number(texto);

  if (!Number.isSafeInteger(id) || id > 2147483647) {
    throw new AppError(
      400,
      'INVALID_FILTER',
      `El identificador de ${campo} no es válido.`,
    );
  }

  return id;
}

export async function report(filtros, user, requestId) {
  const esAdministrador = user?.roles?.includes('ADMINISTRADOR');
  const esDocente = user?.roles?.includes('DOCENTE');

  if (!esAdministrador && !esDocente) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'No tienes permisos para consultar los reportes de asistencia estudiantil.',
    );
  }

  if (!esAdministrador && !user.docenteId) {
    throw new AppError(
      403,
      'NO_TEACHER_PROFILE',
      'Tu cuenta no tiene un perfil docente asociado.',
    );
  }

  const {
    fechaInicio,
    fechaFin,
    seccionId,
    alumnoId,
    cursoId,
  } = filtros ?? {};

  const idSeccion = Number(seccionId);

  if (
    seccionId == null ||
    !/^[1-9]\d*$/.test(String(seccionId)) ||
    !Number.isSafeInteger(idSeccion) ||
    idSeccion > 2147483647
  ) {
    throw new AppError(
      400,
      'INVALID_SECTION',
      'El identificador de la sección no es válido.',
    );
  }

  const idAlumno = validarIdOpcional(alumnoId, 'alumno');
  const idCurso = validarIdOpcional(cursoId, 'curso');

  const convertirFecha = (valor) => {
    if (
      typeof valor !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(valor)
    ) {
      throw new AppError(
        400,
        'INVALID_DATE',
        'La fecha debe tener el formato YYYY-MM-DD.',
      );
    }

    const fecha = new Date(`${valor}T00:00:00.000Z`);

    if (
      Number.isNaN(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== valor
    ) {
      throw new AppError(
        400,
        'INVALID_DATE',
        'La fecha indicada no existe.',
      );
    }

    return fecha;
  };

  const inicio = convertirFecha(fechaInicio);
  const fin = convertirFecha(fechaFin);

  if (inicio > fin) {
    throw new AppError(
      400,
      'INVALID_DATE_RANGE',
      'La fecha inicial no puede ser posterior a la fecha final.',
    );
  }

  if (!esAdministrador) {
    const asignacion = await prisma.cursoSeccionDocente.findFirst({
      where: {
        docenteId: user.docenteId,
        seccionId: idSeccion,
        ...(idCurso != null && {
          cursoId: idCurso,
        }),
        bloques: {
          some: {
            activo: true,
          },
        },
      },
    });

    if (!asignacion) {
      throw new AppError(
        403,
        'REPORT_FORBIDDEN',
        'No tienes una asignación activa para la sección y el curso solicitados.',
      );
    }
  }

  const asistencias = await repository.findAttendanceReport({
    fechaInicio: inicio,
    fechaFin: fin,
    seccionId: idSeccion,
    alumnoId: idAlumno,
    cursoId: idCurso,
    docenteId: esAdministrador ? undefined : user.docenteId,
  });

  const resumen = {
    PRESENTE: 0,
    TARDANZA: 0,
    AUSENTE: 0,
  };

  const alumnosMap = new Map();

  const detalle = asistencias.map((asistencia) => {
    const estudiante = asistencia.matricula.estudiante;
    const asignacion = asistencia.sesion.bloque.asignacion;

    return {
      id: asistencia.id,
      sesionId: asistencia.sesionId,
      fecha: asistencia.sesion.fecha.toISOString().slice(0, 10),
      alumnoId: estudiante.id,
      estudiante: `${estudiante.persona.nombres} ${estudiante.persona.apellidos}`,
      codigo: estudiante.codigoEstudiante,
      curso: asignacion.curso.nombre,
      estado: asistencia.condicion,
      observacion: asistencia.observacion ?? '',
    };
  }).sort((a, b) =>
    a.fecha.localeCompare(b.fecha) ||
    a.estudiante.localeCompare(b.estudiante, 'es') ||
    a.curso.localeCompare(b.curso, 'es') ||
    a.sesionId - b.sesionId ||
    a.id - b.id
  );

  for (const asistencia of asistencias) {
    const estudiante = asistencia.matricula.estudiante;
    const alumnoIdActual = estudiante.id;

    if (!alumnosMap.has(alumnoIdActual)) {
      alumnosMap.set(alumnoIdActual, {
        alumnoId: alumnoIdActual,
        codigo: estudiante.codigoEstudiante,
        nombre: `${estudiante.persona.nombres} ${estudiante.persona.apellidos}`,
        total: 0,
        resumen: {
          PRESENTE: 0,
          TARDANZA: 0,
          AUSENTE: 0,
        },
      });
    }

    const alumno = alumnosMap.get(alumnoIdActual);

    alumno.resumen[asistencia.condicion]++;
    alumno.total++;

    resumen[asistencia.condicion]++;
  }

  const alumnos = Array.from(alumnosMap.values()).map(
    (alumno) => {
      const asistenciasValidas =
        alumno.resumen.PRESENTE +
        alumno.resumen.TARDANZA;

      const porcentajeAsistencia =
        alumno.total > 0
          ? Math.round(
              (asistenciasValidas / alumno.total) * 10000
            ) / 100
          : 0;

      return {
        ...alumno,
        porcentajeAsistencia,
      };
    }
  );

  alumnos.sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );

  const total = asistencias.length;

  const totalAsistencias =
    resumen.PRESENTE + resumen.TARDANZA;

  const porcentajeGeneral =
    total > 0
      ? Math.round((totalAsistencias / total) * 10000) / 100
      : 0;

  logger.info('Consulta de reporte de asistencia estudiantil', {
    module: 'asistencia',
    userId: user.id,
    requestId,
    seccionId: idSeccion,
    alumnoId: idAlumno,
    cursoId: idCurso,
    docenteId: esAdministrador ? null : user.docenteId,
    total,
  });

  return {
    fechaInicio,
    fechaFin,
    seccionId: idSeccion,
    alumnoId: idAlumno ?? null,
    cursoId: idCurso ?? null,
    total,
    resumen,
    porcentajeGeneral,
    detalle,
    alumnos,
  };
}
