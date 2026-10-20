import * as service from '../services/authService.js';
import { env } from '../config/env.js';
export const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1',
};
export async function login(req, res) {
  const result = await service.login(req.validated.body, req.requestId, {
    ip: req.ip,
    ruta: req.path,
    metodo: req.method,
  });
  res.cookie('sage_session', result.token, {
    ...cookieOptions,
    expires: new Date(result.expiresAt),
  });
  res.json({ data: result.user });
}
export async function cambiarContrasena(req, res) {
  const data = await service.cambiarContrasena(req.validated.body, req.user, req.requestId);
  res.clearCookie('sage_session', cookieOptions);
  res.json({ data });
}
export const me = (req, res) => res.json({ data: req.user });
export async function logout(req, res) {
  await service.logout(req.sessionId);
  res.clearCookie('sage_session', cookieOptions);
  res.json({ data: { message: 'Sesión cerrada.' } });
}
