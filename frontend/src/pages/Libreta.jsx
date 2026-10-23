import { useMemo, useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';

const periods = [
  { id: 1, label: 'I Bimestre' },
  { id: 2, label: 'II Bimestre' },
  { id: 3, label: 'III Bimestre' },
  { id: 4, label: 'IV Bimestre' },
];
const progressByLevel = {
  AD: 'Desempeño destacado',
  A: 'Buen desempeño',
  B: 'Requiere refuerzo',
  C: 'Desempeño insuficiente',
};

function Achievement({ value }) {
  return <span className={`achievement achievement-${value.toLowerCase()}`}>{value}</span>;
}

export default function Evaluaciones() {
  const students = useResource('/portal/estudiantes');
  const bimesters = useResource('/bimestres');
  const [selectedId, setSelectedId] = useState(null);
  const [periodId, setPeriodId] = useState('');
  const selectedPeriodId = periodId || bimesters.data?.[0]?.id || periods[0].id;
  const availablePeriods = bimesters.data?.length ? bimesters.data : periods;
  const student =
    students.data?.find((item) => item.id === selectedId) ?? students.data?.[0];
  const enrollment = student?.matriculas?.[0];
  const grades = useResource(student ? `/calificaciones?estudianteId=${student.id}` : '/calificaciones?estudianteId=0');
  const evaluations = useMemo(
    () => (grades.data ?? [])
      .filter((grade) => Number(grade.bimestreId) === Number(selectedPeriodId))
      .flatMap((grade) => (grade.competencias ?? []).map((item) => ({
        curso: grade.asignacion?.curso?.nombre ?? 'Curso',
        competencia: item.competencia?.nombre ?? 'Competencia',
        logro: item.nivelLogro,
        progreso: progressByLevel[item.nivelLogro] ?? 'Sin progreso',
      }))),
    [grades.data, selectedPeriodId],
  );

  if (students.loading || bimesters.loading)
    return (
      <AppLayout section="Mis evaluaciones" step="Libreta">
        <Loading>Cargando libreta…</Loading>
      </AppLayout>
    );
  if (students.error || bimesters.error)
    return (
      <AppLayout section="Mis evaluaciones" step="Libreta">
        <ResourceError error={students.error || bimesters.error} retry={() => { students.retry(); bimesters.retry(); }} />
      </AppLayout>
    );

  return (
    <AppLayout
      section="Mis evaluaciones"
      step="Libreta"
      anioAcademico={enrollment?.anioAcademico}
    >
      <div className="page-heading">
        <h1>Libreta de notas · {availablePeriods.find((period) => Number(period.id) === Number(selectedPeriodId))?.nombre || availablePeriods.find((period) => Number(period.id) === Number(selectedPeriodId))?.label}</h1>
        <p className="muted">
          Resultados publicados para {student?.nombre ?? 'el estudiante'}
          {enrollment?.seccion ? ` · ${enrollment.seccion}.` : '.'}
        </p>
      </div>
      {student && <label className="field evaluations-selector">Bimestre<select value={selectedPeriodId} onChange={(event) => setPeriodId(Number(event.target.value))}>{availablePeriods.map((period) => <option key={period.id} value={period.id}>{period.nombre || period.label}</option>)}</select></label>}
      {grades.loading && <Loading>Cargando resultados…</Loading>}
      {grades.error && <ResourceError {...grades} />}
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
            <span className={evaluations.length ? 'published-badge' : 'published-badge unpublished-badge'}>{evaluations.length ? 'Publicado' : 'No publicado'}</span>
          </div>
          {!evaluations.length && !grades.loading && <Feedback intent="info" title="Bimestre no publicado">El docente todavía no ha registrado calificaciones para este bimestre.</Feedback>}
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
                {evaluations.map((evaluation, index) => (
                  <tr key={`${evaluation.curso}-${evaluation.competencia}-${index}`}>
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
