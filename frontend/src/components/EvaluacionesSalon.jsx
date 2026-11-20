import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { CampoError } from './CampoArchivos';
import ConfirmarAccion from './ConfirmarAccion';
import { Feedback, Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';
import { fechaCorta } from '../utils/planTrabajo';

const PESOS = [1, 2, 3, 4, 5];

function FormularioEvaluacion({ lista, evaluacion, onGuardada, onCancelar }) {
  const { bimestre } = lista;
  // Con un solo curso en el salón no hay nada que elegir.
  const [cursoId, setCursoId] = useState(
    String(evaluacion?.cursoId ?? (lista.cursos.length === 1 ? lista.cursos[0].id : '')),
  );
  const [competenciaId, setCompetenciaId] = useState(String(evaluacion?.competenciaId ?? ''));
  const [titulo, setTitulo] = useState(evaluacion?.titulo ?? '');
  const [fecha, setFecha] = useState(evaluacion?.fecha ?? '');
  const [peso, setPeso] = useState(String(evaluacion?.peso ?? 1));
  const [errores, setErrores] = useState({});
  const [fallo, setFallo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const curso = lista.cursos.find(({ id }) => String(id) === cursoId);
  // Con resultados, cambiar la competencia movería notas de una competencia a otra.
  const competenciaFija = Boolean(evaluacion?.avance.registrados);

  async function guardar(evento) {
    evento.preventDefault();
    const encontrados = {
      competencia: competenciaId ? '' : 'Elige la competencia que evalúa.',
      titulo: titulo.trim() ? '' : 'Escribe el nombre de la evaluación.',
      fecha:
        fecha && fecha >= bimestre.fechaInicio && fecha <= bimestre.fechaFin
          ? ''
          : `Elige una fecha del ${bimestre.nombre}.`,
    };
    setErrores(encontrados);
    if (Object.values(encontrados).some(Boolean)) return;
    const datos = {
      titulo: titulo.trim(),
      fecha,
      peso: Number(peso),
      ...(!competenciaFija && { competenciaId: Number(competenciaId) }),
    };
    setGuardando(true);
    setFallo(null);
    try {
      if (evaluacion) await api(`/evaluaciones/${evaluacion.id}`, { method: 'PATCH', body: datos });
      else
        await api('/evaluaciones', {
          method: 'POST',
          body: {
            ...datos,
            cursoId: Number(cursoId),
            seccionId: lista.seccionId,
            bimestreId: bimestre.id,
          },
        });
      onGuardada(evaluacion ? 'Evaluación actualizada.' : 'Evaluación creada.');
    } catch (error) {
      setFallo(error);
      setGuardando(false);
    }
  }

  return (
    <form className="card admin-form evaluation-form" onSubmit={guardar} noValidate>
      <h3>{evaluacion ? `Editar «${evaluacion.titulo}»` : 'Nueva evaluación'}</h3>
      <div className="form-grid">
        <label className="field">
          <span>Curso</span>
          <select
            value={cursoId}
            disabled={Boolean(evaluacion)}
            onChange={(evento) => {
              setCursoId(evento.target.value);
              setCompetenciaId('');
            }}
          >
            <option value="">Seleccionar…</option>
            {lista.cursos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Competencia</span>
          <select
            value={competenciaId}
            disabled={!curso || competenciaFija}
            aria-invalid={Boolean(errores.competencia)}
            aria-describedby="evaluacion-competencia-error"
            onChange={(evento) => setCompetenciaId(evento.target.value)}
          >
            <option value="">Seleccionar…</option>
            {curso?.competencias.map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} · {item.nombre}
              </option>
            ))}
          </select>
          {competenciaFija && (
            <span className="caption">Ya tiene notas: la competencia no se puede cambiar.</span>
          )}
          <CampoError id="evaluacion-competencia-error">{errores.competencia}</CampoError>
        </label>
        <label className="field">
          <span>Nombre</span>
          <input
            value={titulo}
            maxLength={150}
            placeholder="Ej.: Práctica calificada 1"
            aria-invalid={Boolean(errores.titulo)}
            aria-describedby="evaluacion-titulo-error"
            onChange={(evento) => setTitulo(evento.target.value)}
          />
          <CampoError id="evaluacion-titulo-error">{errores.titulo}</CampoError>
        </label>
        <label className="field">
          <span>Fecha</span>
          <input
            type="date"
            value={fecha}
            min={bimestre.fechaInicio}
            max={bimestre.fechaFin}
            aria-invalid={Boolean(errores.fecha)}
            aria-describedby="evaluacion-fecha-error"
            onChange={(evento) => setFecha(evento.target.value)}
          />
          <CampoError id="evaluacion-fecha-error">{errores.fecha}</CampoError>
        </label>
        <label className="field">
          <span>Peso</span>
          <select value={peso} onChange={(evento) => setPeso(evento.target.value)}>
            {PESOS.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
          <span className="caption">Un examen con peso 2 vale el doble que una práctica.</span>
        </label>
      </div>
      {fallo && <Feedback title={fallo.message} />}
      <div className="actions">
        <button type="button" className="secondary" disabled={guardando} onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar evaluación'}
        </button>
      </div>
    </form>
  );
}

function Pendientes({ evaluacion }) {
  const alumnos = useResource(`/evaluaciones/${evaluacion.id}/pendientes`);
  if (alumnos.loading) return <Loading>Buscando a quién le falta…</Loading>;
  if (alumnos.error) return <ResourceError error={alumnos.error} retry={alumnos.retry} />;
  if (!alumnos.data.length) return <p className="caption">Todos los alumnos tienen resultado.</p>;
  return <p className="caption">Faltan: {alumnos.data.map(({ nombre }) => nombre).join(', ')}.</p>;
}

function FilaEvaluacion({ evaluacion, editable, onEditar, onEliminar }) {
  const [verPendientes, setVerPendientes] = useState(false);
  const { registrados, total } = evaluacion.avance;
  return (
    <li className="result-row">
      <div className="result-summary">
        <span>
          <strong>{evaluacion.titulo}</strong>
          <span className="caption">
            {' '}
            · {fechaCorta(evaluacion.fecha)} · peso {evaluacion.peso}
          </span>
        </span>
        <span className={`badge ${registrados === total ? 'success' : 'warning'}`}>
          {registrados} de {total} registrados
        </span>
        <span className="row-actions">
          {registrados < total && (
            <button
              type="button"
              className="text-button"
              aria-expanded={verPendientes}
              onClick={() => setVerPendientes((actual) => !actual)}
            >
              {verPendientes ? 'Ocultar' : 'Ver faltan'}
            </button>
          )}
          {editable && (
            <>
              <button
                type="button"
                className="text-button"
                aria-label={`Editar ${evaluacion.titulo}`}
                onClick={onEditar}
              >
                Editar
              </button>
              <button
                type="button"
                className="text-button"
                aria-label={`Eliminar ${evaluacion.titulo}`}
                onClick={onEliminar}
              >
                Eliminar
              </button>
            </>
          )}
        </span>
      </div>
      {verPendientes && <Pendientes evaluacion={evaluacion} />}
    </li>
  );
}

export default function EvaluacionesSalon({ salon, bimestre, onClose }) {
  const dialogo = useRef(null);
  const ruta = `/evaluaciones?seccionId=${salon.id}&bimestreId=${bimestre.id}`;
  const recurso = useResource(ruta);
  const [recargada, setRecargada] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [eliminar, setEliminar] = useState(null);
  const [aviso, setAviso] = useState('');
  const [fallo, setFallo] = useState(null);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);
  const lista = recargada ?? recurso.data;
  const editable = lista && !lista.bimestre.publicado && lista.bimestre.fechaInicio;

  async function recargar(mensaje) {
    setFormulario(null);
    setAviso(mensaje);
    try {
      setRecargada(await api(ruta));
    } catch (error) {
      setFallo(error);
    }
  }

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog grading-dialog"
      aria-labelledby="evaluaciones-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        onClose();
      }}
    >
      <div className="rule-heading">
        <div>
          <h2 id="evaluaciones-titulo">Evaluaciones del bimestre</h2>
          <p className="muted">
            {salon.nombre} · {bimestre.nombre}
          </p>
        </div>
        {editable && !formulario && (
          <button type="button" onClick={() => setFormulario({})}>
            + Nueva evaluación
          </button>
        )}
      </div>
      {lista?.bimestre.publicado && (
        <Feedback intent="info" title="Libreta publicada">
          Las evaluaciones de este bimestre quedan en modo consulta.
        </Feedback>
      )}
      {lista && !lista.bimestre.fechaInicio && (
        <Feedback intent="warning" title="Bimestre sin fechas">
          El administrador debe registrar las fechas del {bimestre.nombre} antes de crear
          evaluaciones.
        </Feedback>
      )}
      {aviso && <Feedback intent="success" title={aviso} />}
      {fallo && <Feedback title={fallo.message} />}
      {formulario && (
        <FormularioEvaluacion
          key={formulario.evaluacion?.id ?? 'nueva'}
          lista={{ ...lista, seccionId: salon.id }}
          evaluacion={formulario.evaluacion}
          onGuardada={recargar}
          onCancelar={() => setFormulario(null)}
        />
      )}
      {!lista && recurso.error ? (
        <ResourceError error={recurso.error} retry={recurso.retry} />
      ) : !lista ? (
        <Loading>Cargando evaluaciones…</Loading>
      ) : (
        lista.cursos.map((curso) => (
          <section className="grading-course" key={curso.id}>
            <h3>{curso.nombre}</h3>
            {curso.competencias.map((competencia) => (
              <div className="grading-competency" key={competencia.id}>
                <p>
                  <strong>
                    {competencia.codigo} · {competencia.nombre}
                  </strong>
                </p>
                {!competencia.evaluaciones.length ? (
                  <p className="caption">
                    Sin evaluaciones: la libreta no se publica hasta que tenga al menos una.
                  </p>
                ) : (
                  <ul className="result-list">
                    {competencia.evaluaciones.map((evaluacion) => (
                      <FilaEvaluacion
                        key={evaluacion.id}
                        evaluacion={evaluacion}
                        editable={editable && !formulario}
                        onEditar={() =>
                          setFormulario({ evaluacion: { ...evaluacion, cursoId: curso.id } })
                        }
                        onEliminar={() => setEliminar(evaluacion)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {eliminar && (
        <ConfirmarAccion
          titulo={`¿Eliminar «${eliminar.titulo}»?`}
          confirmar="Eliminar"
          onConfirm={async () => {
            await api(`/evaluaciones/${eliminar.id}`, { method: 'DELETE' });
            await recargar('Evaluación eliminada. Las letras se recalcularon.');
          }}
          onClose={() => setEliminar(null)}
        >
          {eliminar.avance.registrados
            ? `Tiene ${eliminar.avance.registrados} resultados; dejarán de contar en el promedio.`
            : 'Todavía no tiene resultados.'}
        </ConfirmarAccion>
      )}
    </dialog>
  );
}
