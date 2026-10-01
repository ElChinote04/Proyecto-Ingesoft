import { useState } from 'react';
import { useResource } from '../hooks/useResource';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { formatDate } from '../utils/format';
import AppLayout from '../layouts/AppLayout';
function Selection({ sessions }) {
  const [sectionId, setSectionId] = useState(sessions[0]?.seccion.id);
  const [courseId, setCourseId] = useState(sessions[0]?.curso.id);
  const [selectedId, setSelectedId] = useState(sessions[0]?.id);
  if (!sessions.length)
    return (
      <Feedback intent="info" title="Sin sesiones asignadas">
        No tienes sesiones de clase disponibles.
      </Feedback>
    );
  const sections = [
    ...new Map(
      sessions.map((s) => [s.seccion.id, { ...s.seccion, anio: s.anioAcademico }]),
    ).values(),
  ];
  const inSection = sessions.filter((s) => s.seccion.id === sectionId);
  const courses = [...new Map(inSection.map((s) => [s.curso.id, s.curso])).values()];
  const candidates = inSection.filter((s) => s.curso.id === courseId);
  const selected = candidates.find((s) => s.id === selectedId) ?? candidates[0];
  function changeSection(value) {
    const first = sessions.find((s) => s.seccion.id === value);
    setSectionId(value);
    setCourseId(first.curso.id);
    setSelectedId(first.id);
  }
  return (
    <>
      <div className="card session-form">
        <label className="field">
          Sección
          <select value={sectionId} onChange={(e) => changeSection(Number(e.target.value))}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.anio} · {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Curso
          <select
            value={courseId}
            onChange={(e) => {
              setCourseId(Number(e.target.value));
              setSelectedId(null);
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fecha y bloque
          <select
            value={selected?.id ?? ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDate(s.fecha)} · {s.horaInicio}–{s.horaFin}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Aula
          <input value={selected?.aula ?? ''} readOnly />
        </label>
        <label className="field">
          Docente
          <input value={selected?.docente.nombre ?? ''} readOnly />
        </label>
        <label className="field">
          Año académico
          <input value={selected?.anioAcademico ?? ''} readOnly />
        </label>
      </div>
      <div className="actions">
        <button
          onClick={() => {
            window.location.hash = `/sesiones/${selected.id}`;
          }}
        >
          Continuar
        </button>
      </div>
    </>
  );
}
export default function SessionSelect() {
  const result = useResource('/sesiones');
  return (
    <AppLayout>
      <div className="page-heading">
        <h1>Selecciona la sesión de clase</h1>
        <p className="muted">La asistencia quedará asociada a la fecha, sección, curso y bloque.</p>
      </div>
      {result.loading ? (
        <Loading>Cargando tus sesiones…</Loading>
      ) : result.error ? (
        <ResourceError {...result} />
      ) : (
        <Selection sessions={result.data} />
      )}
    </AppLayout>
  );
}
