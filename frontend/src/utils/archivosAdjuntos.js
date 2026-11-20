// Validación de adjuntos en el navegador: solo evita un envío inútil, el servidor revisa el
// contenido de cada archivo.
export const MAX_ARCHIVOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONES = /\.(pdf|jpe?g|png)$/i;

export const formatearTamano = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export function validarArchivos(archivos, yaAdjuntos, unidad = 'evidencia') {
  if (archivos.length + yaAdjuntos > MAX_ARCHIVOS)
    return `Puedes adjuntar hasta ${MAX_ARCHIVOS} archivos por ${unidad}.`;
  if (archivos.some(({ name }) => !EXTENSIONES.test(name)))
    return 'Solo se aceptan archivos PDF, JPG o PNG.';
  if (archivos.some(({ size }) => size > MAX_BYTES)) return 'Cada archivo puede pesar hasta 5 MB.';
  return '';
}
