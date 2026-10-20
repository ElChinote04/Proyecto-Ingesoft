const PERMISOS_POR_ROL = {
  ADMINISTRADOR: ['administrar', 'auditoria.consultar'],
  DOCENTE: ['asistencia.registrar', 'horario.consultar'],
  ALUMNO: ['portal.consultar', 'horario.consultar'],
  APODERADO: ['portal.consultar'],
};
export function obtenerPermisos(roles) {
  return [...new Set(roles.flatMap((rol) => PERMISOS_POR_ROL[rol] ?? []))];
}
