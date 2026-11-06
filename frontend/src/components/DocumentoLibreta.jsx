const ESCALA_CNEB = [
  {
    nivel: 'AD',
    nombre: 'Logro destacado',
    descripcion:
      'Cuando el estudiante evidencia un nivel superior a lo esperado respecto a la competencia. Esto quiere decir que demuestra aprendizajes que van más allá del nivel esperado.',
  },
  {
    nivel: 'A',
    nombre: 'Logro esperado',
    descripcion:
      'Cuando el estudiante evidencia el nivel esperado respecto a la competencia, demostrando manejo satisfactorio en todas las tareas propuestas y en el tiempo programado.',
  },
  {
    nivel: 'B',
    nombre: 'En proceso',
    descripcion:
      'Cuando el estudiante está próximo o cerca al nivel esperado respecto a la competencia, para lo cual requiere acompañamiento durante un tiempo razonable para lograrlo.',
  },
  {
    nivel: 'C',
    nombre: 'En inicio',
    descripcion:
      'Cuando el estudiante muestra un progreso mínimo en una competencia de acuerdo al nivel esperado. Evidencia con frecuencia dificultades en el desarrollo de las tareas, por lo que necesita mayor tiempo de acompañamiento e intervención del docente.',
  },
];

function Nivel({ valor }) {
  return valor ?? <span className="sr-only">Sin calificación</span>;
}

function DatosGenerales({ institucion, estudiante, matricula }) {
  return (
    <table className="libreta-datos">
      <caption className="sr-only">Datos de la institución y del estudiante</caption>
      <colgroup>
        <col className="libreta-col-rotulo" />
        <col />
        <col className="libreta-col-rotulo" />
        <col />
      </colgroup>
      <tbody>
        <tr>
          <th scope="row">DRE:</th>
          <td>{institucion.dre}</td>
          <th scope="row">UGEL:</th>
          <td>{institucion.ugel}</td>
        </tr>
        <tr>
          <th scope="row">Nivel:</th>
          <td>{institucion.nivel}</td>
          <th scope="row">Código Modular:</th>
          <td>{institucion.codigoModular}</td>
        </tr>
        <tr>
          <th scope="row">Institución Educativa:</th>
          <td colSpan={3}>{institucion.nombre}</td>
        </tr>
        <tr>
          <th scope="row">Grado:</th>
          <td>{matricula.grado}</td>
          <th scope="row">Sección:</th>
          <td>{matricula.seccion}</td>
        </tr>
        <tr>
          <th scope="row">Apellidos y nombres:</th>
          <td colSpan={3}>{estudiante.apellidosNombres}</td>
        </tr>
        <tr>
          <th scope="row">Código del estudiante:</th>
          <td>{estudiante.codigo}</td>
          <th scope="row">DNI:</th>
          <td>{estudiante.dni}</td>
        </tr>
      </tbody>
    </table>
  );
}

// La fila de margen se repite con el encabezado en cada hoja: con @page sin margen, es lo que separa
// la tabla del borde del papel cuando continúa en otra hoja.
function FilaMargen({ columnas }) {
  return (
    <tr className="libreta-margen" aria-hidden="true">
      <td colSpan={columnas} />
    </tr>
  );
}

