import bcrypt from 'bcrypt';
import { timingSafeEqual, createHash } from 'node:crypto';
import * as repository from '../repositories/adminRepository.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
function exists(value, label) {
  if (!value) fail(404, 'REFERENCE_NOT_FOUND', `${label} no existe.`);
  return value;
}
export const userDto = (u) => ({
  id: u.id,
  personaId: u.personaId,
  identificador: u.identificador,
  activo: u.activo,
  version: u.version,
  numeroDocumento: u.persona.numeroDocumento,
  nombres: u.persona.nombres,
  apellidos: u.persona.apellidos,
  roles: u.roles.map((r) => r.rol.nombre),
  docenteId: u.persona.docente?.id ?? null,
});
async function mutation(user, requestId, event, operation) {
  try {
    const result = await repository.transaction(async (db) => {
      const { data, detail = {} } = await operation(db);
      await repository.audit(db, user.id, event, data.id, detail);
      return data;
    });
    logger.info(event, {
      module: 'administracion',
      requestId,
      userId: user.id,
      entidadId: result.id,
    });
    return result;
  } catch (error) {
    if (error.code === 'P2002')
      fail(
        409,
        'DUPLICATE_RECORD',
        'Ya existe un registro con esos datos. Revisa el listado antes de volver a guardar.',
      );
    throw error;
  }
}
async function person(input, db) {
  const found = await repository.findPerson(input.numeroDocumento, db);
  if (found) {
    if (!found.activo) fail(409, 'PERSON_INACTIVE', 'La persona está desactivada.');
    if (found.nombres !== input.nombres || found.apellidos !== input.apellidos)
      fail(
        409,
        'PERSON_MISMATCH',
        'El documento ya pertenece a una persona. Usa sus nombres y apellidos registrados para vincular el nuevo perfil.',
      );
    return found;
  }
  return repository.createPerson(
    { numeroDocumento: input.numeroDocumento, nombres: input.nombres, apellidos: input.apellidos },
    db,
  );
}
async function account(input, hashContrasena, db) {
  if (await repository.findIdentifier(input.identificador, db))
    fail(409, 'DUPLICATE_IDENTIFIER', 'Ya existe una cuenta con ese identificador.');
  const p = await person(input, db);
  if (p.usuario)
    fail(
      409,
      'PERSON_HAS_ACCOUNT',
      'Esta persona ya tiene una cuenta. Edita sus roles desde Usuarios.',
    );
  const roles = await repository.roles(db);
  if (input.roles.includes('DOCENTE')) await repository.ensureTeacher(p.id, db);
  if (input.roles.includes('ALUMNO')) await repository.ensureStudent(p.id, db);
  return repository.createUser(
    {
      personaId: p.id,
      identificador: input.identificador,
      hashContrasena,
      activo: input.activo,
      roles: {
        create: roles.filter((r) => input.roles.includes(r.nombre)).map((r) => ({ rolId: r.id })),
      },
    },
    db,
  );
}
export const setupStatus = async () => ({ requerido: !(await repository.isInitialized()) });
export async function initialize(input, requestId) {
  if (!env.INITIAL_SETUP_KEY)
    fail(
      503,
      'SETUP_NOT_CONFIGURED',
      'Ejecuta la preparación local antes de crear el administrador.',
    );
  const digest = (v) => createHash('sha256').update(v).digest();
  if (!timingSafeEqual(digest(input.claveInstalacion), digest(env.INITIAL_SETUP_KEY)))
    fail(403, 'INVALID_SETUP_KEY', 'La clave de instalación no es válida.');
  const hash = await bcrypt.hash(input.contrasena, 12);
  const user = await repository.transaction(async (db) => {
    if (await repository.isInitialized(db))
      fail(409, 'SETUP_COMPLETED', 'La instalación ya tiene administrador. Inicia sesión.');
    const created = await account({ ...input, roles: ['ADMINISTRADOR'], activo: true }, hash, db);
    await repository.closeSetup(db);
    await repository.audit(db, created.id, 'ADMINISTRADOR_INICIAL_CREADO', created.id, {
      roles: ['ADMINISTRADOR'],
    });
    return created;
  });
  logger.info('Administrador inicial creado', {
    module: 'instalacion',
    requestId,
    userId: user.id,
  });
  return userDto(user);
}
export const users = async () => (await repository.listUsers()).map(userDto);
export async function createUser(input, actor, requestId) {
  const hash = await bcrypt.hash(input.contrasena, 12);
  return mutation(actor, requestId, 'USUARIO_CREADO', async (db) => {
    const user = await account(input, hash, db);
    return { data: userDto(user), detail: { roles: input.roles, activo: input.activo } };
  });
}
export async function updateUser(id, input, actor, requestId) {
  const hash = input.contrasena ? await bcrypt.hash(input.contrasena, 12) : null;
  return mutation(actor, requestId, 'USUARIO_ACTUALIZADO', async (db) => {
    const current = exists(await repository.findUser(id, db), 'El usuario');
    if (current.version !== input.version)
      fail(409, 'STALE_VERSION', 'El usuario cambió. Recarga el listado y vuelve a editar.');
    const wasAdmin = current.roles.some((r) => r.rol.nombre === 'ADMINISTRADOR');
    const isAdmin = input.roles.includes('ADMINISTRADOR') && input.activo;
    if (id === actor.id && !isAdmin)
      fail(
        409,
        'SELF_LOCKOUT',
        'No puedes quitarte el acceso administrativo ni desactivar tu propia cuenta.',
      );
    if (wasAdmin && current.activo && !isAdmin && (await repository.activeAdmins(db)) <= 1)
      fail(409, 'LAST_ADMIN', 'Debe quedar al menos un administrador activo.');
    const duplicate = await repository.findIdentifier(input.identificador, db);
    if (duplicate && duplicate.id !== id)
      fail(409, 'DUPLICATE_IDENTIFIER', 'Ya existe una cuenta con ese identificador.');
    const roles = await repository.roles(db);
    if (input.roles.includes('DOCENTE')) await repository.ensureTeacher(current.personaId, db);
    if (input.roles.includes('ALUMNO')) await repository.ensureStudent(current.personaId, db);
    const updated = await repository.editUser(
      id,
      {
        identificador: input.identificador,
        activo: input.activo,
        version: { increment: 1 },
        ...(hash && { hashContrasena: hash }),
        roles: {
          deleteMany: {},
          create: roles.filter((r) => input.roles.includes(r.nombre)).map((r) => ({ rolId: r.id })),
        },
      },
      db,
    );
    if (!input.activo || hash) await repository.revokeSessions(id, db);
    return {
      data: userDto(updated),
      detail: {
        anterior: { roles: current.roles.map((r) => r.rol.nombre), activo: current.activo },
        nuevo: { roles: input.roles, activo: input.activo },
        contrasenaRenovada: Boolean(hash),
      },
    };
  });
}
export const catalogs = () => repository.catalogs();
export const auditEvents = () => repository.audits();
export function createCatalog(type, input, actor, requestId) {
  return mutation(actor, requestId, 'CATALOGO_CREADO', async (db) => {
    if (type === 'secciones') {
      exists(await repository.findGrade(input.gradoId, db), 'El grado');
      exists(await repository.findYear(input.anioAcademicoId, db), 'El año académico');
    }
    return { data: await repository.createCatalog(type, input, db), detail: { catalogo: type } };
  });
}
export const students = async () =>
  (await repository.students()).map((e) => ({
    id: e.id,
    personaId: e.personaId,
    codigoEstudiante: e.codigoEstudiante,
    nombres: e.persona.nombres,
    apellidos: e.persona.apellidos,
    numeroDocumento: e.persona.numeroDocumento,
    matriculas: e.matriculas.map((m) => ({
      id: m.id,
      seccionId: m.seccionId,
      anioAcademicoId: m.anioAcademicoId,
      activo: m.activo,
      descripcion: `${m.seccion.anioAcademico.codigo} · ${m.seccion.grado.nombre} ${m.seccion.nombre}`,
    })),
  }));
