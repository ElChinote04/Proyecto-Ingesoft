import { authenticate } from '../services/authService.js';
import { AppError } from '../errors/AppError.js';
export async function requireAuth(req, _res, next) {
  if (!req.cookies.sage_session)
    throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
  const result = await authenticate(req.cookies.sage_session, req.get('X-Sage-Background') === '1');
  req.user = result.user;
  req.sessionId = result.sessionId;
  if (
    req.user.requiereCambioContrasena &&
    !['/auth/me', '/auth/contrasena', '/auth/logout'].includes(req.path)
  )
    throw new AppError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Debes cambiar tu contraseña inicial para continuar.',
    );
  next();
}
export const requireRole = (role) => (req, _res, next) => {
  if (!req.user?.roles.includes(role))
    throw new AppError(
      403,
      'FORBIDDEN',
      'Tu usuario no tiene permiso para realizar esta operación.',
    );
  next();
};
