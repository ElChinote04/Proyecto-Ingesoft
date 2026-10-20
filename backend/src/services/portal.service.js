import * as repository from '../repositories/portal.repository.js';
import { AppError } from '../errors/AppError.js';

async function estudiantesAutorizados(user) {
  const permisos = [];
  if (user.roles.includes('ALUMNO') && user.estudianteId) permisos.push({ id: user.estudianteId });
  if (user.roles.includes('APODERADO') && user.apoderadoId) {
    permisos.push({ apoderados: { some: { apoderadoId: user.apoderadoId, activo: true } } });
  }
  if (!permisos.length) return [];
  return repository.obtenerEstudiantes({ OR: permisos });
}
export async function obtenerPortal(user) {
  return (await estudiantesAutorizados(user)).map((estudiante) => ({
    id: estudiante.id,
    nombre: `${estudiante.persona.nombres} ${estudiante.persona.apellidos}`,
    codigo: estudiante.codigoEstudiante,
    matriculas: estudiante.matriculas.map(({ id, seccion }) => ({
      id,
      seccionId: seccion.id,
      seccion: `${seccion.grado.nombre} ${seccion.nombre}`,
      anioAcademico: seccion.anioAcademico.codigo,
    })),
  }));
}
export async function obtenerHistorial(estudianteId, query, user) {
  if (!(await estudiantesAutorizados(user)).some((estudiante) => estudiante.id === estudianteId))
    throw new AppError(
      403,
      'STUDENT_FORBIDDEN',
      'Solo puedes consultar tus datos o los de tus hijos vinculados.',
    );
  const { registros, total } = await repository.obtenerAsistencias(
    estudianteId,
    query.pagina,
    query.limite,
  );
  return {
    total,
    pagina: query.pagina,
    limite: query.limite,
    registros: registros.map((registro) => ({
      id: registro.id,
      fecha: registro.sesion.fecha.toISOString().slice(0, 10),
      curso: registro.sesion.bloque.asignacion.curso.nombre,
      estado: registro.condicion,
      observacion: registro.observacion,
    })),
  };
}
export async function obtenerHorario(query, user) {
  const perfil = query.perfil ?? (user.roles.includes('DOCENTE') ? 'DOCENTE' : 'ALUMNO');
  if (!user.roles.includes(perfil))
    throw new AppError(
      403,
      'FORBIDDEN',
      'No tienes el perfil solicitado para consultar el horario.',
    );
  const anio = await repository.obtenerAnioActivo();
  if (!anio) return { anioAcademico: null, perfil, secciones: [], bloques: [] };
  let filtro;
  let secciones = [];
  if (perfil === 'DOCENTE') {
    if (!user.docenteId)
      throw new AppError(403, 'NO_TEACHER_PROFILE', 'No tienes un perfil docente asociado.');
    filtro = { docenteId: user.docenteId };
  } else {
    const estudiante = (await estudiantesAutorizados(user)).find(
      (item) => item.id === user.estudianteId,
    );
    secciones =
      estudiante?.matriculas.map(({ seccion }) => `${seccion.grado.nombre} ${seccion.nombre}`) ??
      [];
    filtro = {
      seccionId: { in: estudiante?.matriculas.map((matricula) => matricula.seccionId) ?? [] },
    };
  }
  const bloques = await repository.obtenerBloques({
    ...filtro,
    seccion: { anioAcademicoId: anio.id },
  });
  return {
    anioAcademico: { id: anio.id, codigo: anio.codigo },
    perfil,
    secciones,
    bloques: bloques.map((bloque) => ({
      id: bloque.id,
      diaSemana: bloque.diaSemana,
      horaInicio: bloque.horaInicio,
      horaFin: bloque.horaFin,
      curso: bloque.asignacion.curso.nombre,
      seccion: `${bloque.asignacion.seccion.grado.nombre} ${bloque.asignacion.seccion.nombre}`,
      docente: `${bloque.asignacion.docente.persona.nombres} ${bloque.asignacion.docente.persona.apellidos}`,
      aula: bloque.aula.codigo,
    })),
  };
}
