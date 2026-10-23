import { VincularApoderado, AdministrarAnio } from '../components/AdministrarPerfiles';
import GestionBloques from '../components/GestionBloques';
import ConsultaAuditoria from '../components/ConsultaAuditoria';
import { useState } from 'react';
import { api } from '../api/client';
import { userFormBody } from '../utils/userForm';
import { useAdminData } from '../hooks/useAdminData';
import { useAuth } from '../hooks/useAuth';
import AppLayout from '../layouts/AppLayout';
import { AdminForm, Field, PersonFields, Select } from '../components/AdminForm';
import { Loading, ResourceError } from '../components/Feedback';
import TeacherAttendance from './TeacherAttendance';
import StudentAttendanceReport from './StudentAttendanceReport';

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
  asistenciaDocentes: 'Asistencia docente',
  reportesAsistencia: 'Reportes de asistencia',
  auditoria: 'Auditoría',
};

const meses = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

// US-006. El cronograma se calcula a partir de estas cinco condiciones: el
// servidor deriva de ellas una boleta por cuota, con su periodo y vencimiento.
function PlanPagoFields() {
  return (
    <>
      <Field
        label="Monto de la pensión (S/)"
        name="montoPension"
        inputMode="decimal"
        pattern="\d{1,6}(\.\d{1,2})?"
        placeholder="350.00"
        title="Hasta dos decimales, por ejemplo 350.00"
      />
      <Field
        label="Número de cuotas"
        name="numeroCuotas"
        type="number"
        min={1}
        max={12}
        defaultValue={10}
      />
      <Field
        label="Día de vencimiento"
        name="diaVencimiento"
        type="number"
        min={1}
        max={28}
        defaultValue={10}
        title="Hasta 28 para que exista en todos los meses"
      />
      <Select
        label="Mes de la primera cuota"
        name="mesInicio"
        defaultValue="3"
        items={meses.map((nombre, indice) => ({ id: indice + 1, label: nombre }))}
      />
      <Field label="Concepto" name="concepto" maxLength={60} defaultValue="Pensión" />
    </>
  );
}

