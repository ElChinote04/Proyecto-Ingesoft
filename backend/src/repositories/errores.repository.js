import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../config/database.js';
import { logDirectory } from '../logging/logger.js';

// app.log y sus copias rotadas por Winston: app1.log, app2.log...
const ARCHIVOS_LOG = /^app\d*\.log$/;

function interpretarLinea(linea) {
  try {
    return JSON.parse(linea);
  } catch {
    // Una línea puede estar a medio escribir mientras se consulta el log: se omite.
    return null;
  }
}

export async function leerRegistros() {
  const archivos = (await fs.readdir(logDirectory)).filter((nombre) => ARCHIVOS_LOG.test(nombre));
  const contenidos = await Promise.all(
    archivos.map((nombre) => fs.readFile(path.join(logDirectory, nombre), 'utf8')),
  );
  return contenidos
    .flatMap((contenido) => contenido.split('\n'))
    .map(interpretarLinea)
    .filter(Boolean);
}

export const obtenerCuentas = (ids) =>
  prisma.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, identificador: true },
  });
