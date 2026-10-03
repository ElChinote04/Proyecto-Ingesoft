import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
export function errorHandler(error, req, res, _next) {
  let known = error instanceof AppError ? error : null;
  if (error.type === 'entity.parse.failed')
    known = new AppError(400, 'INVALID_JSON', 'El cuerpo debe ser JSON válido.');
  if (error.type === 'entity.too.large')
    known = new AppError(413, 'BODY_TOO_LARGE', 'La solicitud es demasiado grande.');
  if (error.code === 'P2002')
    known = new AppError(409, 'CONFLICT', 'Ya existe un registro con esos datos.');
  const status = known?.status ?? 500;
  // Nunca registrar body, cookies, URL de BD ni el mensaje libre de un driver.
  logger.log(status >= 500 ? 'error' : 'warn', known?.message ?? 'Error interno de aplicación', {
    module: 'http',
    requestId: req.requestId,
    userId: req.user?.id,
    code: known?.code ?? 'INTERNAL_ERROR',
    errorType: error.name,
    ...(status >= 500 && {
      stackFrames: String(error.stack ?? '')
        .split('\n')
        .filter((line) => /^\s+at /.test(line))
        .slice(0, 8),
    }),
  });
  res.status(status).json({
    error: {
      code: known?.code ?? 'INTERNAL_ERROR',
      message: known?.message ?? 'No pudimos completar la operación. Inténtalo nuevamente.',
      ...(known?.details && { details: known.details }),
      requestId: req.requestId,
    },
  });
}
