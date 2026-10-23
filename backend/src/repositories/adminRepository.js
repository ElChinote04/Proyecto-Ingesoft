import { prisma } from '../config/database.js';
export const userInclude = {
  roles: { include: { rol: true } },
  persona: { include: { docente: true, estudiante: true, apoderado: true } },
};
const sectionInclude = { grado: true, anioAcademico: true };
export const blockInclude = {
  aula: true,
  asignacion: {
    include: {
      curso: true,
      docente: { include: { persona: true } },
      seccion: { include: sectionInclude },
    },
  },
};
// Serializa mutaciones administrativas antes de leer sus invariantes.
// READ COMMITTED obtiene el estado más reciente después de adquirir el bloqueo.
export const transaction = (operation) =>
  prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(73142026)`;
      return operation(db);
    },
    { isolationLevel: 'ReadCommitted', timeout: 15000 },
  );
export const isInitialized = async (db = prisma) =>
  Boolean(await db.instalacion.findUnique({ where: { id: 1 } })) ||
  (await db.usuario.count({ where: { roles: { some: { rol: { nombre: 'ADMINISTRADOR' } } } } })) >
    0;
export const closeSetup = (db) => db.instalacion.create({ data: { id: 1 } });
export const roles = (db) =>
  Promise.all(
    ['ADMINISTRADOR', 'DOCENTE', 'ALUMNO', 'APODERADO'].map((nombre) =>
      db.rol.upsert({ where: { nombre }, create: { nombre }, update: {} }),
    ),
  );
export const listUsers = () =>
  prisma.usuario.findMany({ include: userInclude, orderBy: { id: 'asc' } });
export const findUser = (id, db) => db.usuario.findUnique({ where: { id }, include: userInclude });
export const findIdentifier = (identificador, db) =>
  db.usuario.findUnique({ where: { identificador } });
export const findPerson = (numeroDocumento, db) =>
  db.persona.findUnique({
    where: { numeroDocumento },
    include: { usuario: true, estudiante: true },
  });
export const createPerson = (data, db) => db.persona.create({ data });
export const createUser = (data, db) => db.usuario.create({ data, include: userInclude });
export const editUser = (id, data, db) =>
  db.usuario.update({ where: { id }, data, include: userInclude });
export const activeAdmins = (db) =>
  db.usuario.count({
    where: {
      activo: true,
      persona: { activo: true },
      roles: { some: { rol: { nombre: 'ADMINISTRADOR' } } },
    },
  });
export const revokeSessions = (usuarioId, db) => db.sesionAuth.deleteMany({ where: { usuarioId } });
export const ensureTeacher = (personaId, db) =>
  db.docente.upsert({
    where: { personaId },
    create: { personaId, codigoDocente: `DOC-${personaId}` },
    update: {},
  });
export const ensureGuardian = (personaId, db) =>
  db.apoderado.upsert({ where: { personaId }, create: { personaId }, update: {} });
export const ensureStudent = (personaId, db) =>
  db.estudiante.upsert({
    where: { personaId },
    create: { personaId, codigoEstudiante: `EST-${personaId}` },
    update: {},
  });
export const audit = (db, usuarioId, tipoEvento, entidadId, detalle = {}, contexto = {}) =>
  db.registroAuditoria.create({ data: { usuarioId, tipoEvento, entidadId, detalle, ...contexto } });
export async function catalogs() {
  const [anios, grados, secciones, cursos, aulas, docentes, apoderados, vinculos] =
    await Promise.all([
      prisma.anioAcademico.findMany({ orderBy: { codigo: 'desc' } }),
      prisma.grado.findMany({ orderBy: { nombre: 'asc' } }),
      prisma.seccion.findMany({ include: sectionInclude, orderBy: { id: 'asc' } }),
      prisma.curso.findMany({ orderBy: { nombre: 'asc' } }),
      prisma.aula.findMany({ orderBy: { codigo: 'asc' } }),
      prisma.docente.findMany({
        where: {
          persona: {
            activo: true,
            usuario: { is: { activo: true, roles: { some: { rol: { nombre: 'DOCENTE' } } } } },
          },
        },
        include: { persona: true },
        orderBy: { id: 'asc' },
      }),
      prisma.apoderado.findMany({
        where: {
          persona: {
            activo: true,
            usuario: { is: { activo: true, roles: { some: { rol: { nombre: 'APODERADO' } } } } },
          },
        },
        include: { persona: true },
      }),
      prisma.apoderadoEstudiante.findMany({
        orderBy: [{ apoderadoId: 'asc' }, { estudianteId: 'asc' }],
      }),
    ]);
  return {
    apoderados: apoderados.map((p) => ({
      id: p.id,
      nombre: `${p.persona.nombres} ${p.persona.apellidos}`,
    })),
    vinculos,
    anios,
    grados,
    secciones,
    cursos,
    aulas,
    docentes: docentes.map((d) => ({
      id: d.id,
      nombre: `${d.persona.nombres} ${d.persona.apellidos}`,
      codigoDocente: d.codigoDocente,
    })),
  };
}
const models = {
  anios: 'anioAcademico',
  grados: 'grado',
  secciones: 'seccion',
  cursos: 'curso',
  aulas: 'aula',
};
export async function createCatalog(type, data, db) {
  if (type === 'anios') {
    const activo = !(await db.anioAcademico.findFirst({ where: { activo: true } }));
    const anio = await db.anioAcademico.create({ data: { ...data, activo } });
    await db.bimestreAcademico.createMany({
      data: [
        { anioAcademicoId: anio.id, numero: 1, nombre: 'I Bimestre' },
        { anioAcademicoId: anio.id, numero: 2, nombre: 'II Bimestre' },
        { anioAcademicoId: anio.id, numero: 3, nombre: 'III Bimestre' },
        { anioAcademicoId: anio.id, numero: 4, nombre: 'IV Bimestre' },
      ],
    });
    return anio;
  }
  return db[models[type]].create({ data });
}
export const findSection = (id, db) =>
  db.seccion.findUnique({ where: { id }, include: sectionInclude });
export const findGrade = (id, db) => db.grado.findUnique({ where: { id } });
export const findYear = (id, db) => db.anioAcademico.findUnique({ where: { id } });
export const findCourse = (id, db) => db.curso.findUnique({ where: { id } });
export const findRoom = (id, db) => db.aula.findUnique({ where: { id } });
export const findTeacher = (id, db) =>
  db.docente.findUnique({
    where: { id },
    include: {
      persona: { include: { usuario: { include: { roles: { include: { rol: true } } } } } },
    },
  });
export const students = () =>
  prisma.estudiante.findMany({
    include: { persona: true, matriculas: { include: { seccion: { include: sectionInclude } } } },
    orderBy: { id: 'asc' },
  });
export const findStudent = (id, db) =>
  db.estudiante.findUnique({ where: { id }, include: { persona: true } });
export const findEnrollment = (estudianteId, anioAcademicoId, db) =>
  db.matricula.findUnique({
    where: { estudianteId_anioAcademicoId: { estudianteId, anioAcademicoId } },
  });
export const createEnrollment = (data, db) => db.matricula.create({ data });
export const findBlock = (id, db) =>
  db.cursoSeccionDocenteAula.findUnique({ where: { id }, include: blockInclude });
export const conflictingBlock = (data, yearId, db, excluirId) =>
  db.cursoSeccionDocenteAula.findFirst({
    where: {
      activo: true,
      ...(excluirId && { id: { not: excluirId } }),
      diaSemana: data.diaSemana,
      horaInicio: { lt: data.horaFin },
      horaFin: { gt: data.horaInicio },
      asignacion: { seccion: { anioAcademicoId: yearId } },
      OR: [
        { aulaId: data.aulaId },
        { asignacion: { docenteId: data.docenteId } },
        { asignacion: { seccionId: data.seccionId } },
      ],
    },
    include: blockInclude,
  });
export async function createBlock(data, db) {
  const { cursoId, seccionId, docenteId, ...block } = data;
  const asignacion = await db.cursoSeccionDocente.upsert({
    where: { cursoId_seccionId_docenteId: { cursoId, seccionId, docenteId } },
    create: { cursoId, seccionId, docenteId },
    update: {},
  });
  return db.cursoSeccionDocenteAula.create({
    data: { ...block, asignacionId: asignacion.id },
    include: blockInclude,
  });
}
export const existingClass = (bloqueId, fecha, db) =>
  db.sesionClase.findUnique({ where: { bloqueId_fecha: { bloqueId, fecha } } });
export const createClass = (data, db) => db.sesionClase.create({ data });
export async function schedule() {
  const [bloques, sesiones] = await Promise.all([
    prisma.cursoSeccionDocenteAula.findMany({
      include: blockInclude,
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    }),
    prisma.sesionClase.findMany({ orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }] }),
  ]);
  return { bloques, sesiones };
}

export async function activarAnio(id, db) {
  await db.anioAcademico.updateMany({ where: { activo: true }, data: { activo: false } });
  return db.anioAcademico.update({ where: { id }, data: { activo: true } });
}
export const findGuardian = (id, db) =>
  db.apoderado.findUnique({
    where: { id },
    include: {
      persona: { include: { usuario: { include: { roles: { include: { rol: true } } } } } },
    },
  });
export const linkGuardian = (data, db) =>
  db.apoderadoEstudiante.upsert({
    where: {
      apoderadoId_estudianteId: { apoderadoId: data.apoderadoId, estudianteId: data.estudianteId },
    },
    create: data,
    update: { parentesco: data.parentesco, activo: data.activo },
  });
export const hasClassSessions = (bloqueId, db) => db.sesionClase.count({ where: { bloqueId } });
export async function updateBlock(id, data, db) {
  const { cursoId, seccionId, docenteId, ...bloque } = data;
  const asignacion = await db.cursoSeccionDocente.upsert({
    where: { cursoId_seccionId_docenteId: { cursoId, seccionId, docenteId } },
    create: { cursoId, seccionId, docenteId },
    update: {},
  });
  return db.cursoSeccionDocenteAula.update({
    where: { id },
    data: { ...bloque, asignacionId: asignacion.id },
    include: blockInclude,
  });
}
export const deactivateBlock = (id, db) =>
  db.cursoSeccionDocenteAula.update({
    where: { id },
    data: { activo: false },
    include: blockInclude,
  });
