import { useMemo, useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

const periods = ['I Bimestre', 'II Bimestre', 'III Bimestre', 'IV Bimestre'];
const INITIAL_COMPETENCIES = [
  'Resuelve problemas de cantidad',
  'Resuelve problemas de regularidad',
  'Resuelve problemas de forma',
];

function uniqueById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

const ruleMethods = [
  ['frecuencia', 'Nivel más frecuente', 'El nivel que aparece más veces.'],
  ['reciente', 'Última evidencia', 'El nivel de la evidencia más reciente.'],
  ['prioridad', 'Prioridad cualitativa', 'Prioriza AD, A, B y C en ese orden.'],
];
const tieBreakers = [
  ['reciente', 'Priorizar nivel más reciente'],
  ['alto', 'Priorizar el nivel más alto'],
  ['bajo', 'Priorizar el nivel más bajo'],
];
const parseMethod = (value) => {
  try {
    const parsed = JSON.parse(value);
    if (parsed.estrategia) return parsed;
  } catch {
    // Compatibilidad con reglas creadas antes de esta configuración.
  }
  return { estrategia: value, desempate: 'reciente', minimoEvidencias: 3 };
};
function AdminRules() {
  const rules = useResource('/reglas-consolidacion');
  const catalogs = useResource('/admin/catalogos');
  const [filters, setFilters] = useState({ curso: '', grado: '', estado: 'activas' });
  const isNew = window.location.hash === '#/gestion/nueva';
  const editMatch = window.location.hash.match(/^#\/gestion\/editar\/(\d+)$/);
  const editingId = editMatch?.[1] ?? '';
  const [form, setForm] = useState({
    nombre: '',
    cursoId: '',
    gradoId: '',
    estrategia: 'frecuencia',
    minimoEvidencias: 3,
    desempate: 'reciente',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const editingRule = (rules.data ?? []).find((rule) => String(rule.id) === editingId);
  const [formDirty, setFormDirty] = useState(false);
  const editDefaults = editingRule
    ? (() => {
        const method = parseMethod(editingRule.metodo);
        return {
          nombre: editingRule.nombre,
          cursoId: String(editingRule.cursoId),
          gradoId: String(editingRule.gradoId),
          estrategia: method.estrategia,
          minimoEvidencias: method.minimoEvidencias ?? 3,
          desempate: method.desempate ?? 'reciente',
        };
      })()
    : null;
  const formValues = editingRule && !formDirty ? editDefaults : form;

  if (catalogs.loading)
    return <AppLayout section="Gestión Académica" step="Reglas"><Loading>Cargando reglas…</Loading></AppLayout>;
  if (catalogs.error)
    return <AppLayout section="Gestión Académica" step="Reglas"><ResourceError error={catalogs.error} retry={catalogs.retry} /></AppLayout>;

  const catalog = catalogs.data;
  const visibleRules = (rules.data ?? []).filter((rule) => (
    (!filters.curso || String(rule.cursoId) === filters.curso) &&
    (!filters.grado || String(rule.gradoId) === filters.grado) &&
    (filters.estado === 'todas' || (filters.estado === 'activas' ? rule.activo : !rule.activo))
  ));
  const update = (key, value) => {
    setFormDirty(true);
    setForm((current) => ({
      ...(editingRule && !formDirty ? editDefaults : current),
      [key]: value,
    }));
  };
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const previousVersions = (rules.data ?? [])
        .filter(
          (rule) =>
            String(rule.gradoId) === String(formValues.gradoId) &&
            String(rule.cursoId) === String(formValues.cursoId),
        )
        .map((rule) => Number(rule.version) || 0);
      const version = Math.max(0, ...previousVersions) + 1;
      const metodo = JSON.stringify({
        estrategia: formValues.estrategia,
        ...(formValues.estrategia === 'frecuencia' && { desempate: formValues.desempate }),
        minimoEvidencias: Number(formValues.minimoEvidencias),
      });
      if (editingRule) {
        await api(`/reglas-consolidacion/${editingRule.id}/version`, {
          method: 'PUT',
          body: { version, metodo },
        });
      } else {
        await api('/reglas-consolidacion', {
          method: 'POST',
          body: {
            gradoId: Number(formValues.gradoId),
            cursoId: Number(formValues.cursoId),
            nombre: formValues.nombre.trim(),
            version,
            metodo,
          },
        });
      }
      window.location.hash = '/gestion';
      rules.retry();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <AppLayout section="Gestión Académica" step="Reglas">
      {(isNew || editingRule) ? (
        <form className="card admin-form" onSubmit={save}>
          <div className="page-heading"><h1>{editingRule ? 'Editar regla de consolidación' : 'Nueva regla de consolidación'}</h1><p className="muted">Configura cómo se obtiene el logro final de una competencia.</p></div>
          {saveError && <Feedback title={saveError.message}>{saveError.details?.map((detail) => <p key={detail.mensaje}>{detail.mensaje}</p>)}</Feedback>}
          <fieldset disabled={saving}>
            <div className="form-grid">
              <label className="field form-wide"><span>Nombre de la regla *</span><input required value={formValues.nombre} onChange={(event) => update('nombre', event.target.value)} placeholder="Mayor frecuencia con prioridad" /></label>
              <label className="field"><span>Curso *</span><select required disabled={Boolean(editingRule)} value={formValues.cursoId} onChange={(event) => update('cursoId', event.target.value)}><option value="">Seleccionar…</option>{catalog.cursos.map((course) => <option key={course.id} value={course.id}>{course.codigo} · {course.nombre}</option>)}</select></label>
              <label className="field"><span>Grado *</span><select required disabled={Boolean(editingRule)} value={formValues.gradoId} onChange={(event) => update('gradoId', event.target.value)}><option value="">Seleccionar…</option>{catalog.grados.map((grade) => <option key={grade.id} value={grade.id}>{grade.nombre}</option>)}</select></label>
              <fieldset className="rule-options form-wide"><legend>Método de consolidación</legend><p className="muted">Selecciona una estrategia y conserva el mínimo de evidencias.</p><div className="rule-choice-grid">{ruleMethods.map(([id, title, description]) => <label className="rule-choice" key={id}><input type="radio" name="estrategia" checked={formValues.estrategia === id} onChange={() => update('estrategia', id)} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div></fieldset>
              <label className="field"><span>Mínimo de evidencias *</span><input type="number" min="1" max="50" required value={formValues.minimoEvidencias} onChange={(event) => update('minimoEvidencias', event.target.value)} /></label>
              {formValues.estrategia === 'frecuencia' && <label className="field"><span>Desempate</span><select value={formValues.desempate} onChange={(event) => update('desempate', event.target.value)}>{tieBreakers.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
              <div className="preview-card form-wide"><strong>Vista previa de aplicación</strong><span className="muted">Se consolidará cuando existan al menos {formValues.minimoEvidencias || 1} evidencias válidas.</span><div className="preview-evidence"><span className="achievement achievement-a">A</span><span className="achievement achievement-b">B</span><span className="achievement achievement-a">A</span><span className="achievement achievement-ad">AD</span><span className="muted">Resultado consolidado: <strong>A</strong></span></div></div>
            </div>
            <div className="actions"><button type="button" className="secondary" onClick={() => { window.location.hash = '/gestion'; }}>Cancelar</button><button type="submit">{saving ? 'Guardando…' : editingRule ? 'Guardar cambios' : 'Guardar regla'}</button></div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="rule-heading page-heading"><div><h1>Reglas de logro por competencia</h1><p className="muted">Define cómo se consolidan las evaluaciones de un periodo.</p></div><button onClick={() => { window.location.hash = '/gestion/nueva'; }}>Nueva regla</button></div>
          {saveError && <Feedback title={saveError.message}>{saveError.details?.map((detail) => <p key={detail.mensaje}>{detail.mensaje}</p>)}</Feedback>}
          {rules.error && <Feedback intent="warning" title="El listado no está disponible">Puedes crear una nueva regla; el listado se actualizará cuando el servicio vuelva a responder.</Feedback>}
          <div className="card rule-filters"><label className="field"><span>Curso</span><select value={filters.curso} onChange={(event) => setFilters({ ...filters, curso: event.target.value })}><option value="">Todos los cursos</option>{catalog.cursos.map((course) => <option key={course.id} value={course.id}>{course.codigo} · {course.nombre}</option>)}</select></label><label className="field"><span>Grado</span><select value={filters.grado} onChange={(event) => setFilters({ ...filters, grado: event.target.value })}><option value="">Todos los grados</option>{catalog.grados.map((grade) => <option key={grade.id} value={grade.id}>{grade.nombre}</option>)}</select></label><label className="field"><span>Estado</span><select value={filters.estado} onChange={(event) => setFilters({ ...filters, estado: event.target.value })}><option value="activas">Activas</option><option value="todas">Todas</option><option value="inactivas">Inactivas</option></select></label></div>
          <div className="table-card admin-table"><table><thead><tr><th>Regla</th><th>Aplicación</th><th>Método</th><th>Evidencias</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibleRules.map((rule) => { const method = parseMethod(rule.metodo); return <tr key={rule.id}><td><strong>{rule.nombre}</strong><small>Versión {rule.version}</small></td><td>{rule.curso?.nombre} · {rule.grado?.nombre}</td><td>{ruleMethods.find(([id]) => id === method.estrategia)?.[1] || rule.metodo}</td><td>{method.minimoEvidencias || 3}</td><td><span className={rule.activo ? 'status-active' : 'status-inactive'}>{rule.activo ? 'Activa' : 'Inactiva'}</span></td><td><div className="rule-actions"><button type="button" className="secondary" onClick={() => { window.location.hash = `/gestion/editar/${rule.id}`; }}>Editar</button><button type="button" className="danger-button" disabled={!rule.activo} onClick={async () => { if (!window.confirm(`¿Eliminar la regla "${rule.nombre}"?`)) return; try { await api(`/reglas-consolidacion/${rule.id}`, { method: 'DELETE' }); rules.retry(); } catch (error) { setSaveError(error); } }}>Eliminar</button></div></td></tr>; })}{!visibleRules.length && <tr><td colSpan="6" className="muted">No hay reglas con los filtros seleccionados.</td></tr>}</tbody></table></div>
        </>
      )}
    </AppLayout>
  );
}

function DocenteGestion() {
  const sessions = useResource('/sesiones');
  const [courseId, setCourseId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [period, setPeriod] = useState(periods[2]);

  // Lista dinámica de competencias y competencia seleccionada (inicialmente vacía para la opción por defecto)
  const [competenciesList, setCompetenciesList] = useState(INITIAL_COMPETENCIES);
  const [competency, setCompetency] = useState('');

  // Estados para controlar la adición de una nueva competencia
  const [isAddingCompetency, setIsAddingCompetency] = useState(false);
  const [newCompetencyText, setNewCompetencyText] = useState('');

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

  const matchingSessions = useMemo(() => {
    if (!sessions.data) return [];
    return sessions.data.filter((session) => {
      const matchCourse = String(session.curso?.id) === String(selectedCourse);
      const matchSection = String(session.seccion?.id) === String(selectedSection);
      return matchCourse && matchSection;
    });
  }, [sessions.data, selectedCourse, selectedSection]);

  const studentCount = useMemo(() => {
    const allStudents = matchingSessions.flatMap((session) => session.alumnos ?? []);
    return uniqueById(allStudents).length;
  }, [matchingSessions]);

  // Manejador del cambio en el select de competencias
  const handleCompetencyChange = (event) => {
    const value = event.target.value;
    if (value === '__ADD_NEW__') {
      setIsAddingCompetency(true);
      setCompetency('');
    } else {
      setIsAddingCompetency(false);
      setCompetency(value);
    }
  };

  // Guardar la nueva competencia ingresada en la lista
  const handleSaveCompetency = () => {
    const trimmed = newCompetencyText.trim();
    if (trimmed) {
      if (!competenciesList.includes(trimmed)) {
        setCompetenciesList((prev) => [...prev, trimmed]);
      }
      setCompetency(trimmed);
    }
    setNewCompetencyText('');
    setIsAddingCompetency(false);
  };

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

            {/* Dropdown de Competencias */}
            <label className="field">
              Competencia
              <select
                value={isAddingCompetency ? '__ADD_NEW__' : competency}
                onChange={handleCompetencyChange}
              >
                <option value="" disabled>
                  Seleccionar competencia
                </option>
                {competenciesList.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value="__ADD_NEW__">+ Agregar competencia</option>
              </select>
            </label>

            {/* Input dinámico para agregar nueva competencia */}
            {isAddingCompetency && (
              <div className="field inline-add">
                <input
                  type="text"
                  placeholder="Ingrese la nueva competencia"
                  value={newCompetencyText}
                  onChange={(e) => setNewCompetencyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveCompetency();
                    }
                  }}
                  autoFocus
                />
                <div className="inline-buttons">
                  <button type="button" onClick={handleSaveCompetency}>
                    Añadir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCompetency(false);
                      setNewCompetencyText('');
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

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
          <button type="button" disabled={studentCount === 0 || !competency}>
            {studentCount === 1 ? 'Continuar con 1 alumno' : `Continuar con ${studentCount} alumnos`}
          </button>
        </>
      )}
    </AppLayout>
  );
}

export default function Gestion() {
  const { user } = useAuth();
  return user.roles.includes('ADMINISTRADOR') ? <AdminRules /> : <DocenteGestion />;
}