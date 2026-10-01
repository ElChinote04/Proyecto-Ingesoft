import { useState } from 'react';
import { api } from '../api/client';
import { useAdminData } from '../hooks/useAdminData';
import { useAuth } from '../hooks/useAuth';
import AppLayout from '../layouts/AppLayout';
import { AdminForm, Field, PersonFields, Select } from '../components/AdminForm';
import { Loading, ResourceError } from '../components/Feedback';

const roles = ['ADMINISTRADOR', 'DOCENTE', 'ALUMNO', 'APODERADO'];
const sectionLabel = (s) => `${s.anioAcademico.codigo} · ${s.grado.nombre} ${s.nombre}`;
const options = (list, label) => list.map((i) => ({ id: i.id, label: label(i) }));
const numbers = (form, keys) =>
  Object.fromEntries([...form].map(([k, v]) => [k, keys.includes(k) ? Number(v) : v]));
const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const blockLabel = (b) =>
  `${sectionLabel(b.asignacion.seccion)} · ${b.asignacion.curso.nombre} · ${days[b.diaSemana - 1]} ${b.horaInicio}–${b.horaFin}`;
const titles = {
  inicio: 'Administración',
  usuarios: 'Usuarios y roles',
  catalogos: 'Catálogos académicos',
  matriculas: 'Alumnos y matrículas',
  horarios: 'Horarios y sesiones',
  auditoria: 'Auditoría',
};

