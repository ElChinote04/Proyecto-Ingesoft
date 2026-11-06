import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backendRoot, env } from '../config/env.js';

const carpeta = path.resolve(backendRoot, env.EVIDENCIAS_DIR);

// El nombre en disco lo genera el servidor: ninguna ruta se arma con datos del cliente.
async function guardarArchivo(contenido) {
  const nombreAlmacenado = randomUUID();
  await writeFile(path.join(carpeta, nombreAlmacenado), contenido, { flag: 'wx' });
  return nombreAlmacenado;
}

export async function guardarArchivos(contenidos) {
  await mkdir(carpeta, { recursive: true });
  const resultados = await Promise.allSettled(contenidos.map(guardarArchivo));
  const fallo = resultados.find(({ status }) => status === 'rejected');
  if (fallo) {
    await borrarArchivos(
      resultados.filter(({ status }) => status === 'fulfilled').map(({ value }) => value),
    );
    throw fallo.reason;
  }
  return resultados.map(({ value }) => value);
}

export const borrarArchivos = (nombres) =>
  Promise.allSettled(nombres.map((nombre) => unlink(path.join(carpeta, nombre))));

export async function leerArchivo(nombreAlmacenado) {
  try {
    return await readFile(path.join(carpeta, nombreAlmacenado));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
