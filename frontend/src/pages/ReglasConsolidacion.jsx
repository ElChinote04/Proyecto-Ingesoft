import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import Calificaciones from './Calificaciones';

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

function CompetenciesSection({ catalog }) {
  const competencies = useResource('/competencias');
  const [filters, setFilters] = useState({ curso: '' });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState({ cursoId: '', codigo: '', nombre: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const visible = (competencies.data ?? []).filter(
    (item) => !filters.curso || String(item.cursoId) === filters.curso,
  );
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const startCreate = () => {
    setEditing(null);
    setShowForm(true);
    setForm({ cursoId: '', codigo: '', nombre: '', descripcion: '' });
    setSaveError(null);
  };
  const startEdit = (item) => {
    setEditing(item);
    setShowForm(true);
    setForm({
      cursoId: String(item.cursoId),
      codigo: item.codigo,
      nombre: item.nombre,
      descripcion: item.descripcion,
    });
    setSaveError(null);
  };
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await api(`/competencias/${editing.id}`, {
          method: 'PUT',
          body: { descripcion: form.descripcion.trim() },
        });
      } else {
        await api('/competencias', {
          method: 'POST',
          body: {
            cursoId: Number(form.cursoId),
            codigo: form.codigo.trim(),
            nombre: form.nombre.trim(),
            descripcion: form.descripcion.trim(),
          },
        });
      }
      setEditing(null);
      setShowForm(false);
      setForm({ cursoId: '', codigo: '', nombre: '', descripcion: '' });
      competencies.retry();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  }
  async function deactivate(item) {
    if (!window.confirm(`¿Desactivar la competencia "${item.nombre}"?`)) return;
    try {
      await api(`/competencias/${item.id}`, { method: 'DELETE' });
      competencies.retry();
    } catch (error) {
      setSaveError(error);
    }
  }

  return (
    <section className="academic-section">
      <div className="rule-heading page-heading">
        <div>
          <h1>Competencias</h1>
          <p className="muted">Define las competencias que los docentes evaluarán en cada curso.</p>
        </div>
        <button type="button" onClick={startCreate}>
          Nueva competencia
        </button>
      </div>
      {saveError && (
        <Feedback title={saveError.message}>
          {saveError.details?.map((detail) => (
            <p key={detail.mensaje}>{detail.mensaje}</p>
          ))}
        </Feedback>
      )}
      {showForm || editing ? (
        <form className="card admin-form" onSubmit={save}>
          <div className="form-grid">
            <label className="field">
              <span>Curso *</span>
              <select
                required
                disabled={Boolean(editing)}
                value={form.cursoId}
                onChange={(event) => update('cursoId', event.target.value)}
              >
                <option value="">Seleccionar…</option>
                {catalog.cursos.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.codigo} · {course.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Código *</span>
              <input
                required
                disabled={Boolean(editing)}
                maxLength={30}
                value={form.codigo}
                onChange={(event) => update('codigo', event.target.value.toUpperCase())}
              />
            </label>
            <label className="field">
              <span>Nombre *</span>
              <input
                required
                disabled={Boolean(editing)}
                maxLength={150}
                value={form.nombre}
                onChange={(event) => update('nombre', event.target.value)}
              />
            </label>
            <label className="field form-wide">
              <span>Descripción *</span>
              <textarea
                required
                maxLength={500}
                value={form.descripcion}
                onChange={(event) => update('descripcion', event.target.value)}
              />
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Cancelar
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar competencia'}
            </button>
          </div>
        </form>
      ) : null}
      {competencies.loading ? (
        <Loading>Cargando competencias…</Loading>
      ) : competencies.error ? (
        <ResourceError error={competencies.error} retry={competencies.retry} />
      ) : (
        <>
          <div className="card rule-filters">
            <label className="field">
              <span>Curso</span>
              <select
                value={filters.curso}
                onChange={(event) => setFilters({ curso: event.target.value })}
              >
                <option value="">Todos los cursos</option>
                {catalog.cursos.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.codigo} · {course.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-card admin-table">
            <table>
              <thead>
                <tr>
                  <th>Competencia</th>
                  <th>Curso</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.codigo}</strong>
                      <small>{item.nombre}</small>
                    </td>
                    <td>
                      {item.curso?.codigo} · {item.curso?.nombre}
                    </td>
                    <td>{item.descripcion}</td>
                    <td>
                      <span className="status-active">Activa</span>
                    </td>
                    <td>
                      <div className="rule-actions">
                        <button type="button" className="secondary" onClick={() => startEdit(item)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => deactivate(item)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan="5" className="muted">
                      No hay competencias registradas para el filtro seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

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
    return (
      <AppLayout section="Gestión Académica" step="Competencias y reglas">
        <Loading>Cargando reglas…</Loading>
      </AppLayout>
    );
  if (catalogs.error)
    return (
      <AppLayout section="Gestión Académica" step="Competencias y reglas">
        <ResourceError error={catalogs.error} retry={catalogs.retry} />
      </AppLayout>
    );

  const catalog = catalogs.data;
  const visibleRules = (rules.data ?? []).filter(
    (rule) =>
      (!filters.curso || String(rule.cursoId) === filters.curso) &&
      (!filters.grado || String(rule.gradoId) === filters.grado) &&
      (filters.estado === 'todas' || (filters.estado === 'activas' ? rule.activo : !rule.activo)),
  );
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
    <AppLayout section="Gestión Académica" step="Competencias y reglas">
      {isNew || editingRule ? (
        <form className="card admin-form" onSubmit={save}>
          <div className="page-heading">
            <h1>
              {editingRule ? 'Editar regla de consolidación' : 'Nueva regla de consolidación'}
            </h1>
            <p className="muted">Configura cómo se obtiene el logro final de una competencia.</p>
          </div>
          {saveError && (
            <Feedback title={saveError.message}>
              {saveError.details?.map((detail) => (
                <p key={detail.mensaje}>{detail.mensaje}</p>
              ))}
            </Feedback>
          )}
          <fieldset disabled={saving}>
            <div className="form-grid">
              <label className="field form-wide">
                <span>Nombre de la regla *</span>
                <input
                  required
                  value={formValues.nombre}
                  onChange={(event) => update('nombre', event.target.value)}
                  placeholder="Mayor frecuencia con prioridad"
                />
              </label>
              <label className="field">
                <span>Curso *</span>
                <select
                  required
                  disabled={Boolean(editingRule)}
                  value={formValues.cursoId}
                  onChange={(event) => update('cursoId', event.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {catalog.cursos.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.codigo} · {course.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Grado *</span>
                <select
                  required
                  disabled={Boolean(editingRule)}
                  value={formValues.gradoId}
                  onChange={(event) => update('gradoId', event.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {catalog.grados.map((grade) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="rule-options form-wide">
                <legend>Método de consolidación</legend>
                <p className="muted">
                  Selecciona una estrategia y conserva el mínimo de evidencias.
                </p>
                <div className="rule-choice-grid">
                  {ruleMethods.map(([id, title, description]) => (
                    <label className="rule-choice" key={id}>
                      <input
                        type="radio"
                        name="estrategia"
                        checked={formValues.estrategia === id}
                        onChange={() => update('estrategia', id)}
                      />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                <span>Mínimo de evidencias *</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={formValues.minimoEvidencias}
                  onChange={(event) => update('minimoEvidencias', event.target.value)}
                />
              </label>
              {formValues.estrategia === 'frecuencia' && (
                <label className="field">
                  <span>Desempate</span>
                  <select
                    value={formValues.desempate}
                    onChange={(event) => update('desempate', event.target.value)}
                  >
                    {tieBreakers.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="preview-card form-wide">
                <strong>Vista previa de aplicación</strong>
                <span className="muted">
                  Se consolidará cuando existan al menos {formValues.minimoEvidencias || 1}{' '}
                  evidencias válidas.
                </span>
                <div className="preview-evidence">
                  <span className="achievement achievement-a">A</span>
                  <span className="achievement achievement-b">B</span>
                  <span className="achievement achievement-a">A</span>
                  <span className="achievement achievement-ad">AD</span>
                  <span className="muted">
                    Resultado consolidado: <strong>A</strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  window.location.hash = '/gestion';
                }}
              >
                Cancelar
              </button>
              <button type="submit">
                {saving ? 'Guardando…' : editingRule ? 'Guardar cambios' : 'Guardar regla'}
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <CompetenciesSection catalog={catalog} />
          <div className="rule-heading page-heading">
            <div>
              <h1>Reglas de consolidación por competencia</h1>
              <p className="muted">Define cómo se consolidan las calificaciones de un periodo.</p>
            </div>
            <button
              onClick={() => {
                window.location.hash = '/gestion/nueva';
              }}
            >
              Nueva regla
            </button>
          </div>
          {saveError && (
            <Feedback title={saveError.message}>
              {saveError.details?.map((detail) => (
                <p key={detail.mensaje}>{detail.mensaje}</p>
              ))}
            </Feedback>
          )}
          {rules.error && (
            <Feedback intent="warning" title="El listado no está disponible">
              Puedes crear una nueva regla; el listado se actualizará cuando el servicio vuelva a
              responder.
            </Feedback>
          )}
          <div className="card rule-filters">
            <label className="field">
              <span>Curso</span>
              <select
                value={filters.curso}
                onChange={(event) => setFilters({ ...filters, curso: event.target.value })}
              >
                <option value="">Todos los cursos</option>
                {catalog.cursos.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.codigo} · {course.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Grado</span>
              <select
                value={filters.grado}
                onChange={(event) => setFilters({ ...filters, grado: event.target.value })}
              >
                <option value="">Todos los grados</option>
                {catalog.grados.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estado</span>
              <select
                value={filters.estado}
                onChange={(event) => setFilters({ ...filters, estado: event.target.value })}
              >
                <option value="activas">Activas</option>
                <option value="todas">Todas</option>
                <option value="inactivas">Inactivas</option>
              </select>
            </label>
          </div>
          <div className="table-card admin-table">
            <table>
              <thead>
                <tr>
                  <th>Regla</th>
                  <th>Aplicación</th>
                  <th>Método</th>
                  <th>Evidencias</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleRules.map((rule) => {
                  const method = parseMethod(rule.metodo);
                  return (
                    <tr key={rule.id}>
                      <td>
                        <strong>{rule.nombre}</strong>
                        <small>Versión {rule.version}</small>
                      </td>
                      <td>
                        {rule.curso?.nombre} · {rule.grado?.nombre}
                      </td>
                      <td>
                        {ruleMethods.find(([id]) => id === method.estrategia)?.[1] || rule.metodo}
                      </td>
                      <td>{method.minimoEvidencias || 3}</td>
                      <td>
                        <span className={rule.activo ? 'status-active' : 'status-inactive'}>
                          {rule.activo ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <div className="rule-actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              window.location.hash = `/gestion/editar/${rule.id}`;
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            disabled={!rule.activo}
                            onClick={async () => {
                              if (!window.confirm(`¿Eliminar la regla "${rule.nombre}"?`)) return;
                              try {
                                await api(`/reglas-consolidacion/${rule.id}`, { method: 'DELETE' });
                                rules.retry();
                              } catch (error) {
                                setSaveError(error);
                              }
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!visibleRules.length && (
                  <tr>
                    <td colSpan="6" className="muted">
                      No hay reglas con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppLayout>
  );
}

export default function Gestion() {
  const { user } = useAuth();
  return user.roles.includes('ADMINISTRADOR') ? <AdminRules /> : <Calificaciones />;
}
