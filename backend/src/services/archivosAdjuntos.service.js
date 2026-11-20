import * as almacen from '../integrations/almacenEvidencias.js';
import { detectarTipoArchivo, normalizarNombreArchivo } from '../domain/archivoEvidencia.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

// Archivos que se adjuntan a un registro (una actividad del plan, el examen corregido de un
// alumno). El tipo se decide por los primeros bytes, nunca por lo que declara el cliente.
export function prepararArchivos(archivos) {
  return archivos.map(({ buffer, originalname, size }) => {
    const tipoMime = detectarTipoArchivo(buffer);
    if (!tipoMime)
      throw new AppError(400, 'FILE_TYPE_NOT_ALLOWED', 'Solo se aceptan archivos PDF, JPG o PNG.');
    return {
      contenido: buffer,
      nombreOriginal: normalizarNombreArchivo(originalname),
      tipoMime,
      tamanoBytes: size,
    };
  });
}

/**
 * Los archivos van primero a disco (escribirlos dentro de la transacción arriesgaría su
 * tiempo límite) y se borran si la operación falla después: nunca queda una fila sin su
 * archivo ni un archivo sin su fila.
 */
export async function conArchivosEnDisco(archivos, actor, operacion) {
  if (!archivos.length) return operacion([]);
  const nombres = await almacen.guardarArchivos(archivos.map(({ contenido }) => contenido));
  const registros = archivos.map(({ nombreOriginal, tipoMime, tamanoBytes }, indice) => ({
    nombreOriginal,
    tipoMime,
    tamanoBytes,
    nombreAlmacenado: nombres[indice],
    creadoPorId: actor.id,
  }));
  try {
    return await operacion(registros);
  } catch (error) {
    await almacen.borrarArchivos(nombres);
    throw error;
  }
}

/** Lee un archivo ya registrado; si falta en disco lo deja en el log y responde 404. */
export async function leerArchivoRegistrado(archivo, contextoLog) {
  const contenido = await almacen.leerArchivo(archivo.nombreAlmacenado);
  if (!contenido) {
    logger.error('Falta en disco un archivo adjunto', contextoLog);
    throw new AppError(404, 'FILE_NOT_FOUND', 'El archivo no está disponible.');
  }
  return { contenido, nombre: archivo.nombreOriginal, tipoMime: archivo.tipoMime };
}
