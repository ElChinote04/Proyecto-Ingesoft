import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import { env, backendRoot } from '../config/env.js';
export const logDirectory = path.resolve(backendRoot, env.LOG_DIR);
fs.mkdirSync(logDirectory, { recursive: true });
for (const name of ['app.log', 'error.log'])
  fs.closeSync(fs.openSync(path.join(logDirectory, name), 'a'));
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({
      filename: path.join(logDirectory, 'app.log'),
      maxsize: 5_000_000,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(logDirectory, 'error.log'),
      level: 'error',
      maxsize: 5_000_000,
      maxFiles: 3,
    }),
  ],
});