const planDelFormulario = (form) => ({
  montoPension: String(form.get('montoPension')).trim(),
  numeroCuotas: Number(form.get('numeroCuotas')),
  diaVencimiento: Number(form.get('diaVencimiento')),
  mesInicio: Number(form.get('mesInicio')),
  concepto: String(form.get('concepto')).trim() || 'Pensión',
});

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
              const body = userFormBody(form, Boolean(editing));
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
              asignación de cursos y sesiones se realiza en Horarios. Las contraseñas asignadas aquí
              son temporales: el usuario debe cambiarlas al iniciar sesión.
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
            Crea primero el año y el grado; luego podrás vincular una sección.
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
            ].map(([type, title, fields]) => (
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
              </section>
            ))}
          </div>
          <AdministrarAnio anios={c.anios} onSaved={resource.retry} />
        </>
      )}
    </Data>
  );
}
function Enrollments() {
  const resource = useAdminData('catalogos,estudiantes');
  const [year, setYear] = useState('');
  const [grade, setGrade] = useState('');
  const [conPlan, setConPlan] = useState(true);
  return (
    <Data resource={resource}>
      {([c, students]) => (
        <>
          <AdminForm
            title="Registrar alumno"
            submit="Registrar alumno"
            onSave={async (form) => {
              const estudiante = await api('/admin/estudiantes', {
                method: 'POST',
                body: Object.fromEntries(form),
              });
              resource.retry();
              return `Alumno #${estudiante.id} registrado (${estudiante.codigoEstudiante}). Ya puedes matricularlo o crear su cuenta ALUMNO con el mismo documento.`;
            }}
          >
            <PersonFields />
          </AdminForm>
          <AdminForm
            title="Asignar grado y sección"
            submit="Confirmar matrícula"
            reset={false}
            onSave={async (form) => {
              const body = {
                estudianteId: Number(form.get('estudianteId')),
                seccionId: Number(form.get('seccionId')),
              };
              // El compromiso de pago viaja en la misma petición: así no puede
              // quedar una matrícula sin cronograma ni al revés (US-006).
              if (form.get('emitirPlan')) body.planPago = planDelFormulario(form);
              const result = await api('/admin/matriculas', { method: 'POST', body });
              resource.retry();
              return body.planPago
                ? `Matrícula #${result.id} registrada junto con su compromiso de pago de ${body.planPago.numeroCuotas} cuotas. El apoderado ya puede verlas y pagarlas; el cronograma está en Pagos y boletas.`
                : `Matrícula #${result.id} registrada. El alumno ya forma parte del padrón de su sección.`;
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
            <div className="field form-wide">
              <span>Compromiso de pago</span>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="emitirPlan"
                  checked={conPlan}
                  onChange={(e) => setConPlan(e.target.checked)}
                />
                Emitir el cronograma de pensiones al matricular
              </label>
            </div>
            {conPlan && <PlanPagoFields />}
            <p className="muted form-wide">
              Cada alumno puede tener una matrícula por año académico. Si falta una sección, créala
              en Catálogos académicos.
            </p>
          </AdminForm>
          <EmitirPlanPago estudiantes={students} onSaved={resource.retry} />
          <VincularApoderado catalogos={c} estudiantes={students} onSaved={resource.retry} />
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
/**
 * Para las matrículas registradas antes de que existiera el módulo de pagos, o
 * cuando se omitió el cronograma al matricular. El servidor rechaza con 409 si
 * esa matrícula ya tiene uno.
 */
function EmitirPlanPago({ estudiantes, onSaved }) {
  const matriculas = estudiantes.flatMap((estudiante) =>
    estudiante.matriculas
      .filter((matricula) => matricula.activo)
      .map((matricula) => ({
        id: matricula.id,
        label: `#${matricula.id} · ${estudiante.nombres} ${estudiante.apellidos} · ${matricula.descripcion}`,
      })),
  );
  return (
    <AdminForm
      title="Emitir compromiso de pago sobre una matrícula existente"
      submit="Emitir cronograma"
      onSave={async (form) => {
        const id = Number(form.get('matriculaId'));
        const plan = await api(`/matriculas/${id}/plan-pago`, {
          method: 'POST',
          body: planDelFormulario(form),
        });
        onSaved();
        return `Cronograma emitido: ${plan.boletas.length} boletas de S/ ${plan.montoPension}. Puedes revisarlo en Pagos y boletas.`;
      }}
    >
      <Select label="Matrícula" name="matriculaId" items={matriculas} />
      <PlanPagoFields />
      <p className="muted form-wide">
        Una matrícula solo admite un cronograma. Si ya lo tiene, el sistema lo rechaza en lugar de
        duplicar las boletas.
      </p>
    </AdminForm>
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
            b.activo &&
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
            <GestionBloques catalogos={c} bloques={schedule.bloques} onSaved={resource.retry} />
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
                items={options(
                  c.secciones.filter((seccion) => seccion.anioAcademico.activo),
                  sectionLabel,
                )}
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
                items={options(
                  schedule.bloques.filter(
                    (bloque) => bloque.activo && bloque.asignacion.seccion.anioAcademico.activo,
                  ),
                  blockLabel,
                )}
              />
              <Field label="Fecha de la sesión" name="fecha" type="date" />
              <p className="muted form-wide">
                Elige una fecha del año académico y del mismo día de la semana del bloque. Las horas
                y el docente se toman de la asignación.
              </p>
            </AdminForm>
          </>
        );
      }}
    </Data>
  );
}
export default function Admin({ page }) {
  const pages = {
    inicio: Home,
    usuarios: Users,
    catalogos: Catalogs,
    matriculas: Enrollments,
    horarios: Schedule,
    asistenciaDocentes: TeacherAttendance,
    reportesAsistencia: StudentAttendanceReport,
    auditoria: ConsultaAuditoria,
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
