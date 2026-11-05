import { buildScheduleMatrix } from '../utils/scheduleMatrix';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export default function MatrizHorarios({ bloques, onSelect }) {
  const { horas, alturas, dias } = buildScheduleMatrix(bloques);
  const columnas = dias.reduce((total, dia) => total + dia.length, 0);
  return (
    <div className="table-card timeline-scroll">
      <table
        className="schedule-matrix schedule-timeline"
        style={{ minWidth: 80 + columnas * 155 }}
      >
        <caption>
          Horario semanal · selecciona un bloque para editar o retirar su asignación
        </caption>
        <colgroup>
          <col style={{ width: 80 }} />
          {Array.from({ length: columnas }, (_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            {DIAS.map((dia, i) => (
              <th key={dia} scope="colgroup" colSpan={dias[i].length}>
                {dia}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!horas.length ? (
            <tr>
              <td colSpan={columnas + 1}>No hay bloques para estos filtros.</td>
            </tr>
          ) : (
            horas.slice(0, -1).map((inicio, indice) => (
              <tr key={inicio} style={{ height: alturas[indice] }}>
                <th scope="row" className="timeline-hour">
                  {inicio}
                </th>
                {dias.flatMap((carriles, dia) =>
                  carriles.map((items, columna) => {
                    const bloque = items.find((b) => b.horaInicio <= inicio && b.horaFin > inicio);
                    const key = `${dia}-${columna}`;
                    if (!bloque) return <td key={key} className="timeline-empty" />;
                    if (bloque.horaInicio !== inicio) return null;
                    const fin = horas.indexOf(bloque.horaFin);
                    const seccion = `${bloque.asignacion.seccion.grado.nombre} ${bloque.asignacion.seccion.nombre}`;
                    const docente = `${bloque.asignacion.docente.persona.nombres} ${bloque.asignacion.docente.persona.apellidos}`;
                    const activo = bloque.asignacion.seccion.anioAcademico.activo;
                    return (
                      <td key={key} rowSpan={fin - indice} className="timeline-occupied">
                        <button
                          type="button"
                          className="schedule-block matrix-edit-block"
                          disabled={!activo}
                          onClick={() => onSelect(bloque)}
                          aria-label={`${activo ? 'Editar asignación' : 'Asignación histórica'}: ${bloque.asignacion.curso.nombre}, ${seccion}, ${DIAS[dia]}, ${bloque.horaInicio} a ${bloque.horaFin}, ${docente}, aula ${bloque.aula.codigo}`}
                        >
                          <strong>{bloque.asignacion.curso.nombre}</strong>
                          <span>
                            {bloque.asignacion.seccion.anioAcademico.codigo} · {seccion}
                          </span>
                          <span>{docente}</span>
                          <span>
                            {bloque.aula.codigo} · {bloque.horaInicio}–{bloque.horaFin}
                          </span>
                          <small>
                            Bloque #{bloque.id}
                            {!activo && ' · Solo lectura'}
                          </small>
                        </button>
                      </td>
                    );
                  }),
                )}
              </tr>
            ))
          )}
          {horas.length > 0 && (
            <tr>
              <th scope="row" className="timeline-hour">
                {horas.at(-1)}
              </th>
              <td colSpan={columnas} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