function TablaAnual({ areas, periodos }) {
  const columnas = periodos.length + 4;
  return (
    <table className="libreta-notas">
      <caption className="sr-only">Calificativos por competencia y periodo</caption>
      <colgroup>
        <col className="libreta-col-area" />
        <col />
        {periodos.map(({ id }) => (
          <col key={id} className="libreta-col-periodo" />
        ))}
        <col className="libreta-col-anual" />
        <col className="libreta-col-final" />
      </colgroup>
      <thead>
        <FilaMargen columnas={columnas} />
        <tr>
          <th scope="col" rowSpan={2}>
            Área curricular
          </th>
          <th scope="col" rowSpan={2}>
            Competencias
          </th>
          <th scope="colgroup" colSpan={periodos.length}>
            Calificativo por periodo
          </th>
          <th scope="col" rowSpan={2} className="libreta-girado">
            <span>Calif. anual de Comp.</span>
          </th>
          <th scope="col" rowSpan={2}>
            Calif. final del área
          </th>
        </tr>
        <tr>
          {periodos.map(({ id, numero }) => (
            <th scope="col" key={id}>
              {numero}
            </th>
          ))}
        </tr>
      </thead>
      {areas.map((area) => (
        <tbody key={area.id}>
          {area.competencias.map((competencia, indice) => (
            <tr key={competencia.id}>
              {indice === 0 && (
                <th scope="rowgroup" rowSpan={area.competencias.length}>
                  {area.nombre}
                </th>
              )}
              <td className="libreta-competencia">{competencia.nombre}</td>
              {periodos.map(({ id, numero }) => (
                <td key={id} className="libreta-nivel">
                  <Nivel valor={competencia.logros[numero]} />
                </td>
              ))}
              <td className="libreta-nivel libreta-anual">
                <Nivel valor={competencia.calificacionAnual} />
              </td>
              {indice === 0 && (
                <td rowSpan={area.competencias.length} className="libreta-nivel">
                  <Nivel valor={area.calificacionFinal} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      ))}
      <tfoot>
        <FilaMargen columnas={columnas} />
      </tfoot>
    </table>
  );
}

function TablaBimestral({ areas, periodo }) {
  return (
    <table className="libreta-notas">
      <caption className="sr-only">Calificativos por competencia de {periodo.nombre}</caption>
      <colgroup>
        <col className="libreta-col-area" />
        <col />
        <col className="libreta-col-calificativo" />
      </colgroup>
      <thead>
        <FilaMargen columnas={3} />
        <tr>
          <th scope="col">Área curricular</th>
          <th scope="col">Competencias</th>
          <th scope="col">Calificativo</th>
        </tr>
      </thead>
      {areas.map((area) => (
        <tbody key={area.id}>
          {area.competencias.map((competencia, indice) => (
            <tr key={competencia.id}>
              {indice === 0 && (
                <th scope="rowgroup" rowSpan={area.competencias.length}>
                  {area.nombre}
                </th>
              )}
              <td className="libreta-competencia">{competencia.nombre}</td>
              <td className="libreta-nivel">
                <Nivel valor={competencia.logros[periodo.numero]} />
              </td>
            </tr>
          ))}
        </tbody>
      ))}
      <tfoot>
        <FilaMargen columnas={3} />
      </tfoot>
    </table>
  );
}

function EscalaCalificaciones() {
  return (
    <section>
      <h3 className="libreta-subtitulo">Escala de calificaciones del CNEB</h3>
      <table className="libreta-escala">
        <caption className="sr-only">Significado de cada nivel de logro</caption>
        <colgroup>
          <col className="libreta-col-periodo" />
          <col />
        </colgroup>
        <tbody>
          {ESCALA_CNEB.map(({ nivel, nombre, descripcion }) => (
            <tr key={nivel}>
              <th scope="row">{nivel}</th>
              <td>
                <strong>{nombre}</strong>
                <p>{descripcion}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function DocumentoLibreta({ libreta, periodo = null }) {
  const { institucion, estudiante, matricula, periodos, areas } = libreta;
  return (
    <div className="libreta-visor">
      <article className="libreta-hoja">
        <h2 className="libreta-titulo">
          Informe de progreso del aprendizaje
          <br />
          del estudiante - {periodo ? `${periodo.nombre} - ` : ''}
          {matricula.anioAcademico}
        </h2>
        <DatosGenerales institucion={institucion} estudiante={estudiante} matricula={matricula} />
        {periodo ? (
          <TablaBimestral areas={areas} periodo={periodo} />
        ) : (
          <TablaAnual areas={areas} periodos={periodos} />
        )}
        <div className="libreta-cierre">
          <EscalaCalificaciones />
          <div className="libreta-firmas">
            <p>Firma y sello del Docente o Tutor(a)</p>
            <p>Firma y sello del Director(a)</p>
          </div>
        </div>
      </article>
    </div>
  );
}
