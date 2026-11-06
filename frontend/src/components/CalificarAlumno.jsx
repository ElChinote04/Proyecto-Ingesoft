import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Feedback, Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';

const NIVELES = ['AD', 'A', 'B', 'C'];

function CursoCompetencias({ curso, cambios, onCambio }) {
  return (
    <section className="grading-course">
      <h3>{curso.nombre}</h3>
      {!curso.regla ? (
        <Feedback intent="warning" title="Curso sin regla vigente">
          El administrador debe definir la regla de consolidación antes de calificar este curso.
        </Feedback>
      ) : !curso.competencias.length ? (
        <p className="muted">Este curso todavía no tiene competencias activas.</p>
      ) : (
        curso.competencias.map((competencia) => (
          <fieldset className="grading-competency" key={competencia.id}>
            <legend>
              {competencia.codigo} · {competencia.nombre}
            </legend>
            <div className="level-options">
              {NIVELES.map((nivel) => (
                <label key={nivel}>
                  <input
                    type="radio"
                    name={`competencia-${competencia.id}`}
                    checked={(cambios[competencia.id] ?? competencia.nivelLogro) === nivel}
                    onChange={() => onCambio(competencia, nivel)}
                  />
                  {nivel}
                </label>
              ))}
            </div>
          </fieldset>
        ))
      )}
    </section>
  );
}

function FichaCalificacion({ alumno, bimestreId, cambios, onCambio }) {
  const ficha = useResource(
    `/matriculas/${alumno.matriculaId}/calificaciones?bimestreId=${bimestreId}`,
  );
  if (ficha.loading) return <Loading>Cargando competencias…</Loading>;
  if (ficha.error) return <ResourceError error={ficha.error} retry={ficha.retry} />;
  return ficha.data.cursos.map((curso) => (
    <CursoCompetencias key={curso.id} curso={curso} cambios={cambios} onCambio={onCambio} />
  ));
}

export default function CalificarAlumno({ alumno, salon, onClose, onSaved }) {
  const dialogo = useRef(null);
  const bimestres = useResource('/bimestres');
  const [bimestreElegido, setBimestreElegido] = useState('');
  const [cambios, setCambios] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  const opciones = (bimestres.data ?? []).filter(
    (item) => item.anioAcademicoId === salon.anioAcademicoId,
  );
  const bimestreId = bimestreElegido || opciones[0]?.id;
  const pendientes = Object.entries(cambios);

  // Solo viajan las competencias que cambiaron, para no auditar lo que sigue igual.
  function cambiar(competencia, nivel) {
    setCambios((actual) => {
      const siguiente = { ...actual, [competencia.id]: nivel };
      if (nivel === competencia.nivelLogro) delete siguiente[competencia.id];
      return siguiente;
    });
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const resultado = await api(`/matriculas/${alumno.matriculaId}/calificaciones`, {
        method: 'PUT',
        body: {
          bimestreId: Number(bimestreId),
          calificaciones: pendientes.map(([competenciaId, nivelLogro]) => ({
            competenciaId: Number(competenciaId),
            nivelLogro,
          })),
        },
      });
      onSaved(resultado);
    } catch (fallo) {
      setError(fallo);
      setGuardando(false);
    }
  }

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog grading-dialog"
      aria-labelledby="calificar-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!guardando) onClose();
      }}
    >
      <h2 id="calificar-titulo">Calificar a {alumno.nombre}</h2>
      <p className="muted">{salon.nombre}</p>
      {bimestres.loading ? (
        <Loading>Cargando bimestres…</Loading>
      ) : bimestres.error ? (
        <ResourceError error={bimestres.error} retry={bimestres.retry} />
      ) : !opciones.length ? (
        <Feedback intent="warning" title="Sin bimestres para el año académico">
          El salón seleccionado no tiene bimestres académicos configurados.
        </Feedback>
      ) : (
        <>
          <label className="field">
            Bimestre
            <select
              value={bimestreId}
              disabled={pendientes.length > 0}
              onChange={(evento) => setBimestreElegido(Number(evento.target.value))}
            >
              {opciones.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </label>
          {pendientes.length > 0 && (
            <p className="muted">Guarda o cancela los cambios para cambiar de bimestre.</p>
          )}
          <FichaCalificacion
            alumno={alumno}
            bimestreId={bimestreId}
            cambios={cambios}
            onCambio={cambiar}
          />
        </>
      )}
      {error && <Feedback title={error.message} />}
      <div className="actions">
        <button type="button" className="secondary" disabled={guardando} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" disabled={guardando || !pendientes.length} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar calificaciones'}
        </button>
      </div>
    </dialog>
  );
}
