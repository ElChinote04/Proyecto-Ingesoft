export const MAX_ARCHIVOS_EVIDENCIA = 3;
export const MAX_BYTES_ARCHIVO = 5 * 1024 * 1024;

const FIRMAS = [
  { tipoMime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { tipoMime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipoMime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

// La extensión y el tipo que declara el cliente se pueden falsificar; los primeros bytes no.
export function detectarTipoArchivo(contenido) {
  const firma = FIRMAS.find(({ bytes }) => bytes.every((byte, i) => contenido[i] === byte));
  return firma?.tipoMime ?? null;
}

export function normalizarNombreArchivo(nombre) {
  const base = String(nombre ?? '')
    .split(/[\\/]/)
    .at(-1)
    .replace(/\p{Cc}/gu, '')
    .trim();
  return base.slice(-255) || 'archivo';
}
