export const formatDate = (value) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
export const formatTimestamp = (value) =>
  new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(value));
// Filtro que una pantalla recibe por enlace, por ejemplo #/errores?requestId=...
export const filtroDelEnlace = (campo) =>
  new URLSearchParams(window.location.hash.split('?')[1] ?? '').get(campo) ?? '';
// Ruta actual sin los filtros del enlace, para marcar la opción activa del menú.
export const rutaActual = () => window.location.hash.split('?')[0];
export const statuses = [
  ['PRESENTE', 'Presente', 'success'],
  ['TARDANZA', 'Tardanza', 'warning'],
  ['AUSENTE', 'Ausente', 'danger'],
];
