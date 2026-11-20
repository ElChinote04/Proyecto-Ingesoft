import { useEffect, useRef, useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import ActividadModal from '../components/ActividadModal';
import PlanSemanal from '../components/PlanSemanal';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { bimestrePorDefecto, cursosDe, etiquetaCurso, nombreSeccion } from '../utils/planTrabajo';

const SECCION = 'Plan de trabajo';

function CrearPlan({ asignacion, bimestre, onCreado, onClose }) {
  const dialogo = useRef(null);
  const [titulo, setTitulo] = useState(`Plan de ${asignacion.curso.nombre} – ${bimestre.nombre}`);
  const [objetivo, setObjetivo] = useState('');
  const [fallo, setFallo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  async function crear(evento) {
    evento.preventDefault();
    if (!titulo.trim() || !objetivo.trim()) return;
    setGuardando(true);
    setFallo(null);
    try {
      await api('/planes-academicos', {
        method: 'POST',
        body: {
          asignacionId: asignacion.id,
          bimestreId: bimestre.id,
          titulo: titulo.trim(),
          objetivo: objetivo.trim(),
        },
      });
      await onCreado();
    } catch (error) {
      setFallo(error);
      setGuardando(false);
    }
  }

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog"
      aria-labelledby="crear-plan-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!guardando) onClose();
      }}
    >
      <form onSubmit={crear} noValidate className="stack">
        <h2 id="crear-plan-titulo">Crear plan de trabajo</h2>
        <p className="muted">
          {asignacion.curso.nombre} · {nombreSeccion(asignacion.seccion)} · {bimestre.nombre}
        </p>
        {fallo && <Feedback title={fallo.message} />}
        <label className="field">
          <span>Título *</span>
          <input
            value={titulo}
            maxLength={200}
            required
            onChange={(evento) => setTitulo(evento.target.value)}
          />
        </label>
        <label className="field">
          <span>Objetivo *</span>
          <textarea
            rows={3}
            maxLength={1000}
            required
            value={objetivo}
            placeholder="Qué se espera lograr en el bimestre"
            onChange={(evento) => setObjetivo(evento.target.value)}
          />
        </label>
        <div className="actions">
          <button type="button" className="secondary" disabled={guardando} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando || !titulo.trim() || !objetivo.trim()}>
            {guardando ? 'Creando…' : 'Crear plan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Se monta con un plan existente: la vista por semanas y el modal de actividades.
function VistaPlan({ planId }) {
  const plan = useResource(`/planes-academicos/${planId}`);
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState('');

  if (plan.loading) return <Loading>Cargando plan de trabajo…</Loading>;
  if (plan.error) return <ResourceError error={plan.error} retry={plan.retry} />;
  const datos = plan.data;

  return (
    <>
      <div className="card plan-encabezado">
        <h2>
          {datos.titulo}
          {datos.bimestre.cerrado && <span className="badge neutral">Solo lectura</span>}
        </h2>
        <p className="muted">{datos.objetivo}</p>
        <p className="caption">
          {datos.curso.nombre} · {nombreSeccion(datos.seccion)} · {datos.bimestre.nombre} ·{' '}
          {datos.bimestre.semanas} semanas
        </p>
      </div>
      {aviso && <Feedback intent="success" title={aviso} />}
      <PlanSemanal
        semanas={datos.semanas}
        onAbrir={(actividad) => setModal({ actividadId: actividad.id })}
        onAgregar={
          datos.puedeEditar
            ? (numeroSemana) => {
                setAviso('');
                setModal({ semanaInicial: numeroSemana });
              }
            : undefined
        }
      />
      {modal && (
        <ActividadModal
          modo="docente"
          plan={datos}
          actividadId={modal.actividadId}
          semanaInicial={modal.semanaInicial}
          onClose={() => setModal(null)}
          onCambio={({ cerrar, aviso: mensaje }) => {
            if (cerrar) {
              setModal(null);
              if (mensaje) setAviso(mensaje);
              // Se vuelve a consultar: la pantalla muestra lo que realmente quedó guardado.
              plan.retry();
            }
          }}
        />
      )}
    </>
  );
}

function PlanDeClase({ asignacion, bimestre }) {
  const planes = useResource(
    `/planes-academicos?cursoId=${asignacion.curso.id}&seccionId=${asignacion.seccion.id}&bimestreId=${bimestre.id}`,
  );
  const [creando, setCreando] = useState(false);

  if (!bimestre.semanas)
    return (
      <Feedback intent="info" title="Bimestre sin fechas">
        El administrador aún no definió las fechas de este bimestre. Cuando lo haga podrás armar el
        plan por semanas.
      </Feedback>
    );
  if (planes.loading) return <Loading>Buscando el plan…</Loading>;
  if (planes.error) return <ResourceError error={planes.error} retry={planes.retry} />;
  const [plan] = planes.data;
  if (plan) return <VistaPlan key={plan.id} planId={plan.id} />;

  const cerrado = bimestre.cerrado;
  return (
    <>
      <div className="card plan-vacio">
        <p>
          {cerrado
            ? 'Este bimestre ya terminó y no tuvo plan de trabajo.'
            : 'Esta clase todavía no tiene plan de trabajo en el bimestre.'}
        </p>
        {!cerrado && <button onClick={() => setCreando(true)}>Crear plan</button>}
      </div>
      {creando && (
        <CrearPlan
          asignacion={asignacion}
          bimestre={bimestre}
          onClose={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            planes.retry();
          }}
        />
      )}
    </>
  );
}

