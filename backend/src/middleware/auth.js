import { authenticate } from '../services/authService.js';
import { AppError } from '../errors/AppError.js';
export async function requireAuth(req, _res, next) {
  if (!req.cookies.sage_session)
    throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
  const result = await authenticate(req.cookies.sage_session);
  req.user = result.user;
  req.sessionId = result.sessionId;
  next();
}
export const requireRole = (role) => (req, _res, next) => {
  if (!req.user?.roles.includes(role))
    throw new AppError(403, 'FORBIDDEN', 'Tu usuario no tiene permiso para registrar asistencia.');
  next();
};
