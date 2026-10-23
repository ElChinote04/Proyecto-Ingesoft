import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';

const period = 'III Bimestre';
const evaluations = [
  {
    curso: 'Matemática',
    competencia: 'Resuelve problemas de cantidad',
    logro: 'A',
    progreso: 'Mejoró desde B',
  },
  {
    curso: 'Comunicación',
    competencia: 'Lee diversos tipos de textos',
    logro: 'AD',
    progreso: 'Desempeño destacado',
  },
  {
    curso: 'Ciencia y Tecnología',
    competencia: 'Indaga mediante métodos científicos',
    logro: 'A',
    progreso: 'Mantiene el logro',
  },
  {
    curso: 'Ciencias Sociales',
    competencia: 'Construye interpretaciones históricas',
    logro: 'B',
    progreso: 'Requiere refuerzo',
  },
];

function Achievement({ value }) {
  return <span className={`achievement achievement-${value.toLowerCase()}`}>{value}</span>;
}

export default function Evaluaciones() {
  const students = useResource('/portal/estudiantes');
  const [selectedId, setSelectedId] = useState(null);
  const student =
    students.data?.find((item) => item.id === selectedId) ?? students.data?.[0];
  const enrollment = student?.matriculas?.[0];

  if (students.loading)
    return (
      <AppLayout section="Mis evaluaciones" step="Libreta">
        <Loading>Cargando libreta…</Loading>
      </AppLayout>
    );
  if (students.error)
    return (
      <AppLayout section="Mis evaluaciones" step="Libreta">
        <ResourceError {...students} />
      </AppLayout>
    );

  return (
    <AppLayout
      section="Mis evaluaciones"
      step="Libreta"
      anioAcademico={enrollment?.anioAcademico}
    >
      <div className="page-heading">
        <h1>Libreta de notas · {period}</h1>
        <p className="muted">
          Resultados publicados para {student?.nombre ?? 'el estudiante'}
          {enrollment?.seccion ? ` · ${enrollment.seccion}.` : '.'}
        </p>
      </div>
      {students.data?.length > 1 && (
        <label className="field evaluations-selector">
          Consultar estudiante
          <select
            value={student.id}
            onChange={(event) => setSelectedId(Number(event.target.value))}
          >
            {students.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {!student ? (
        <Feedback intent="info" title="Libreta no disponible">
          Todavía no hay una matrícula activa asociada a este perfil.
        </Feedback>
      ) : (
        <>
          <div className="published-notice" role="status">
            <span>Información visible únicamente para el alumno y su apoderado.</span>
            <span className="published-badge">Publicado</span>
          </div>
          <div className="table-card evaluations-card">
            <table>
              <caption className="sr-only">Resultados de la libreta de notas</caption>
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>Competencia</th>
                  <th>Logro</th>
                  <th>Progreso</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <tr key={evaluation.curso}>
                    <td>{evaluation.curso}</td>
                    <td className="muted">{evaluation.competencia}</td>
                    <td>
                      <Achievement value={evaluation.logro} />
                    </td>
                    <td className="progress-copy">{evaluation.progreso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => window.print()}>
            Descargar libreta PDF
          </button>
        </>
      )}
    </AppLayout>
  );
}
