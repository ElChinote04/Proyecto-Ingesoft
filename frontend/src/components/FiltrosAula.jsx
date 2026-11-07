/**
 * Filtros de año académico, grado y sección para las vistas de cobranza.
 * La lista de secciones se acota al año y grado elegidos.
 */
export default function FiltrosAula({ catalogos, valor, onChange }) {
  const secciones = catalogos.secciones.filter(
    (seccion) =>
      (!valor.anioAcademicoId || String(seccion.anioAcademicoId) === valor.anioAcademicoId) &&
      (!valor.gradoId || String(seccion.gradoId) === valor.gradoId),
  );
  const cambiar = (campo) => (evento) => {
    const siguiente = { ...valor, [campo]: evento.target.value };
    // Una sección que ya no corresponde a los filtros elegidos se descarta.
    if (
      campo !== 'seccionId' &&
      siguiente.seccionId &&
      !catalogos.secciones.some(
        (seccion) =>
          String(seccion.id) === siguiente.seccionId &&
          (!siguiente.anioAcademicoId ||
            String(seccion.anioAcademicoId) === siguiente.anioAcademicoId) &&
          (!siguiente.gradoId || String(seccion.gradoId) === siguiente.gradoId),
      )
    )
      siguiente.seccionId = '';
    onChange(siguiente);
  };
  return (
    <>
      <label className="field">
        Año académico
        <select value={valor.anioAcademicoId} onChange={cambiar('anioAcademicoId')}>
          <option value="">Todos</option>
          {catalogos.anios.map((anio) => (
            <option key={anio.id} value={anio.id}>
              {anio.codigo}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Grado
        <select value={valor.gradoId} onChange={cambiar('gradoId')}>
          <option value="">Todos</option>
          {catalogos.grados.map((grado) => (
            <option key={grado.id} value={grado.id}>
              {grado.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Sección
        <select value={valor.seccionId} onChange={cambiar('seccionId')}>
          <option value="">Todas</option>
          {secciones.map((seccion) => (
            <option key={seccion.id} value={seccion.id}>
              {seccion.grado.nombre} {seccion.nombre} · {seccion.anioAcademico.codigo}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