export default function PlanTrabajo() {
  const asignaciones = useResource('/asignaciones');
  const bimestres = useResource('/bimestres');
  const [cursoId, setCursoId] = useState('');
  const [seccionId, setSeccionId] = useState('');
  const [bimestreId, setBimestreId] = useState('');

  const cargando = asignaciones.loading || bimestres.loading;
  const error = asignaciones.error ?? bimestres.error;
  if (cargando || error)
    return (
      <AppLayout section={SECCION} step="Plan semanal">
        {cargando ? (
          <Loading>Cargando tus cursos…</Loading>
        ) : (
          <ResourceError
            error={error}
            retry={() => {
              asignaciones.retry();
              bimestres.retry();
            }}
          />
        )}
      </AppLayout>
    );

  const cursos = cursosDe(asignaciones.data);
  // Con una sola opción no hay nada que elegir: se selecciona sola.
  const curso =
    cursos.find(({ id }) => String(id) === cursoId) ?? (cursos.length === 1 ? cursos[0] : null);
  const clases = curso?.clases ?? [];
  const asignacion =
    clases.find(({ seccion }) => String(seccion.id) === seccionId) ??
    (clases.length === 1 ? clases[0] : null);
  const listaBimestres = bimestres.data;
  const bimestre =
    listaBimestres.find(({ id }) => String(id) === bimestreId) ??
    bimestrePorDefecto(listaBimestres);

  return (
    <AppLayout section={SECCION} step="Plan semanal">
      <div className="page-heading">
        <h1>Plan de trabajo</h1>
        <p className="muted">
          Organiza por semana las actividades de tu clase: exposiciones, ejercicios, videos y
          avances. No forma parte de las calificaciones.
        </p>
      </div>
      {!cursos.length ? (
        <Feedback intent="info" title="Sin cursos asignados">
          Todavía no tienes cursos asignados en el año académico activo.
        </Feedback>
      ) : (
        <>
          <div className="card grade-context plan-filtros">
            <label className="field">
              Curso
              <select
                value={curso ? String(curso.id) : ''}
                onChange={(evento) => {
                  setCursoId(evento.target.value);
                  setSeccionId('');
                }}
              >
                <option value="" disabled>
                  Seleccionar curso
                </option>
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
                value={asignacion ? String(asignacion.seccion.id) : ''}
                disabled={!curso}
                onChange={(evento) => setSeccionId(evento.target.value)}
              >
                <option value="" disabled>
                  Seleccionar sección
                </option>
                {clases.map(({ id, seccion }) => (
                  <option key={id} value={seccion.id}>
                    {nombreSeccion(seccion)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Bimestre
              <select
                value={bimestre ? String(bimestre.id) : ''}
                onChange={(evento) => setBimestreId(evento.target.value)}
              >
                {listaBimestres.map(({ id, nombre, cerrado, semanas }) => (
                  <option key={id} value={id}>
                    {nombre}
                    {!semanas ? ' (sin fechas)' : cerrado ? ' (terminado)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {asignacion && bimestre && (
            <PlanDeClase
              key={`${asignacion.id}:${bimestre.id}`}
              asignacion={asignacion}
              bimestre={bimestre}
            />
          )}
        </>
      )}
    </AppLayout>
  );
}
