import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import TablaDatos from '../components/TablaDatos';
import { useAuth } from '../hooks/useAuth';
import { useResource } from '../hooks/useResource';

function Historial({ estudiante }) {
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const historial = useResource(
    `/portal/estudiantes/${estudiante.id}/asistencias?pagina=${pagina}&limite=${limite}`,
  );
  if (historial.loading) return <Loading>Cargando asistencias…</Loading>;
  if (historial.error) return <ResourceError {...historial} />;
  return (
    <section className="portal-historial">
      <h2>Asistencia de {estudiante.nombre}</h2>
      <TablaDatos
        columnas={['Fecha', 'Curso', 'Estado', 'Observación']}
        filas={historial.data.registros.map((registro) => ({
          id: registro.id,
          celdas: [
            new Date(registro.fecha + 'T12:00:00').toLocaleDateString('es-PE'),
            registro.curso,
            <span
              key="estado"
              className={`badge ${registro.estado === 'PRESENTE' ? 'success' : registro.estado === 'TARDANZA' ? 'warning' : 'danger'}`}
            >
              {{ PRESENTE: 'Presente', TARDANZA: 'Tardanza', AUSENTE: 'Ausente' }[
                registro.estado
              ] ?? registro.estado}
            </span>,
            registro.observacion || '—',
          ],
        }))}
        vacio="Todavía no hay asistencias registradas para este estudiante."
      />
      <div className="pagination">
        <label>
          Filas por página{' '}
          <select
            value={limite}
            onChange={(e) => {
              setLimite(Number(e.target.value));
              setPagina(1);
            }}
          >
            {[10, 25, 50].map((cantidad) => (
              <option key={cantidad}>{cantidad}</option>
            ))}
          </select>
        </label>
        <span>
          Página {pagina} de {Math.max(1, Math.ceil(historial.data.total / limite))}
        </span>
        <button className="secondary" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>
          Anterior
        </button>
        <button
          className="secondary"
          disabled={pagina * limite >= historial.data.total}
          onClick={() => setPagina(pagina + 1)}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
export default function Portal() {
  const { user } = useAuth();
  const estudiantes = useResource('/portal/estudiantes');
  const [seleccion, setSeleccion] = useState(null);
  const estudiante =
    estudiantes.data?.find((item) => item.id === seleccion) ?? estudiantes.data?.[0];
  const matricula = estudiante?.matriculas[0];
  const esApoderado = user.roles.includes('APODERADO');
  return (
    <AppLayout
      section="Portal académico"
      step={esApoderado ? 'Panel del apoderado' : 'Panel del estudiante'}
      anioAcademico={matricula?.anioAcademico}
    >
      <div className="page-heading portal-heading">
        <div>
          <h1>Hola, {user.nombre.split(' ')[0]}</h1>
          <p className="muted">
            {esApoderado
              ? 'Consulta la información académica de tus estudiantes vinculados.'
              : 'Consulta tu información académica y asistencia.'}
          </p>
        </div>
        <span className="badge success">Sesión segura</span>
      </div>
      {estudiantes.loading && <Loading>Cargando información…</Loading>}
      {estudiantes.error && <ResourceError {...estudiantes} />}
      {estudiantes.data && !estudiantes.data.length && (
        <Feedback intent="info">
          {user.roles.includes('APODERADO')
            ? 'Todavía no tienes estudiantes vinculados. Solicita a la administración que registre el vínculo familiar.'
            : 'Tu cuenta aún no tiene un perfil de estudiante asociado. Comunícate con la administración.'}
        </Feedback>
      )}
      {estudiante && (
        <>
          {estudiantes.data.length > 1 && (
            <label className="field portal-selector">
              Consultar estudiante
              <select value={estudiante.id} onChange={(e) => setSeleccion(Number(e.target.value))}>
                {estudiantes.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <section className="portal-summary" aria-label="Información académica">
            <article className="card portal-summary-card">
              <p className="muted">Estudiante</p>
              <strong>{estudiante.nombre}</strong>
              <p className="caption">Código {estudiante.codigo}</p>
            </article>
            <article className="card portal-summary-card horario-tone-0">
              <p className="muted">Matrícula vigente</p>
              <strong>{matricula?.seccion ?? 'Sin matrícula vigente'}</strong>
              <p className="caption">Sección del año académico activo</p>
            </article>
            <article className="card portal-summary-card horario-tone-1">
              <p className="muted">Año académico</p>
              <strong>{matricula?.anioAcademico ?? 'Sin matrícula vigente'}</strong>
              <p className="caption">
                {matricula ? 'Matrícula activa' : 'Consulta con la administración'}
              </p>
            </article>
          </section>
          {user.roles.includes('ALUMNO') && (
            <section className="portal-historial">
              <h2>Acciones frecuentes</h2>
              <button
                onClick={() => {
                  window.location.hash = '/horario';
                }}
              >
                Ver mi horario
              </button>
            </section>
          )}
          <Historial key={estudiante.id} estudiante={estudiante} />
        </>
      )}
    </AppLayout>
  );
}
