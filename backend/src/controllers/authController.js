import * as service from '../services/authService.js';
import { env } from '../config/env.js';
export const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1',
};
export async function login(req, res) {
  const result = await service.login(req.validated.body, req.requestId);
  res.cookie('sage_session', result.token, {
    ...cookieOptions,
    expires: new Date(result.expiresAt),
  });
  res.json({ success: true, data: result.user });
}
export const me = (req, res) => res.json({ success: true, data: req.user });
export async function logout(req, res) {
  await service.logout(req.sessionId);
  res.clearCookie('sage_session', cookieOptions);
  res.json({ success: true, data: { message: 'Sesión cerrada.' } });
}
