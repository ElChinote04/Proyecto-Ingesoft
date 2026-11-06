import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import EvidenciasCompetencia from './EvidenciasCompetencia';
import { Feedback, Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';

const NIVELES = ['AD', 'A', 'B', 'C'];

function EvidenciaCompetencia({ competencia, publicado, tieneCambio, onAbrir }) {
  if (!competencia.calificacionCompetenciaId)
    return publicado ? null : <p className="caption">Califica y guarda para agregar evidencia.</p>;
  return (
    <div className="grading-evidence">
      <button
        type="button"
        className="secondary"
        disabled={tieneCambio}
        aria-label={`Evidencias de ${competencia.nombre}: ${competencia.totalEvidencias}`}
        onClick={() => onAbrir(competencia.calificacionCompetenciaId)}
      >
        Evidencias ({competencia.totalEvidencias})
      </button>
      {!competencia.totalEvidencias && <span className="badge warning">Falta evidencia</span>}
      {tieneCambio && (
        <span className="caption">Guarda el cambio de nivel para registrar evidencia.</span>
      )}
    </div>
  );
}

function CursoCompetencias({ curso, cambios, publicado, onCambio, onEvidencias }) {
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
                    disabled={publicado}
                    onChange={() => onCambio(competencia, nivel)}
                  />
                  {nivel}
                </label>
              ))}
            </div>
            <EvidenciaCompetencia
              competencia={competencia}
              publicado={publicado}
              tieneCambio={cambios[competencia.id] !== undefined}
              onAbrir={onEvidencias}
            />
          </fieldset>
        ))
      )}
    </section>
  );
}

function FichaCalificacion({ alumno, opciones, guardando, setGuardando, onClose }) {
  const [bimestreElegido, setBimestreElegido] = useState('');
  const [cambios, setCambios] = useState({});
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(null);
  const [notaEvidencias, setNotaEvidencias] = useState(null);
  const bimestreId = bimestreElegido || opciones[0].id;
  const ficha = useResource(
    `/matriculas/${alumno.matriculaId}/calificaciones?bimestreId=${bimestreId}`,
  );
  const pendientes = Object.entries(cambios);
  const publicado = ficha.data?.bimestre.publicado;

  // Solo viajan las competencias que cambiaron, para no auditar lo que sigue igual.
  function cambiar(competencia, nivel) {
    setGuardado(null);
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
      // El modal sigue abierto: la evidencia exige una nota guardada y este es el momento de subirla.
      setCambios({});
      setGuardado(resultado.total);
      ficha.retry();
    } catch (fallo) {
      setError(fallo);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <label className="field">
        Bimestre
        <select
          value={bimestreId}
          disabled={pendientes.length > 0}
          onChange={(evento) => {
            setGuardado(null);
            setBimestreElegido(Number(evento.target.value));
          }}
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
      {publicado && (
        <Feedback intent="info" title="Libreta publicada">
          La libreta de este salón ya fue publicada: las notas están en modo consulta.
        </Feedback>
      )}
      {ficha.loading ? (
        <Loading>Cargando competencias…</Loading>
      ) : ficha.error ? (
        <ResourceError error={ficha.error} retry={ficha.retry} />
      ) : (
        ficha.data.cursos.map((curso) => (
          <CursoCompetencias
            key={curso.id}
            curso={curso}
            cambios={cambios}
            publicado={publicado}
            onCambio={cambiar}
            onEvidencias={setNotaEvidencias}
          />
        ))
      )}
      {guardado !== null && (
        <Feedback intent="success" title="Calificaciones guardadas">
          Se registraron {guardado} competencias de {alumno.nombre}. Ya puedes agregar su evidencia.
        </Feedback>
      )}
      {error && <Feedback title={error.message} />}
      <div className="actions">
        <button type="button" className="secondary" disabled={guardando} onClick={onClose}>
          {pendientes.length ? 'Cancelar' : 'Cerrar'}
        </button>
        {!publicado && (
          <button type="button" disabled={guardando || !pendientes.length} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar calificaciones'}
          </button>
        )}
      </div>
      {notaEvidencias && (
        <EvidenciasCompetencia
          notaId={notaEvidencias}
          onClose={() => {
            setNotaEvidencias(null);
            ficha.retry();
          }}
        />
      )}
    </>
  );
}

export default function CalificarAlumno({ alumno, salon, onClose }) {
  const dialogo = useRef(null);
  const bimestres = useResource('/bimestres');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  const opciones = (bimestres.data ?? []).filter(
    (item) => item.anioAcademicoId === salon.anioAcademicoId,
  );

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
      {opciones.length ? (
        <FichaCalificacion
          alumno={alumno}
          opciones={opciones}
          guardando={guardando}
          setGuardando={setGuardando}
          onClose={onClose}
        />
      ) : (
        <>
          {bimestres.loading ? (
            <Loading>Cargando bimestres…</Loading>
          ) : bimestres.error ? (
            <ResourceError error={bimestres.error} retry={bimestres.retry} />
          ) : (
            <Feedback intent="warning" title="Sin bimestres para el año académico">
              El salón seleccionado no tiene bimestres académicos configurados.
            </Feedback>
          )}
          <div className="actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
