import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import ActividadModal from '../components/ActividadModal';
import PlanSemanal from '../components/PlanSemanal';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';
import { bimestrePorDefecto, etiquetaCurso } from '../utils/planTrabajo';

const SECCION = 'Actividades de clase';

function ActividadesDelCurso({ matriculaId, cursoId, bimestre }) {
  const recurso = useResource(
    `/evidencias-pedagogicas?matriculaId=${matriculaId}&cursoId=${cursoId}&bimestreId=${bimestre.id}`,
  );
  const [abierta, setAbierta] = useState(null);

  if (!bimestre.semanas)
    return (
      <Feedback intent="info" title="Bimestre sin fechas">
        Las actividades de este bimestre se mostrarán cuando el colegio defina sus fechas.
      </Feedback>
    );
  if (recurso.loading) return <Loading>Cargando actividades…</Loading>;
  if (recurso.error) return <ResourceError error={recurso.error} retry={recurso.retry} />;
  const { semanas } = recurso.data;
  const total = semanas.reduce((suma, { evidencias }) => suma + evidencias.length, 0);

  return (
    <>
      {!total && (
        <Feedback intent="info" title="Sin actividades publicadas">
          El docente todavía no publicó actividades de este curso en el bimestre.
        </Feedback>
      )}
      <PlanSemanal semanas={semanas} onAbrir={(actividad) => setAbierta(actividad.id)} />
      {abierta && (
        <ActividadModal
          modo="familia"
          actividadId={abierta}
          onClose={() => setAbierta(null)}
          onCambio={() => setAbierta(null)}
        />
      )}
    </>
  );
}

function Selectores({ matricula }) {
  const cursos = useResource(`/asignaciones?matriculaId=${matricula.id}`);
  const bimestres = useResource('/bimestres');
  const [cursoId, setCursoId] = useState('');
  const [bimestreId, setBimestreId] = useState('');

  if (cursos.loading || bimestres.loading) return <Loading>Cargando cursos…</Loading>;
  const error = cursos.error ?? bimestres.error;
  if (error)
    return (
      <ResourceError
        error={error}
        retry={() => {
          cursos.retry();
          bimestres.retry();
        }}
      />
    );
  const lista = cursos.data;
  const curso = lista.find(({ curso: c }) => String(c.id) === cursoId)?.curso ?? lista[0]?.curso;
  const bimestre =
    bimestres.data.find(({ id }) => String(id) === bimestreId) ??
    bimestrePorDefecto(bimestres.data);

  if (!curso)
    return (
      <Feedback intent="info" title="Sin cursos">
        La sección todavía no tiene cursos asignados.
      </Feedback>
    );
  return (
    <>
      <div className="card grade-context plan-filtros">
        <label className="field">
          Curso
          <select value={curso.id} onChange={(evento) => setCursoId(evento.target.value)}>
            {lista.map(({ curso: c }) => (
              <option key={c.id} value={c.id}>
                {etiquetaCurso(
                  c,
                  lista.map((item) => item.curso),
                )}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Bimestre
          <select
            value={bimestre?.id ?? ''}
            onChange={(evento) => setBimestreId(evento.target.value)}
          >
            {bimestres.data.map(({ id, nombre }) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bimestre && (
        <ActividadesDelCurso
          key={`${curso.id}:${bimestre.id}`}
          matriculaId={matricula.id}
          cursoId={curso.id}
          bimestre={bimestre}
        />
      )}
    </>
  );
}

export default function ActividadesClase() {
  const estudiantes = useResource('/libretas');
  const [estudianteId, setEstudianteId] = useState(null);
  const lista = estudiantes.data ?? [];
  const estudiante = lista.find(({ id }) => id === estudianteId) ?? lista[0];
  // Las actividades son del año en curso: se usa la matrícula activa.
  const matricula = estudiante?.matriculas.find(({ activa }) => activa);

  return (
    <AppLayout section={SECCION} step="Plan semanal" anioAcademico={matricula?.anioAcademico}>
      <div className="page-heading">
        <h1>Actividades de clase</h1>
        <p className="muted">
          {matricula
            ? `${estudiante.nombre} · ${matricula.seccion}. Lo que se trabajó cada semana en clase.`
            : 'Lo que se trabajó cada semana en clase.'}
        </p>
      </div>
      {estudiantes.loading && <Loading>Cargando…</Loading>}
      {estudiantes.error && <ResourceError {...estudiantes} />}
      {lista.length > 1 && (
        <div className="card grade-context plan-filtros">
          <label className="field">
            Consultar estudiante
            <select
              value={estudiante.id}
              onChange={(evento) => setEstudianteId(Number(evento.target.value))}
            >
              {lista.map(({ id, nombre }) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {estudiantes.data && !matricula && (
        <Feedback intent="info" title="Sin matrícula activa">
          Este perfil no tiene una matrícula en el año académico en curso.
        </Feedback>
      )}
      {matricula && <Selectores key={matricula.id} matricula={matricula} />}
    </AppLayout>
  );
}
