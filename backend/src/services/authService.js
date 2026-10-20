import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import * as repository from '../repositories/authRepository.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { obtenerPermisos } from './seguridad.service.js';
const ISSUER = 'sage-api';
const AUDIENCE = 'sage-web';
const dummyHash = await bcrypt.hash(randomUUID(), 12);
export function safeUser(user) {
  const roles = user.roles.map((item) => item.rol.nombre);
  return {
    id: user.id,
    identificador: user.identificador,
    nombre: `${user.persona.nombres} ${user.persona.apellidos}`,
    roles,
    permisos: obtenerPermisos(roles),
    docenteId: user.persona.docente?.id ?? null,
    estudianteId: user.persona.estudiante?.id ?? null,
    apoderadoId: user.persona.apoderado?.id ?? null,
    requiereCambioContrasena: user.requiereCambioContrasena,
    inactividadSegundos: env.SESSION_IDLE_SECONDS,
  };
}
export async function login(credentials, requestId, origen) {
  const result = await repository.transaction(async (db) => {
    const user = await repository.lockIdentifier(credentials.identificador, db);
    const validPassword = await bcrypt.compare(
      credentials.contrasena,
      user?.hashContrasena ?? dummyHash,
    );
    const bloqueada = user?.bloqueadoHasta && user.bloqueadoHasta > new Date();
    if (
      !user ||
      bloqueada ||
      !validPassword ||
      !user.activo ||
      !user.persona.activo ||
      !user.roles.length
    ) {
      if (user && !bloqueada && user.activo) {
        const intentosFallidos = user.bloqueadoHasta ? 1 : user.intentosFallidos + 1;
        await repository.updateUser(
          user.id,
          {
            intentosFallidos,
            bloqueadoHasta:
              intentosFallidos >= env.LOGIN_MAX_ATTEMPTS
                ? new Date(Date.now() + env.LOGIN_LOCK_SECONDS * 1000)
                : null,
          },
          db,
        );
      }
      await repository.audit(
        {
          usuarioId: user?.id ?? null,
          tipoEvento: 'LOGIN_FALLIDO',
          entidad: 'Usuario',
          entidadId: user?.id ?? 0,
          resultado: 'DENEGADO',
          requestId,
          detalle: { identificador: credentials.identificador, origen },
        },
        db,
      );
      return null;
    }
    await repository.updateUser(user.id, { intentosFallidos: 0, bloqueadoHasta: null }, db);
    const sessionId = randomUUID();
    const token = jwt.sign({}, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: String(user.id),
      jwtid: sessionId,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: env.JWT_EXPIRES_IN,
    });
    const { exp } = jwt.decode(token);
    await repository.deleteExpiredSessions(db);
    await repository.createSession(
      { id: sessionId, usuarioId: user.id, expiraEn: new Date(exp * 1000) },
      db,
    );
    await repository.audit(
      {
        usuarioId: user.id,
        tipoEvento: 'LOGIN_EXITOSO',
        entidad: 'Usuario',
        entidadId: user.id,
        requestId,
        detalle: { sesionId: sessionId, origen },
      },
      db,
    );
    return { token, expiresAt: exp * 1000, user: safeUser(user) };
  });
  if (!result) {
    logger.warn('Login fallido', { module: 'auth', requestId });
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'No pudimos validar el acceso. Revisa tus credenciales y el estado de tu cuenta. Si acumulaste varios intentos fallidos, espera antes de volver a intentar.',
    );
  }
  logger.info('Login exitoso', { module: 'auth', requestId, userId: result.user.id });
  return result;
}
export async function authenticate(token, background = false) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch {
    throw new AppError(
      401,
      'SESSION_EXPIRED',
      'Tu sesión venció o no es válida. Inicia sesión nuevamente.',
    );
  }
  if (!payload.jti || !/^\d+$/.test(payload.sub))
    throw new AppError(401, 'SESSION_EXPIRED', 'Inicia sesión nuevamente.');
  const session = await repository.findSession(payload.jti);
  if (!session || session.usuarioId !== Number(payload.sub) || session.expiraEn <= new Date())
    throw new AppError(401, 'SESSION_EXPIRED', 'Tu sesión venció. Inicia sesión nuevamente.');
  if (Date.now() - session.ultimaActividad.getTime() >= env.SESSION_IDLE_SECONDS * 1000) {
    await repository.deleteSession(session.id);
    throw new AppError(
      401,
      'SESSION_IDLE',
      'Tu sesión se cerró por inactividad. Inicia sesión nuevamente.',
    );
  }
  const user = await repository.findUserById(session.usuarioId);
  if (!user?.activo || !user.persona.activo || !user.roles.length) {
    await repository.deleteSession(session.id);
    throw new AppError(401, 'SESSION_EXPIRED', 'Tu cuenta no está habilitada.');
  }
  if (!background) await repository.touchSession(session.id);
  return { user: safeUser(user), sessionId: session.id };
}
export async function cambiarContrasena(input, user, requestId) {
  const hash = await bcrypt.hash(input.nuevaContrasena, 12);
  await repository.transaction(async (db) => {
    const current = await repository.lockIdentifier(user.identificador, db);
    if (!current || !(await bcrypt.compare(input.contrasenaActual, current.hashContrasena)))
      throw new AppError(400, 'INVALID_PASSWORD', 'La contraseña actual no es correcta.');
    if (await bcrypt.compare(input.nuevaContrasena, current.hashContrasena))
      throw new AppError(400, 'SAME_PASSWORD', 'Elige una contraseña diferente de la actual.');
    await repository.updateUser(
      user.id,
      { hashContrasena: hash, requiereCambioContrasena: false },
      db,
    );
    await repository.revokeSessions(user.id, db);
    await repository.audit(
      {
        usuarioId: user.id,
        tipoEvento: 'CONTRASENA_CAMBIADA',
        entidad: 'Usuario',
        entidadId: user.id,
        requestId,
        detalle: { sesionesRevocadas: true },
      },
      db,
    );
  });
  return { message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' };
}
export function registrarDenegacion(req) {
  return repository.audit({
    usuarioId: req.user?.id ?? null,
    tipoEvento: 'ACCESO_DENEGADO',
    resultado: 'DENEGADO',
    entidad: 'Usuario',
    entidadId: req.user?.id ?? 0,
    requestId: req.requestId,
    detalle: { ruta: req.path, metodo: req.method, ip: req.ip, sesionId: req.sessionId ?? null },
  });
}
export const logout = (sessionId) => repository.deleteSession(sessionId);
