import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './errors/AppError.js';
export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === new URL(env.FRONTEND_URL).origin) return callback(null, true);
      callback(new AppError(403, 'ORIGIN_FORBIDDEN', 'Origen de solicitud no permitido.'));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api/v1', router);
app.use((_req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', 'La ruta solicitada no existe.')),
);
app.use(errorHandler);
