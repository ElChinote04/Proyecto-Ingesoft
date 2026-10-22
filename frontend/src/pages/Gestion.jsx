import { useMemo, useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';

const periods = ['I Bimestre', 'II Bimestre', 'III Bimestre', 'IV Bimestre'];
const competencies = [
  'Resuelve problemas de cantidad',
  'Resuelve problemas de regularidad',
  'Resuelve problemas de forma',
];

function uniqueById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export default function Gestion() {
  const sessions = useResource('/sesiones');
  const [courseId, setCourseId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [period, setPeriod] = useState(periods[2]);
  const [competency, setCompetency] = useState(competencies[0]);
  const [evaluation, setEvaluation] = useState('Práctica 03 · Fracciones');
  const [date, setDate] = useState('2026-09-16');
  const courses = useMemo(
    () => uniqueById((sessions.data ?? []).map((session) => session.curso)),
    [sessions.data],
  );
  const sections = useMemo(
    () => uniqueById((sessions.data ?? []).map((session) => session.seccion)),
    [sessions.data],
  );
  const selectedCourse = courseId || courses[0]?.id || '';
  const selectedSection = sectionId || sections[0]?.id || '';

  if (sessions.loading)
    return (
      <AppLayout section="Gestión Académica" step="Calificaciones">
        <Loading>Cargando cursos y secciones…</Loading>
      </AppLayout>
    );
  if (sessions.error)
    return (
      <AppLayout section="Gestión Académica" step="Calificaciones">
        <ResourceError {...sessions} />
      </AppLayout>
    );

  return (
    <AppLayout
      section="Gestión Académica"
      step="Calificaciones"
      anioAcademico={sessions.data?.[0]?.anioAcademico}
    >
      <div className="page-heading">
        <h1>Registro por competencias</h1>
        <p className="muted">Selecciona el contexto de evaluación y la competencia a calificar.</p>
      </div>
      {!courses.length || !sections.length ? (
        <Feedback intent="info" title="Sin cursos o secciones disponibles">
          No tienes cursos y secciones asignados para registrar calificaciones.
        </Feedback>
      ) : (
        <>
          <div className="card grade-context">
            <label className="field">
              Curso
              <select value={selectedCourse} onChange={(event) => setCourseId(event.target.value)}>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Sección
              <select
                value={selectedSection}
                onChange={(event) => setSectionId(event.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Periodo
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                {periods.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Competencia
              <select
                value={competency}
                onChange={(event) => setCompetency(event.target.value)}
              >
                {competencies.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Evaluación
              <select value={evaluation} onChange={(event) => setEvaluation(event.target.value)}>
                <option>Práctica 03 · Fracciones</option>
                <option>Evaluación de proceso</option>
                <option>Actividad de aprendizaje</option>
              </select>
            </label>
            <label className="field">
              Fecha
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
          <div className="grading-scale" role="note">
            <strong>Escala permitida</strong>
            <span className="scale-badge scale-ad">AD</span>
            <span className="scale-badge scale-a">A</span>
            <span className="scale-badge scale-b">B</span>
            <span className="scale-badge scale-c">C</span>
            <span>No se admiten valores distintos.</span>
          </div>
          <button type="button">Continuar con 32 alumnos</button>
        </>
      )}
    </AppLayout>
  );
}
