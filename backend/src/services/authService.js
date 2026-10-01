import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import * as repository from '../repositories/authRepository.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
const issuer = 'sage-api';
const audience = 'sage-web';
// Comparación de costo equivalente para identificadores inexistentes.
const dummyHash = await bcrypt.hash(randomUUID(), 12);
export function safeUser(user) {
  return {
    id: user.id,
    identificador: user.identificador,
    nombre: `${user.persona.nombres} ${user.persona.apellidos}`,
    roles: user.roles.map((r) => r.rol.nombre),
    docenteId: user.persona.docente?.id ?? null,
  };
}
export async function login(credentials, requestId) {
  const user = await repository.findUserByIdentifier(credentials.identificador);
  const validPassword = await bcrypt.compare(
    credentials.contrasena,
    user?.hashContrasena ?? dummyHash,
  );
  if (!user || !validPassword || !user.activo || !user.persona.activo || !user.roles.length) {
    logger.warn('Login fallido', { module: 'auth', requestId, userId: user?.id });
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'El usuario o la contraseña son incorrectos, o la cuenta no está habilitada. Verifica tus credenciales e inténtalo nuevamente.',
    );
  }
  const sessionId = randomUUID();
  const token = jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    jwtid: sessionId,
    issuer,
    audience,
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const { exp } = jwt.decode(token);
  await repository.deleteExpiredSessions();
  await repository.createSession({
    id: sessionId,
    usuarioId: user.id,
    expiraEn: new Date(exp * 1000),
  });
  logger.info('Login exitoso', { module: 'auth', requestId, userId: user.id });
  return { token, expiresAt: exp * 1000, user: safeUser(user) };
}
export async function authenticate(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer, audience });
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
  const user = await repository.findUserById(session.usuarioId);
  if (!user?.activo || !user.persona.activo || !user.roles.length)
    throw new AppError(401, 'SESSION_EXPIRED', 'Tu cuenta no está habilitada.');
  return { user: safeUser(user), sessionId: session.id };
}
export const logout = (sessionId) => repository.deleteSession(sessionId);