function Data({ resource, children }) {
  return (
    <>
      {resource.error && <ResourceError error={resource.error} retry={resource.retry} />}
      {resource.data ? children(resource.data) : !resource.error && <Loading />}
    </>
  );
}
function Table({ headers, rows, empty = 'Todavía no hay registros.' }) {
  return (
    <div className="table-card admin-table">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Home() {
  return (
    <div className="admin-grid">
      {[
        [
          'usuarios',
          '01',
          'Crea las cuentas',
          'Asigna uno o varios roles. El rol Docente crea su perfil académico; después podrás asignarle clases.',
        ],
        [
          'catalogos',
          '02',
          'Prepara el año escolar',
          'Registra año, grados, secciones, cursos y aulas para organizar las clases.',
        ],
        [
          'matriculas',
          '03',
          'Registra y matricula alumnos',
          'Una matrícula vincula al alumno con su grado y sección en un año académico.',
        ],
        [
          'horarios',
          '04',
          'Asigna horarios y sesiones',
          'Vincula curso, sección, docente y aula. Crea la sesión para una fecha del horario.',
        ],
        [
          'auditoria',
          '05',
          'Comprueba las operaciones',
          'Revisa quién realizó cada cambio y cuándo. El docente registra la asistencia desde su propia cuenta.',
        ],
      ].map(([route, number, title, description]) => (
        <a className="card step-card" href={`#/admin/${route}`} key={route}>
          <span>{number}</span>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
          <strong>Abrir →</strong>
        </a>
      ))}
    </div>
  );
}
function Users() {
  const resource = useAdminData('usuarios');
  const [editing, setEditing] = useState(null);
  const { user, restore } = useAuth();
  return (
    <Data resource={resource}>
      {([users]) => (
        <>
          <AdminForm
            key={editing?.id ?? 'new'}
            title={
              editing ? `Editar cuenta de ${editing.nombres} ${editing.apellidos}` : 'Crear usuario'
            }
            submit={editing ? 'Guardar cambios' : 'Crear usuario'}
            onCancel={editing ? () => setEditing(null) : undefined}
            reset={!editing}
            onSave={async (form) => {
              const body = {
                identificador: form.get('identificador'),
                roles: form.getAll('roles'),
                activo: form.has('activo'),
              };
              const password = form.get('contrasena');
              if (password) body.contrasena = password;
              if (editing) body.version = editing.version;
              else
                for (const key of ['numeroDocumento', 'nombres', 'apellidos'])
                  body[key] = form.get(key);
              const updated = await api(`/admin/usuarios${editing ? `/${editing.id}` : ''}`, {
                method: editing ? 'PUT' : 'POST',
                body,
              });
              if (editing) setEditing(updated);
              resource.retry();
              if (editing?.id === user.id) await restore();
              return `Cuenta ${updated.identificador} guardada. Roles: ${updated.roles.join(', ')}.${updated.docenteId ? ` Perfil docente: ${updated.docenteId}.` : ''}`;
            }}
          >
            {!editing && <PersonFields />}
            <Field
              label="Usuario o correo"
              name="identificador"
              defaultValue={editing?.identificador}
              maxLength={200}
              autoComplete="off"
            />
            <Field
              label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña (mínimo 10 caracteres)'}
              name="contrasena"
              type="password"
              required={!editing}
              minLength={10}
              autoComplete="new-password"
            />
            <div className="field">
              <span>Estado</span>
              <label className="checkbox">
                <input name="activo" type="checkbox" defaultChecked={editing?.activo ?? true} />
                Cuenta activa
              </label>
            </div>
            <fieldset className="roles form-wide">
              <legend>Roles (selecciona al menos uno)</legend>
              {roles.map((role) => (
                <label className="checkbox" key={role}>
                  <input
                    type="checkbox"
                    name="roles"
                    value={role}
                    defaultChecked={editing?.roles.includes(role) ?? false}
                  />
                  {role}
                </label>
              ))}
            </fieldset>
            <p className="muted form-wide">
              Una misma persona puede tener varios roles. Al asignar Docente se crea su perfil; la
              asignación de cursos y sesiones se realiza en Horarios.
            </p>
          </AdminForm>
          <h2>Cuentas registradas</h2>
          <Table
            headers={['ID / Persona', 'Identificador', 'Roles', 'Estado', 'Acción']}
            rows={users.map((u) => [
              <span key="name">
                <strong>
                  #{u.id} · {u.nombres} {u.apellidos}
                </strong>
                <small>
                  {u.numeroDocumento}
                  {u.docenteId && ` · Docente #${u.docenteId}`}
                </small>
              </span>,
              u.identificador,
              u.roles.join(' · '),
              u.activo ? 'Activa' : 'Inactiva',
              <button
                key="edit"
                className="secondary"
                onClick={() => {
                  setEditing(u);
                  window.scrollTo(0, 0);
                }}
              >
                Editar
              </button>,
            ])}
          />
        </>
      )}
    </Data>
  );
}
function Catalogs() {
  const resource = useAdminData('catalogos');
  return (
    <Data resource={resource}>
      {([c]) => (
        <>
          <p className="muted">
            Crea primero el año y el grado; luego podrás vincular una sección. Los registros
            guardados aparecen debajo de cada formulario.
          </p>
          <div className="admin-grid">
            {[
              [
                'anios',
                'Año académico',
                <Field
                  key="year"
                  label="Año"
                  name="codigo"
                  pattern="(19|20|21)[0-9]{2}"
                  placeholder="2026"
                  maxLength={4}
                />,
                ['Año'],
                c.anios.map((x) => [x.codigo]),
              ],
              [
                'grados',
                'Grado',
                <Field
                  key="grade"
                  label="Nombre del grado"
                  name="nombre"
                  placeholder="3.°"
                  maxLength={50}
                />,
                ['Grado'],
                c.grados.map((x) => [x.nombre]),
              ],
              [
                'secciones',
                'Sección',
                <>
                  <Select
                    label="Año académico"
                    name="anioAcademicoId"
                    items={options(c.anios, (x) => x.codigo)}
                  />
                  <Select label="Grado" name="gradoId" items={options(c.grados, (x) => x.nombre)} />
                  <Field label="Nombre de sección" name="nombre" placeholder="B" maxLength={30} />
                </>,
                ['Sección'],
                c.secciones.map((x) => [sectionLabel(x)]),
              ],
              [
                'cursos',
                'Curso',
                <>
                  <Field label="Código del curso" name="codigo" placeholder="MAT" maxLength={30} />
                  <Field
                    label="Nombre del curso"
                    name="nombre"
                    placeholder="Matemática"
                    maxLength={100}
                  />
                </>,
                ['Curso'],
                c.cursos.map((x) => [`${x.codigo} · ${x.nombre}`]),
              ],
              [
                'aulas',
                'Aula',
                <Field
                  key="room"
                  label="Código del aula"
                  name="codigo"
                  placeholder="A203"
                  maxLength={30}
                />,
                ['Aula'],
                c.aulas.map((x) => [x.codigo]),
              ],
            ].map(([type, title, fields, headers, rows]) => (
              <section className="catalog-section" key={type}>
                <AdminForm
                  title={title}
                  submit={`Crear ${title.toLowerCase()}`}
                  onSave={async (form) => {
                    await api(`/admin/catalogos/${type}`, {
                      method: 'POST',
                      body: numbers(form, ['gradoId', 'anioAcademicoId']),
                    });
                    resource.retry();
                  }}
                >
                  {fields}
                </AdminForm>
                <Table headers={headers} rows={rows} />
              </section>
            ))}
          </div>
        </>
      )}
    </Data>
  );
}
function Enrollments() {
  const resource = useAdminData('catalogos,estudiantes');
  const [year, setYear] = useState('');
  const [grade, setGrade] = useState('');
  return (
    <Data resource={resource}>
      {([c, students]) => (
        <>
          <AdminForm
            title="Registrar alumno"
            submit="Registrar alumno"
            onSave={async (form) => {
              const student = await api('/admin/estudiantes', {
                method: 'POST',
                body: Object.fromEntries(form),
              });
              resource.retry();
              return `Alumno registrado con código ${student.codigoEstudiante}. Selecciónalo en el formulario de matrícula.`;
            }}
          >
            <PersonFields />
          </AdminForm>
          <AdminForm
            title="Asignar grado y sección"
            submit="Confirmar matrícula"
            reset={false}
            onSave={async (form) => {
              const result = await api('/admin/matriculas', {
                method: 'POST',
                body: {
                  estudianteId: Number(form.get('estudianteId')),
                  seccionId: Number(form.get('seccionId')),
                },
              });
              resource.retry();
              return `Matrícula #${result.id} registrada. El alumno ya forma parte del padrón de su sección.`;
            }}
          >
            <Select
              label="Alumno"
              name="estudianteId"
              items={options(students, (s) => `${s.nombres} ${s.apellidos} · ${s.numeroDocumento}`)}
            />
            <Select
              label="Año académico"
              name="anio"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              items={options(c.anios, (a) => a.codigo)}
            />
            <Select
              label="Grado"
              name="grado"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              items={options(c.grados, (g) => g.nombre)}
            />
            <Select
              key={`${year}-${grade}`}
              label="Sección"
              name="seccionId"
              items={options(
                c.secciones.filter(
                  (s) => String(s.anioAcademicoId) === year && String(s.gradoId) === grade,
                ),
                (s) => s.nombre,
              )}
            />
            <p className="muted form-wide">
              Cada alumno puede tener una matrícula por año académico. Si falta una sección, créala
              en Catálogos académicos.
            </p>
          </AdminForm>
          <h2>Alumnos y sus matrículas</h2>
          <Table
            headers={['ID / Código', 'Alumno', 'Documento', 'Matrículas']}
            rows={students.map((s) => [
              `#${s.id} · ${s.codigoEstudiante}`,
              `${s.nombres} ${s.apellidos}`,
              s.numeroDocumento,
              s.matriculas.length
                ? s.matriculas.map((m) => (
                    <div key={m.id}>
                      #{m.id} · {m.descripcion} · {m.activo ? 'Activa' : 'Inactiva'}
                    </div>
                  ))
                : 'Sin matrícula',
            ])}
          />
        </>
      )}
    </Data>
  );
}
function Schedule() {
  const resource = useAdminData('catalogos,horarios');
  const [year, setYear] = useState('');
  const [view, setView] = useState('seccion');
  const [filter, setFilter] = useState('');
  return (
    <Data resource={resource}>
      {([c, schedule]) => {
        const blocks = schedule.bloques.filter(
          (b) =>
            (!year || String(b.asignacion.seccion.anioAcademicoId) === year) &&
            (!filter || String(view === 'aula' ? b.aulaId : b.asignacion[`${view}Id`]) === filter),
        );
        const times = [...new Set(blocks.map((b) => b.horaInicio))].sort();
        const filters =
          view === 'seccion'
            ? options(c.secciones, sectionLabel)
            : view === 'docente'
              ? options(c.docentes, (d) => d.nombre)
              : options(c.aulas, (a) => a.codigo);
        return (
          <>
            <div className="card schedule-filters">
              <label className="field">
                Año académico
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">Todos</option>
                  {c.anios.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Ver por
                <select
                  value={view}
                  onChange={(e) => {
                    setView(e.target.value);
                    setFilter('');
                  }}
                >
                  <option value="seccion">Sección</option>
                  <option value="docente">Docente</option>
                  <option value="aula">Aula</option>
                </select>
              </label>
              <label className="field">
                Filtrar
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="">Todos</option>
                  {filters.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-card">
              <table className="schedule-matrix">
                <caption>Horario semanal · bloques asignados</caption>
                <thead>
                  <tr>
                    <th>Inicio</th>
                    {days.map((d) => (
                      <th key={d}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {times.length ? (
                    times.map((time) => (
                      <tr key={time}>
                        <th>{time}</th>
                        {days.map((d, i) => (
                          <td key={d}>
                            {blocks
                              .filter((b) => b.horaInicio === time && b.diaSemana === i + 1)
                              .map((b) => (
                                <div className="schedule-block" key={b.id}>
                                  <strong>{b.asignacion.curso.nombre}</strong>
                                  <span>{sectionLabel(b.asignacion.seccion)}</span>
                                  <span>
                                    {b.asignacion.docente.persona.nombres}{' '}
                                    {b.asignacion.docente.persona.apellidos}
                                  </span>
                                  <span>
                                    {b.aula.codigo} · {b.horaInicio}–{b.horaFin}
                                  </span>
                                  <small>Bloque #{b.id}</small>
                                </div>
                              ))}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="muted">
                        No hay bloques para estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <AdminForm
              title="Nueva asignación horaria"
              submit="Guardar asignación"
              onSave={async (form) => {
                const block = await api('/admin/bloques', {
                  method: 'POST',
                  body: numbers(form, ['cursoId', 'seccionId', 'docenteId', 'aulaId', 'diaSemana']),
                });
                resource.retry();
                return `Bloque #${block.id} asignado. Crea una sesión con fecha para que el docente pueda tomar asistencia.`;
              }}
            >
              <Select
                label="Año / grado / sección"
                name="seccionId"
                items={options(c.secciones, sectionLabel)}
              />
              <Select label="Curso" name="cursoId" items={options(c.cursos, (x) => x.nombre)} />
              <Select
                label="Docente"
                name="docenteId"
                items={options(c.docentes, (x) => x.nombre)}
              />
              <Select label="Aula" name="aulaId" items={options(c.aulas, (x) => x.codigo)} />
              <Select
                label="Día de la semana"
                name="diaSemana"
                items={days.map((d, i) => ({ id: i + 1, label: d }))}
              />
              <Field label="Hora de inicio" name="horaInicio" type="time" />
              <Field label="Hora de fin" name="horaFin" type="time" />
              <p className="muted form-wide">
                Se comprueban cruces de docente, aula y sección dentro del mismo año académico antes
                de guardar.
              </p>
            </AdminForm>
            <AdminForm
              title="Crear sesión de clase"
              submit="Crear sesión"
              onSave={async (form) => {
                const session = await api('/admin/sesiones', {
                  method: 'POST',
                  body: numbers(form, ['bloqueId']),
                });
                resource.retry();
                return `Sesión #${session.id} creada. El docente asignado ya puede abrirla desde Control de asistencia.`;
              }}
            >
              <Select
                label="Bloque asignado"
                name="bloqueId"
                items={options(schedule.bloques, blockLabel)}
              />
              <Field label="Fecha de la sesión" name="fecha" type="date" />
              <p className="muted form-wide">
                Elige una fecha del año académico y del mismo día de la semana del bloque. Las horas
                y el docente se toman de la asignación.
              </p>
            </AdminForm>
            <h2>Sesiones creadas</h2>
            <Table
              headers={['ID / Fecha', 'Clase asignada', 'Estado / Versión']}
              rows={schedule.sesiones.map((s) => [
                `#${s.id} · ${s.fecha.slice(0, 10)}`,
                blockLabel(schedule.bloques.find((b) => b.id === s.bloqueId)),
                `${s.activo ? 'Activa' : 'Inactiva'} · v${s.version}`,
              ])}
            />
          </>
        );
      }}
    </Data>
  );
}
function Audits() {
  const resource = useAdminData('auditoria');
  return (
    <>
      <p className="muted">
        Últimos 100 eventos, del más reciente al más antiguo. Horas de Lima. Los datos completos
        permanecen en PostgreSQL.
      </p>
      <button className="secondary" onClick={resource.retry}>
        Actualizar auditoría
      </button>
      <Data resource={resource}>
        {([events]) => (
          <Table
            headers={['ID / Fecha', 'Usuario', 'Evento / Entidad', 'Detalle']}
            rows={events.map((e) => [
              `#${e.id} · ${new Date(e.fechaHora).toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
              e.usuario.identificador,
              `${e.tipoEvento} · #${e.entidadId}`,
              <details key="details">
                <summary>Ver detalle</summary>
                <pre>{JSON.stringify(e.detalle, null, 2)}</pre>
              </details>,
            ])}
          />
        )}
      </Data>
    </>
  );
}
export default function Admin({ page }) {
  const pages = {
    inicio: Home,
    usuarios: Users,
    catalogos: Catalogs,
    matriculas: Enrollments,
    horarios: Schedule,
    auditoria: Audits,
  };
  const Page = pages[page] || Home;
  return (
    <AppLayout section="Administración" step={titles[page] || titles.inicio}>
      <div className="page-heading">
        <h1>{titles[page] || titles.inicio}</h1>
      </div>
      <div className="admin-content">
        <Page />
      </div>
    </AppLayout>
  );
}
