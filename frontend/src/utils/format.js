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
export const statuses = [
  ['PRESENTE', 'Presente', 'success'],
  ['TARDANZA', 'Tardanza', 'warning'],
  ['AUSENTE', 'Ausente', 'danger'],
];
