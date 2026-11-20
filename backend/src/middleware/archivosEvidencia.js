import multer from 'multer';
import { AppError } from '../errors/AppError.js';
import { MAX_ARCHIVOS_EVIDENCIA, MAX_BYTES_ARCHIVO } from '../domain/archivoEvidencia.js';

const CAMPO_ARCHIVOS = 'archivos';

// En memoria para validar los primeros bytes antes de escribir nada en disco.
const subida = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: {
    fileSize: MAX_BYTES_ARCHIVO,
    files: MAX_ARCHIVOS_EVIDENCIA,
    fields: 5,
    fieldSize: 16 * 1024,
  },
}).array(CAMPO_ARCHIVOS, MAX_ARCHIVOS_EVIDENCIA);

function traducirError(error) {
  if (error.code === 'LIMIT_FILE_SIZE')
    return new AppError(400, 'FILE_TOO_LARGE', 'Cada archivo puede pesar hasta 5 MB.');
  if (
    error.code === 'LIMIT_FILE_COUNT' ||
    (error.code === 'LIMIT_UNEXPECTED_FILE' && error.field === CAMPO_ARCHIVOS)
  )
    return new AppError(
      400,
      'TOO_MANY_FILES',
      `Puedes adjuntar hasta ${MAX_ARCHIVOS_EVIDENCIA} archivos por evidencia.`,
    );
  return new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.');
}

export function recibirArchivos(req, res, next) {
  subida(req, res, (error) => next(error && traducirError(error)));
}
