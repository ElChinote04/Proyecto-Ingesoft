import { useEffect, useRef, useState } from 'react';
import { api, descargar } from '../api/client';
import ConfirmarAccion from './ConfirmarAccion';
import { Feedback, Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';
import { formatTimestamp } from '../utils/format';

const MAX_ARCHIVOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONES = /\.(pdf|jpe?g|png)$/i;

const formatearTamano = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

function validarTitulo(titulo) {
  if (!titulo.trim()) return 'Ingresa el título de la evidencia.';
  if (titulo.trim().length > 120) return 'El título admite hasta 120 caracteres.';
  return '';
}

function validarArchivos(archivos, yaAdjuntos) {
  if (archivos.length + yaAdjuntos > MAX_ARCHIVOS)
    return `Puedes adjuntar hasta ${MAX_ARCHIVOS} archivos por evidencia.`;
  if (archivos.some(({ name }) => !EXTENSIONES.test(name)))
    return 'Solo se aceptan archivos PDF, JPG o PNG.';
  if (archivos.some(({ size }) => size > MAX_BYTES)) return 'Cada archivo puede pesar hasta 5 MB.';
  return '';
}

function CampoError({ id, children }) {
  if (!children) return null;
  return (
    <span id={id} className="field-error" role="alert">
      {children}
    </span>
  );
}

function FormularioEvidencia({ evidencia, notaId, onGuardada, onCancelar, onCambio }) {
  const [titulo, setTitulo] = useState(evidencia?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(evidencia?.descripcion ?? '');
  const [archivos, setArchivos] = useState([]);
  const [errores, setErrores] = useState({});
  const [fallo, setFallo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const selector = useRef(null);
  const yaAdjuntos = evidencia?.archivos.length ?? 0;
  const anotar = (campo, mensaje) => setErrores((actual) => ({ ...actual, [campo]: mensaje }));

  function elegirArchivos(evento) {
    const elegidos = [...evento.target.files];
    setArchivos(elegidos);
    anotar('archivos', validarArchivos(elegidos, yaAdjuntos));
    onCambio();
  }

  function validar() {
    const encontrados = {
      titulo: validarTitulo(titulo),
      descripcion:
        descripcion.trim() || archivos.length || yaAdjuntos
          ? ''
          : 'Describe la evidencia o adjunta al menos un archivo.',
      archivos: validarArchivos(archivos, yaAdjuntos),
    };
    setErrores(encontrados);
    return !Object.values(encontrados).some(Boolean);
  }

  async function registrar() {
    const datos = new FormData();
    datos.set('titulo', titulo.trim());
    if (descripcion.trim()) datos.set('descripcion', descripcion.trim());
    for (const archivo of archivos) datos.append('archivos', archivo);
    await api(`/calificaciones-competencias/${notaId}/evidencias`, { method: 'POST', body: datos });
  }

  async function actualizar() {
    await api(`/evidencias-calificaciones/${evidencia.id}`, {
      method: 'PATCH',
      body: { titulo: titulo.trim(), descripcion: descripcion.trim() || null },
    });
    if (!archivos.length) return;
    const datos = new FormData();
    for (const archivo of archivos) datos.append('archivos', archivo);
    await api(`/evidencias-calificaciones/${evidencia.id}/archivos`, {
      method: 'POST',
      body: datos,
    });
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (!validar()) return;
    setGuardando(true);
    setFallo(null);
    try {
      await (evidencia ? actualizar() : registrar());
      await onGuardada();
      setTitulo('');
      setDescripcion('');
      setArchivos([]);
      if (selector.current) selector.current.value = '';
    } catch (error) {
      setFallo(error);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="evidence-form" onSubmit={guardar} noValidate>
      <h3>{evidencia ? `Editar «${evidencia.titulo}»` : 'Registrar evidencia'}</h3>
      {fallo && <Feedback title={fallo.message} />}
      <label className="field">
        <span>Título *</span>
        <input
          value={titulo}
          maxLength={120}
          required
          aria-invalid={Boolean(errores.titulo)}
          aria-describedby={errores.titulo ? 'evidencia-titulo-error' : undefined}
          placeholder="Práctica 1"
          onChange={(evento) => {
            setTitulo(evento.target.value);
            onCambio();
          }}
          onBlur={() => anotar('titulo', validarTitulo(titulo))}
        />
        <CampoError id="evidencia-titulo-error">{errores.titulo}</CampoError>
      </label>
      <label className="field">
        <span>Descripción</span>
        <textarea
          rows={3}
          value={descripcion}
          maxLength={2000}
          aria-invalid={Boolean(errores.descripcion)}
          aria-describedby={errores.descripcion ? 'evidencia-descripcion-error' : undefined}
          onChange={(evento) => {
            setDescripcion(evento.target.value);
            anotar('descripcion', '');
            onCambio();
          }}
        />
        <CampoError id="evidencia-descripcion-error">{errores.descripcion}</CampoError>
      </label>
      <label className="field">
        <span>Archivos</span>
        <input
          ref={selector}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          aria-invalid={Boolean(errores.archivos)}
          aria-describedby="evidencia-archivos-ayuda"
          onChange={elegirArchivos}
        />
        <span id="evidencia-archivos-ayuda" className="caption">
          PDF, JPG o PNG, hasta 5 MB cada uno. Máximo {MAX_ARCHIVOS} por evidencia.
        </span>
        <CampoError id="evidencia-archivos-error">{errores.archivos}</CampoError>
      </label>
      {guardando && archivos.length > 0 && <progress aria-label="Subiendo archivos" />}
      <div className="actions">
        {evidencia && (
          <button type="button" className="secondary" disabled={guardando} onClick={onCancelar}>
            Cancelar edición
          </button>
        )}
        <button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : evidencia ? 'Guardar evidencia' : 'Registrar evidencia'}
        </button>
      </div>
    </form>
  );
}

function TarjetaEvidencia({ evidencia, editable, enEdicion, onEditar, onBaja, onQuitar, onError }) {
  return (
    <article className={evidencia.activo ? 'evidence-item' : 'evidence-item evidence-inactive'}>
      <div className="evidence-heading">
        <h3>{evidencia.titulo}</h3>
        {!evidencia.activo && <span className="badge neutral">Inactiva</span>}
      </div>
      <p className="caption">
        {formatTimestamp(evidencia.creadoEn)} · Registrada con nivel{' '}
        {evidencia.nivelLogroRegistrado}
      </p>
      {evidencia.descripcion && <p className="evidence-text">{evidencia.descripcion}</p>}
      {evidencia.archivos.length > 0 && (
        <ul className="evidence-files">
          {evidencia.archivos.map((archivo) => (
            <li key={archivo.id}>
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
                      `/evidencias-calificaciones/${evidencia.id}/archivos/${archivo.id}`,
                      archivo.nombre,
                    ).catch(onError)
                  }
                >
                  Descargar
                </button>
                {enEdicion && (
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Quitar ${archivo.nombre}`}
                    onClick={() => onQuitar(archivo)}
                  >
                    Quitar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable && evidencia.activo && !enEdicion && (
        <div className="row-actions">
          <button
            type="button"
            className="text-button"
            aria-label={`Editar ${evidencia.titulo}`}
            onClick={onEditar}
          >
            Editar
          </button>
          <button
            type="button"
            className="text-button"
            aria-label={`Dar de baja ${evidencia.titulo}`}
            onClick={onBaja}
          >
            Dar de baja
          </button>
        </div>
      )}
    </article>
  );
}

export default function EvidenciasCompetencia({ notaId, onClose }) {
  const dialogo = useRef(null);
  const ruta = `/calificaciones-competencias/${notaId}/evidencias`;
  const recurso = useResource(ruta);
  // Se recarga sobre lo ya mostrado: useResource vaciaría la vista y con ella el formulario abierto.
  const [recargado, setRecargado] = useState(null);
  const [edicionId, setEdicionId] = useState(null);
  const [sucio, setSucio] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);
  const [aviso, setAviso] = useState('');
  const [fallo, setFallo] = useState(null);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  const datos = recargado ?? recurso.data;
  const edicion = datos?.evidencias.find(({ id }) => id === edicionId) ?? null;
  const recargar = async () => setRecargado(await api(ruta));

  function salir() {
    if (sucio) setConfirmacion({ tipo: 'salir' });
    else onClose();
  }

  async function alGuardar() {
    await recargar();
    setAviso(edicion ? 'Evidencia actualizada.' : 'Evidencia registrada.');
    setEdicionId(null);
    setSucio(false);
    setFallo(null);
  }

  async function darDeBaja({ id }) {
    await api(`/evidencias-calificaciones/${id}`, { method: 'DELETE' });
    await recargar();
    setAviso('Evidencia dada de baja.');
    if (edicionId === id) setEdicionId(null);
  }

  async function quitarArchivo(evidencia, archivo) {
    await api(`/evidencias-calificaciones/${evidencia.id}/archivos/${archivo.id}`, {
      method: 'DELETE',
    });
    await recargar();
  }

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog grading-dialog evidence-dialog"
      aria-labelledby="evidencias-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        salir();
      }}
    >
      {recurso.loading && !datos ? (
        <Loading>Cargando evidencias…</Loading>
      ) : recurso.error && !datos ? (
        <ResourceError error={recurso.error} retry={recurso.retry} />
      ) : (
        <>
          <h2 id="evidencias-titulo">Evidencias de {datos.contexto.alumno.nombre}</h2>
          <p className="muted">
            {datos.contexto.curso.nombre} · {datos.contexto.competencia.codigo}{' '}
            {datos.contexto.competencia.nombre} · {datos.contexto.bimestre.nombre} · Nivel actual{' '}
            {datos.contexto.nivelActual}
          </p>
          {datos.publicado && (
            <Feedback intent="info" title="Libreta publicada">
              La libreta de este salón ya fue publicada: la evidencia está en modo consulta.
            </Feedback>
          )}
          {aviso && <Feedback intent="success" title={aviso} />}
          {fallo && <Feedback title={fallo.message} />}
          <div className="evidence-list">
            {datos.evidencias.length ? (
              datos.evidencias.map((evidencia) => (
                <TarjetaEvidencia
                  key={evidencia.id}
                  evidencia={evidencia}
                  editable={!datos.publicado}
                  enEdicion={evidencia.id === edicionId}
                  onEditar={() => {
                    setAviso('');
                    setSucio(false);
                    setEdicionId(evidencia.id);
                  }}
                  onBaja={() => setConfirmacion({ tipo: 'baja', evidencia })}
                  onQuitar={(archivo) => setConfirmacion({ tipo: 'archivo', evidencia, archivo })}
                  onError={setFallo}
                />
              ))
            ) : (
              <p className="muted">Esta nota todavía no tiene evidencias.</p>
            )}
          </div>
          {!datos.publicado && (
            <FormularioEvidencia
              key={edicionId ?? 'nueva'}
              evidencia={edicion}
              notaId={notaId}
              onGuardada={alGuardar}
              onCancelar={() => {
                setEdicionId(null);
                setSucio(false);
              }}
              onCambio={() => {
                setAviso('');
                setSucio(true);
              }}
            />
          )}
        </>
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={salir}>
          Cerrar
        </button>
      </div>
      {confirmacion?.tipo === 'salir' && (
        <ConfirmarAccion
          titulo="¿Descartar los cambios?"
          confirmar="Descartar"
          onConfirm={onClose}
          onClose={() => setConfirmacion(null)}
        >
          La evidencia que estabas escribiendo no se guardará.
        </ConfirmarAccion>
      )}
      {confirmacion?.tipo === 'baja' && (
        <ConfirmarAccion
          titulo={`¿Dar de baja «${confirmacion.evidencia.titulo}»?`}
          confirmar="Dar de baja"
          onConfirm={() => darDeBaja(confirmacion.evidencia)}
          onClose={() => setConfirmacion(null)}
        >
          Dejará de sustentar la nota y no se puede reactivar. Seguirá visible como inactiva.
        </ConfirmarAccion>
      )}
      {confirmacion?.tipo === 'archivo' && (
        <ConfirmarAccion
          titulo={`¿Quitar «${confirmacion.archivo.nombre}»?`}
          confirmar="Quitar archivo"
          onConfirm={() => quitarArchivo(confirmacion.evidencia, confirmacion.archivo)}
          onClose={() => setConfirmacion(null)}
        >
          El archivo dejará de estar disponible en esta evidencia.
        </ConfirmarAccion>
      )}
    </dialog>
  );
}
