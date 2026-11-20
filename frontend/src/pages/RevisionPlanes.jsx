import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import ActividadModal from '../components/ActividadModal';
import PestanasGestion from '../components/PestanasGestion';
import PlanSemanal from '../components/PlanSemanal';
import TablaDatos from '../components/TablaDatos';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';
import { bimestrePorDefecto, cursosDe, etiquetaCurso, nombreSeccion } from '../utils/planTrabajo';

function PlanEnRevision({ planId, onVolver }) {
  const plan = useResource(`/planes-academicos/${planId}`);
  const [abierta, setAbierta] = useState(null);
  const [aviso, setAviso] = useState('');

  if (plan.loading) return <Loading>Cargando plan…</Loading>;
  if (plan.error) return <ResourceError error={plan.error} retry={plan.retry} />;
  const datos = plan.data;
  return (
    <>
      <button type="button" className="text-button" onClick={onVolver}>
        ← Volver a los planes
      </button>
      <div className="card plan-encabezado">
        <h2>{datos.titulo}</h2>
        <p className="muted">{datos.objetivo}</p>
        <p className="caption">
          {datos.curso.nombre} · {nombreSeccion(datos.seccion)} · {datos.bimestre.nombre} · Docente:{' '}
          {datos.docente ?? '—'}
        </p>
      </div>
      {aviso && <Feedback intent="success" title={aviso} />}
      <PlanSemanal
        semanas={datos.semanas}
        onAbrir={(actividad) => {
          setAviso('');
          setAbierta(actividad.id);
        }}
      />
      {abierta && (
        <ActividadModal
          modo="admin"
          plan={datos}
          actividadId={abierta}
          onClose={() => setAbierta(null)}
          onCambio={({ cerrar, aviso: mensaje }) => {
            if (!cerrar) return;
            setAbierta(null);
            if (mensaje) setAviso(mensaje);
            plan.retry();
          }}
        />
      )}
    </>
  );
}

function ListaPlanes({ filtros, onAbrir }) {
  const consulta = new URLSearchParams(
    Object.entries(filtros).filter(([, valor]) => valor),
  ).toString();
  const planes = useResource(`/planes-academicos?${consulta}`);
  if (planes.loading) return <Loading>Cargando planes…</Loading>;
  if (planes.error) return <ResourceError error={planes.error} retry={planes.retry} />;
  return (
    <TablaDatos
      columnas={['Clase', 'Docente', 'Plan', 'Actividades', 'Acción']}
      filas={planes.data.map((plan) => ({
        id: plan.id,
        celdas: [
          `${plan.curso.nombre} · ${nombreSeccion(plan.seccion)}`,
          plan.docente ?? '—',
          plan.titulo,
          plan.totalActividades,
          <button
            key="ver"
            type="button"
            aria-label={`Revisar el plan de ${plan.curso.nombre} ${nombreSeccion(plan.seccion)}`}
            onClick={() => onAbrir(plan.id)}
          >
            Revisar
          </button>,
        ],
      }))}
      vacio="No hay planes de trabajo con esos filtros."
    />
  );
}

export default function RevisionPlanes() {
  const asignaciones = useResource('/asignaciones');
  const bimestres = useResource('/bimestres');
  const [filtros, setFiltros] = useState({ cursoId: '', seccionId: '', bimestreId: '' });
  const [planId, setPlanId] = useState(null);

  const cargando = asignaciones.loading || bimestres.loading;
  const error = asignaciones.error ?? bimestres.error;
  const cursos = asignaciones.data ? cursosDe(asignaciones.data) : [];
  const secciones = new Map(
    (asignaciones.data ?? [])
      .filter(({ curso }) => !filtros.cursoId || String(curso.id) === filtros.cursoId)
      .map(({ seccion }) => [seccion.id, seccion]),
  );
  const bimestreId =
    filtros.bimestreId ||
    String(bimestres.data ? (bimestrePorDefecto(bimestres.data)?.id ?? '') : '');

  return (
    <AppLayout section="Gestión Académica" step="Planes de trabajo">
      <PestanasGestion actual="#/gestion/planes" />
      <div className="page-heading">
        <h1>Planes de trabajo</h1>
        <p className="muted">
          Revisa las actividades realizadas por los docentes. Valida u observa cada una.
        </p>
      </div>
      {cargando && <Loading>Cargando…</Loading>}
      {error && (
        <ResourceError
          error={error}
          retry={() => {
            asignaciones.retry();
            bimestres.retry();
          }}
        />
      )}
      {!cargando && !error && (
        <>
          {!planId && (
            <div className="card grade-context plan-filtros">
              <label className="field">
                Bimestre
                <select
                  value={bimestreId}
                  onChange={(evento) => setFiltros({ ...filtros, bimestreId: evento.target.value })}
                >
                  {bimestres.data.map(({ id, nombre }) => (
                    <option key={id} value={id}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Curso
                <select
                  value={filtros.cursoId}
                  onChange={(evento) =>
                    setFiltros({ ...filtros, cursoId: evento.target.value, seccionId: '' })
                  }
                >
                  <option value="">Todos los cursos</option>
                  {cursos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {etiquetaCurso(item, cursos)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Sección
                <select
                  value={filtros.seccionId}
                  onChange={(evento) => setFiltros({ ...filtros, seccionId: evento.target.value })}
                >
                  <option value="">Todas las secciones</option>
                  {[...secciones.values()].map((seccion) => (
                    <option key={seccion.id} value={seccion.id}>
                      {nombreSeccion(seccion)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {planId ? (
            <PlanEnRevision key={planId} planId={planId} onVolver={() => setPlanId(null)} />
          ) : (
            <ListaPlanes filtros={{ ...filtros, bimestreId }} onAbrir={setPlanId} />
          )}
        </>
      )}
    </AppLayout>
  );
}