export function createStudent(input, actor, requestId) {
  return mutation(actor, requestId, 'ESTUDIANTE_REGISTRADO', async (db) => {
    const p = await person(input, db);
    if (p.estudiante)
      fail(
        409,
        'STUDENT_EXISTS',
        'El estudiante ya está registrado. Selecciónalo para matricularlo.',
      );
    return { data: await repository.ensureStudent(p.id, db) };
  });
}
export function enroll(input, actor, requestId) {
  return mutation(actor, requestId, 'MATRICULA_REGISTRADA', async (db) => {
    const student = exists(await repository.findStudent(input.estudianteId, db), 'El estudiante');
    if (!student.persona.activo) fail(409, 'PERSON_INACTIVE', 'El estudiante está desactivado.');
    const section = exists(await repository.findSection(input.seccionId, db), 'La sección');
    if (await repository.findEnrollment(student.id, section.anioAcademicoId, db))
      fail(
        409,
        'DUPLICATE_ENROLLMENT',
        'El estudiante ya tiene una matrícula en este año académico.',
      );
    return {
      data: await repository.createEnrollment(
        {
          estudianteId: student.id,
          seccionId: section.id,
          anioAcademicoId: section.anioAcademicoId,
        },
        db,
      ),
    };
  });
}
function validTeacher(t) {
  return (
    t?.persona.activo &&
    t.persona.usuario?.activo &&
    t.persona.usuario.roles.some((r) => r.rol.nombre === 'DOCENTE')
  );
}
export function createBlock(input, actor, requestId) {
  return mutation(actor, requestId, 'BLOQUE_ASIGNADO', async (db) => {
    const section = exists(await repository.findSection(input.seccionId, db), 'La sección');
    exists(await repository.findCourse(input.cursoId, db), 'El curso');
    exists(await repository.findRoom(input.aulaId, db), 'El aula');
    if (!validTeacher(await repository.findTeacher(input.docenteId, db)))
      fail(400, 'INVALID_TEACHER', 'Selecciona un docente con cuenta activa y rol DOCENTE.');
    const conflict = await repository.conflictingBlock(input, section.anioAcademicoId, db);
    if (conflict) {
      const reason = [];
      if (conflict.asignacion.docenteId === input.docenteId) reason.push('docente');
      if (conflict.aulaId === input.aulaId) reason.push('aula');
      if (conflict.asignacion.seccionId === input.seccionId) reason.push('sección');
      fail(
        409,
        'SCHEDULE_CONFLICT',
        `Cruce de ${reason.join(', ')} con ${conflict.asignacion.curso.nombre} de ${conflict.horaInicio} a ${conflict.horaFin}. No se guardó la asignación.`,
      );
    }
    return { data: await repository.createBlock(input, db) };
  });
}
export function createClass(input, actor, requestId) {
  return mutation(actor, requestId, 'SESION_CLASE_CREADA', async (db) => {
    const block = exists(await repository.findBlock(input.bloqueId, db), 'El bloque');
    if (!validTeacher(await repository.findTeacher(block.asignacion.docenteId, db)))
      fail(
        400,
        'INVALID_TEACHER',
        'El docente del bloque ya no tiene una cuenta activa con rol DOCENTE.',
      );
    const fecha = new Date(input.fecha + 'T00:00:00Z');
    if (String(fecha.getUTCFullYear()) !== block.asignacion.seccion.anioAcademico.codigo)
      fail(400, 'YEAR_MISMATCH', 'La fecha debe pertenecer al año académico del bloque.');
    if ((fecha.getUTCDay() || 7) !== block.diaSemana)
      fail(400, 'DAY_MISMATCH', 'La fecha debe coincidir con el día de la semana del bloque.');
    if (await repository.existingClass(block.id, fecha, db))
      fail(409, 'DUPLICATE_CLASS', 'Ya existe una sesión para este bloque y fecha.');
    return {
      data: await repository.createClass(
        { bloqueId: block.id, fecha, horaInicio: block.horaInicio, horaFin: block.horaFin },
        db,
      ),
    };
  });
}
export const schedule = () => repository.schedule();
