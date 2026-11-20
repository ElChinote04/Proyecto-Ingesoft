import { useEffect, useRef, useState } from 'react';
import { api, descargar } from '../api/client';
import CampoArchivos, { CampoError } from './CampoArchivos';
import ConfirmarAccion from './ConfirmarAccion';
import { Feedback, Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';
import { MAX_ARCHIVOS, formatearTamano, validarArchivos } from '../utils/archivosAdjuntos';
import { fechaCorta } from '../utils/planTrabajo';
import LetraLogro from './LetraLogro';
import { CONDICIONES, formatearNota, leerNota } from '../utils/notas';

const rutaResultado = (evaluacionId, matriculaId) =>
  `/evaluaciones/${evaluacionId}/resultados/${matriculaId}`;

function ArchivosResultado({ evaluacionId, matriculaId, archivos, quitados, onQuitar, onError }) {
  return (
    <ul className="evidence-files">
      {archivos.map((archivo) => (
        <li key={archivo.id} className={quitados?.includes(archivo.id) ? 'muted' : undefined}>
          <span>
            {archivo.nombre}{' '}
            <span className="caption">({formatearTamano(archivo.tamanoBytes)})</span>
          </span>
          <span className="row-actions">
            <button
              type="button"
              className="text-button"
              aria-label={`Descargar ${archivo.nombre}`}
              onClick={() =>
                descargar(
                  `${rutaResultado(evaluacionId, matriculaId)}/archivos/${archivo.id}`,
                  archivo.nombre,
                ).catch(onError)
              }
            >
              Descargar
            </button>
            {onQuitar && (
              <button
                type="button"
                className="text-button"
                aria-pressed={quitados.includes(archivo.id)}
                onClick={() => onQuitar(archivo.id)}
              >
                {quitados.includes(archivo.id) ? 'Conservar' : 'Quitar'}
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ResumenResultado({ resultado }) {
  if (!resultado) return <span className="badge warning">Pendiente</span>;
  if (resultado.condicion === 'NO_RINDIO')
    return <span className="badge neutral">No rindió · cuenta 0</span>;
  if (resultado.condicion === 'JUSTIFICADA')
    return (
      <span className="badge info" title={resultado.motivo}>
        Justificada · no cuenta
      </span>
    );
  return <strong className="result-grade">{formatearNota(resultado.nota)}</strong>;
}

function FormularioResultado({ evaluacion, matriculaId, onGuardado, onCancelar, onCambio }) {
  const anterior = evaluacion.resultado;
  const selector = useRef(null);
  const [condicion, setCondicion] = useState(anterior?.condicion ?? 'CALIFICADA');
  const [nota, setNota] = useState(anterior?.nota != null ? formatearNota(anterior.nota) : '');
  const [motivo, setMotivo] = useState(anterior?.motivo ?? '');
  const [archivos, setArchivos] = useState([]);
  const [quitados, setQuitados] = useState([]);
  const [errores, setErrores] = useState({});
  const [fallo, setFallo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [quitar, setQuitar] = useState(false);
  const previos = (anterior?.archivos ?? []).filter(({ id }) => !quitados.includes(id));
  const id = `resultado-${evaluacion.id}`;

  const cambiar = (accion) => {
    accion();
    setFallo(null);
    onCambio();
  };

  async function guardar(evento) {
    evento.preventDefault();
    const encontrados =
      condicion === 'CALIFICADA'
        ? {
            nota:
              leerNota(nota) === null ? 'Escribe una nota de 0 a 20 con hasta dos decimales.' : '',
            archivos:
              validarArchivos(archivos, previos.length, 'nota') ||
              (archivos.length + previos.length === 0
                ? 'Adjunta el examen corregido del alumno.'
                : ''),
          }
        : { motivo: condicion === 'JUSTIFICADA' && !motivo.trim() ? 'Escribe el motivo.' : '' };
    setErrores(encontrados);
    if (Object.values(encontrados).some(Boolean)) return;
    const datos = new FormData();
    datos.set('condicion', condicion);
    if (condicion === 'CALIFICADA') {
      datos.set('nota', String(leerNota(nota)));
      if (quitados.length) datos.set('archivosQuitados', JSON.stringify(quitados));
      for (const archivo of archivos) datos.append('archivos', archivo);
    }
    if (condicion === 'JUSTIFICADA') datos.set('motivo', motivo.trim());
    setGuardando(true);
    try {
      await api(rutaResultado(evaluacion.id, matriculaId), { method: 'PUT', body: datos });
      onGuardado();
    } catch (error) {
      setFallo(error);
      setGuardando(false);
    }
  }

  return (
    <>
      <form className="result-form" onSubmit={guardar} noValidate>
        <fieldset className="result-condition">
          <legend className="sr-only">Resultado de {evaluacion.titulo}</legend>
          {CONDICIONES.map(([valor, etiqueta]) => (
            <label key={valor} className="checkbox-field">
              <input
                type="radio"
                name={`condicion-${evaluacion.id}`}
                value={valor}
                checked={condicion === valor}
                onChange={() => cambiar(() => setCondicion(valor))}
              />
              {etiqueta}
            </label>
          ))}
        </fieldset>
        {condicion === 'CALIFICADA' && (
          <>
            <label className="field result-grade-field">
              <span>Nota (0 a 20)</span>
              <input
                inputMode="decimal"
                value={nota}
                aria-invalid={Boolean(errores.nota)}
                aria-describedby={`${id}-nota-error`}
                onChange={(evento) =>
                  cambiar(() => {
                    setNota(evento.target.value);
                    setErrores((actual) => ({ ...actual, nota: '' }));
                  })
                }
              />
              <CampoError id={`${id}-nota-error`}>{errores.nota}</CampoError>
            </label>
            {anterior?.archivos.length > 0 && (
              <ArchivosResultado
                evaluacionId={evaluacion.id}
                matriculaId={matriculaId}
                archivos={anterior.archivos}
                quitados={quitados}
                onError={setFallo}
                onQuitar={(archivoId) =>
                  cambiar(() =>
                    setQuitados((actual) =>
                      actual.includes(archivoId)
                        ? actual.filter((item) => item !== archivoId)
                        : [...actual, archivoId],
                    ),
                  )
                }
              />
            )}
            <CampoArchivos
              id={`${id}-archivos`}
              selector={selector}
              error={errores.archivos}
              unidad="nota"
              onChange={(evento) =>
                cambiar(() => {
                  setArchivos([...evento.target.files]);
                  setErrores((actual) => ({ ...actual, archivos: '' }));
                })
              }
            />
            <span className="caption">
              El examen corregido es obligatorio: de 1 a {MAX_ARCHIVOS} archivos.
            </span>
          </>
        )}
        {condicion === 'JUSTIFICADA' && (
          <label className="field">
            <span>Motivo</span>
            <input
              value={motivo}
              maxLength={300}
              placeholder="Ej.: certificado médico del 12/03"
              aria-invalid={Boolean(errores.motivo)}
              aria-describedby={`${id}-motivo-error`}
              onChange={(evento) =>
                cambiar(() => {
                  setMotivo(evento.target.value);
                  setErrores((actual) => ({ ...actual, motivo: '' }));
                })
              }
            />
            <CampoError id={`${id}-motivo-error`}>{errores.motivo}</CampoError>
          </label>
        )}
        {condicion === 'NO_RINDIO' && (
          <p className="caption">Cuenta como 0 en el promedio. No lleva archivo.</p>
        )}
        {fallo && <Feedback title={fallo.message} />}
        <div className="actions">
          {anterior && (
            <button
              type="button"
              className="text-button"
              disabled={guardando}
              onClick={() => setQuitar(true)}
            >
              Dejar pendiente
            </button>
          )}
          <button type="button" className="secondary" disabled={guardando} onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
      {quitar && (
        <ConfirmarAccion
          titulo={`¿Dejar pendiente «${evaluacion.titulo}»?`}
          confirmar="Dejar pendiente"
          onConfirm={async () => {
            await api(rutaResultado(evaluacion.id, matriculaId), { method: 'DELETE' });
            onGuardado();
          }}
          onClose={() => setQuitar(false)}
        >
          Se quita el resultado y su examen. La evaluación volverá a bloquear la publicación hasta
          que registres algo.
        </ConfirmarAccion>
      )}
    </>
  );
}

function FilaEvaluacion({ evaluacion, matriculaId, editable, enEdicion, ...acciones }) {
  const { onEditar, onError } = acciones;
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
        <ResumenResultado resultado={evaluacion.resultado} />
        {editable && !enEdicion && (
          <button
            type="button"
            className="text-button"
            aria-label={`${evaluacion.resultado ? 'Editar' : 'Registrar'} ${evaluacion.titulo}`}
            onClick={onEditar}
          >
            {evaluacion.resultado ? 'Editar' : 'Registrar'}
          </button>
        )}
      </div>
      {!enEdicion && evaluacion.resultado?.condicion === 'JUSTIFICADA' && (
        <p className="caption">Motivo: {evaluacion.resultado.motivo}</p>
      )}
      {!enEdicion && evaluacion.resultado?.archivos.length > 0 && (
        <ArchivosResultado
          evaluacionId={evaluacion.id}
          matriculaId={matriculaId}
          archivos={evaluacion.resultado.archivos}
          onError={onError}
        />
      )}
      {enEdicion && (
        <FormularioResultado evaluacion={evaluacion} matriculaId={matriculaId} {...acciones} />
      )}
    </li>
  );
}

function Competencia({ competencia, matriculaId, editable, edicion, ...acciones }) {
  return (
    <fieldset className="grading-competency">
      <legend>
        {competencia.codigo} · {competencia.nombre}
      </legend>
      {!competencia.evaluaciones.length ? (
        <p className="caption">
          Todavía no hay evaluaciones de esta competencia. Créalas en «Evaluaciones del bimestre».
        </p>
      ) : (
        <ul className="result-list">
          {competencia.evaluaciones.map((evaluacion) => (
            <FilaEvaluacion
              key={evaluacion.id}
              evaluacion={evaluacion}
              matriculaId={matriculaId}
              editable={editable && (edicion === null || edicion === evaluacion.id)}
              enEdicion={edicion === evaluacion.id}
              {...acciones}
              onEditar={() => acciones.onEditar(evaluacion.id)}
            />
          ))}
        </ul>
      )}
      <p className="result-average">
        {competencia.nivelLogro ? (
          <>
            Promedio {formatearNota(competencia.promedio)} →{' '}
            <LetraLogro nivel={competencia.nivelLogro} />
          </>
        ) : (
          <span className="muted">Sin letra todavía</span>
        )}
        {competencia.pendientes > 0 && (
          <span className="caption">
            {' '}
            · {competencia.pendientes === 1 ? 'falta 1' : `faltan ${competencia.pendientes}`}
          </span>
        )}
      </p>
    </fieldset>
  );
}

export default function CalificarAlumno({ alumno, salon, bimestre, onClose }) {
  const dialogo = useRef(null);
  const ruta = `/matriculas/${alumno.matriculaId}/calificaciones?bimestreId=${bimestre.id}`;
  const ficha = useResource(ruta);
  // Se recarga sobre lo ya mostrado para no vaciar el modal tras cada guardado.
  const [recargada, setRecargada] = useState(null);
  const datos = recargada ?? ficha.data;
  const [edicion, setEdicion] = useState(null);
  const [sucio, setSucio] = useState(false);
  const [salir, setSalir] = useState(false);
  const [aviso, setAviso] = useState('');
  const [fallo, setFallo] = useState(null);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);
  const publicado = datos?.bimestre.publicado;

  function cerrar() {
    if (sucio) setSalir(true);
    else onClose();
  }
  const terminar = () => {
    setEdicion(null);
    setSucio(false);
  };

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog grading-dialog"
      aria-labelledby="calificar-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        cerrar();
      }}
    >
      <h2 id="calificar-titulo">Calificar a {alumno.nombre}</h2>
      <p className="muted">
        {salon.nombre} · {bimestre.nombre}
      </p>
      {publicado && (
        <Feedback intent="info" title="Libreta publicada">
          La libreta de este salón ya fue publicada: las notas están en modo consulta.
        </Feedback>
      )}
      {aviso && <Feedback intent="success" title={aviso} />}
      {fallo && <Feedback title={fallo.message} />}
      {!datos && ficha.error ? (
        <ResourceError error={ficha.error} retry={ficha.retry} />
      ) : !datos ? (
        <Loading>Cargando evaluaciones…</Loading>
      ) : (
        datos.cursos.map((curso) => (
          <section className="grading-course" key={curso.id}>
            <h3>{curso.nombre}</h3>
            {!curso.competencias.length ? (
              <p className="muted">Este curso todavía no tiene competencias activas.</p>
            ) : (
              curso.competencias.map((competencia) => (
                <Competencia
                  key={competencia.id}
                  competencia={competencia}
                  matriculaId={alumno.matriculaId}
                  editable={!publicado}
                  edicion={edicion}
                  onEditar={(id) => {
                    setAviso('');
                    setEdicion(id);
                  }}
                  onCancelar={terminar}
                  onCambio={() => setSucio(true)}
                  onError={setFallo}
                  onGuardado={async () => {
                    terminar();
                    setAviso('Resultado guardado. El promedio y la letra ya están al día.');
                    try {
                      setRecargada(await api(ruta));
                    } catch (error) {
                      setFallo(error);
                    }
                  }}
                />
              ))
            )}
          </section>
        ))
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={cerrar}>
          Cerrar
        </button>
      </div>
      {salir && (
        <ConfirmarAccion
          titulo="¿Descartar el resultado sin guardar?"
          confirmar="Descartar"
          onConfirm={onClose}
          onClose={() => setSalir(false)}
        >
          Hay una nota a medio registrar que se perderá.
        </ConfirmarAccion>
      )}
    </dialog>
  );
}
