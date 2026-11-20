import { useEffect, useRef, useState } from 'react';
import { api, descargar } from '../api/client';
import CampoArchivos, { CampoError } from './CampoArchivos';
import { formatearTamano, validarArchivos } from '../utils/archivosAdjuntos';
import ConfirmarAccion from './ConfirmarAccion';
import { Feedback, Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';
import { MAX_ENLACES, TIPOS_ACTIVIDAD, etiquetaTipo } from '../utils/planTrabajo';
import { formatDate } from '../utils/format';

const ruta = (id) => `/evidencias-pedagogicas/${id}`;

function validarTitulo(titulo) {
  if (!titulo.trim()) return 'Ingresa el título de la actividad.';
  if (titulo.trim().length > 200) return 'El título admite hasta 200 caracteres.';
  return '';
}

const leerEnlaces = (texto) =>
  texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);

function validarEnlaces(enlaces) {
  if (enlaces.length > MAX_ENLACES) return `Puedes registrar hasta ${MAX_ENLACES} enlaces.`;
  const invalido = enlaces.find((enlace) => {
    try {
      return new URL(enlace).protocol !== 'https:';
    } catch {
      return true;
    }
  });
  return invalido ? `«${invalido}» no es una dirección https:// válida.` : '';
}

function ErrorServidor({ fallo }) {
  if (!fallo) return null;
  return (
    <Feedback title={fallo.message}>
      {Array.isArray(fallo.details) &&
        fallo.details.map((detalle) => (
          <p key={`${detalle.campo}-${detalle.mensaje}`}>{detalle.mensaje}</p>
        ))}
    </Feedback>
  );
}

function FormularioActividad({ actividad, plan, semanaInicial, onGuardada, onCambio }) {
  const [numeroSemana, setNumeroSemana] = useState(actividad?.numeroSemana ?? semanaInicial ?? 1);
  const [tipo, setTipo] = useState(actividad?.tipo ?? 'EXPOSICION');
  const [titulo, setTitulo] = useState(actividad?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(actividad?.descripcion ?? '');
  const [enlaces, setEnlaces] = useState((actividad?.enlaces ?? []).join('\n'));
  const [archivos, setArchivos] = useState([]);
  const [realizada, setRealizada] = useState(false);
  const [errores, setErrores] = useState({});
  const [fallo, setFallo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const selector = useRef(null);
  const yaAdjuntos = actividad?.archivos.length ?? 0;
  const yaRealizada = actividad?.estado === 'REALIZADA';
  const cambiar = (setter) => (evento) => {
    setter(evento.target.value);
    onCambio();
  };

  function validar() {
    const encontrados = {
      titulo: validarTitulo(titulo),
      enlaces: validarEnlaces(leerEnlaces(enlaces)),
      archivos: validarArchivos(archivos, yaAdjuntos, 'actividad'),
    };
    setErrores(encontrados);
    return !Object.values(encontrados).some(Boolean);
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (!validar()) return;
    // Datos, estado y archivos van en una sola petición: o se guarda todo o nada.
    const datos = new FormData();
    if (!actividad) datos.set('planId', String(plan.id));
    datos.set('numeroSemana', String(numeroSemana));
    datos.set('tipo', tipo);
    datos.set('titulo', titulo.trim());
    datos.set('descripcion', descripcion.trim());
    datos.set('enlaces', JSON.stringify(leerEnlaces(enlaces)));
    if (realizada) {
      if (actividad) datos.set('estado', 'REALIZADA');
      else datos.set('realizada', 'true');
    }
    for (const archivo of archivos) datos.append('archivos', archivo);
    setGuardando(true);
    setFallo(null);
    try {
      await api(actividad ? ruta(actividad.id) : '/evidencias-pedagogicas', {
        method: actividad ? 'PATCH' : 'POST',
        body: datos,
      });
      await onGuardada(actividad ? 'Actividad actualizada.' : 'Actividad registrada.');
    } catch (error) {
      // El formulario queda abierto y con lo escrito para corregir y reintentar.
      setFallo(error);
      setGuardando(false);
    }
  }

  return (
    <form className="evidence-form actividad-form" onSubmit={guardar} noValidate>
      <ErrorServidor fallo={fallo} />
      <div className="actividad-form-fila">
        <label className="field">
          <span>Semana *</span>
          <select
            value={numeroSemana}
            onChange={cambiar((valor) => setNumeroSemana(Number(valor)))}
          >
            {Array.from({ length: plan.bimestre.semanas }, (_, indice) => (
              <option key={indice + 1} value={indice + 1}>
                Semana {indice + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tipo *</span>
          <select value={tipo} onChange={cambiar(setTipo)}>
            {TIPOS_ACTIVIDAD.map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Título *</span>
        <input
          value={titulo}
          maxLength={200}
          required
          aria-invalid={Boolean(errores.titulo)}
          aria-describedby={errores.titulo ? 'actividad-titulo-error' : undefined}
          placeholder="Exposición sobre fracciones"
          onChange={cambiar(setTitulo)}
          onBlur={() => setErrores((actual) => ({ ...actual, titulo: validarTitulo(titulo) }))}
        />
        <CampoError id="actividad-titulo-error">{errores.titulo}</CampoError>
      </label>
      <label className="field">
        <span>Descripción</span>
        <textarea
          rows={3}
          value={descripcion}
          maxLength={2000}
          onChange={cambiar(setDescripcion)}
        />
      </label>
      <label className="field">
        <span>Enlaces</span>
        <textarea
          rows={2}
          value={enlaces}
          placeholder="https://… (uno por línea)"
          aria-invalid={Boolean(errores.enlaces)}
          aria-describedby="actividad-enlaces-ayuda"
          onChange={(evento) => {
            setEnlaces(evento.target.value);
            setErrores((actual) => ({ ...actual, enlaces: '' }));
            onCambio();
          }}
        />
        <span id="actividad-enlaces-ayuda" className="caption">
          Videos o materiales en línea, hasta {MAX_ENLACES}. Deben empezar con https://.
        </span>
        <CampoError id="actividad-enlaces-error">{errores.enlaces}</CampoError>
      </label>
      <CampoArchivos
        id="actividad-archivos"
        selector={selector}
        error={errores.archivos}
        unidad="actividad"
        onChange={(evento) => {
          const elegidos = [...evento.target.files];
          setArchivos(elegidos);
          setErrores((actual) => ({
            ...actual,
            archivos: validarArchivos(elegidos, yaAdjuntos, 'actividad'),
          }));
          onCambio();
        }}
      />
      {!yaRealizada && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={realizada}
            onChange={(evento) => {
              setRealizada(evento.target.checked);
              onCambio();
            }}
          />
          {actividad ? 'Marcar como realizada (hoy)' : 'Ya se realizó (hoy)'}
        </label>
      )}
      {guardando && archivos.length > 0 && <progress aria-label="Subiendo archivos" />}
      <div className="actions">
        <button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : actividad ? 'Guardar cambios' : 'Registrar actividad'}
        </button>
      </div>
    </form>
  );
}

function DetalleActividad({ actividad, modo, editable, onQuitar, onError }) {
  return (
    <div className="actividad-detalle">
      <p className="actividad-etiquetas">
        <span className="badge neutral">{etiquetaTipo(actividad.tipo)}</span>
        <span className="badge neutral">Semana {actividad.numeroSemana}</span>
        {actividad.fechaRealizacion ? (
          <span className="badge info">Realizada el {formatDate(actividad.fechaRealizacion)}</span>
        ) : (
          <span className="badge neutral">Planificada</span>
        )}
      </p>
      {modo !== 'familia' && actividad.estadoRevision === 'OBSERVADA' && (
        <Feedback intent="warning" title="Observada por la coordinación">
          {actividad.observacionesRevision}
        </Feedback>
      )}
      {modo !== 'familia' && actividad.estadoRevision === 'VALIDADA' && (
        <Feedback intent="success" title="Validada por la coordinación">
          {actividad.observacionesRevision}
        </Feedback>
      )}
      {actividad.descripcion && <p className="evidence-text">{actividad.descripcion}</p>}
      {actividad.enlaces.length > 0 && (
        <ul className="evidence-files">
          {actividad.enlaces.map((enlace) => (
            <li key={enlace}>
              <a href={enlace} target="_blank" rel="noopener noreferrer">
                {enlace}
              </a>
            </li>
          ))}
        </ul>
      )}
      {actividad.archivos.length > 0 && (
        <ul className="evidence-files">
          {actividad.archivos.map((archivo) => (
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
                    descargar(`${ruta(actividad.id)}/archivos/${archivo.id}`, archivo.nombre).catch(
                      onError,
                    )
                  }
                >
                  Descargar
                </button>
                {editable && (
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
    </div>
  );
}

function FormularioRevision({ actividad, onRevisada }) {
  const [estadoRevision, setEstadoRevision] = useState('VALIDADA');
  const [observaciones, setObservaciones] = useState('');
  const [fallo, setFallo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const faltaObservacion = estadoRevision === 'OBSERVADA' && !observaciones.trim();

  async function revisar(evento) {
    evento.preventDefault();
    if (faltaObservacion) return;
    setGuardando(true);
    setFallo(null);
    try {
      await api(`${ruta(actividad.id)}/revision`, {
        method: 'PUT',
        body: { estadoRevision, observacionesRevision: observaciones.trim() || undefined },
      });
      await onRevisada(
        estadoRevision === 'VALIDADA' ? 'Actividad validada.' : 'Actividad observada.',
      );
    } catch (error) {
      setFallo(error);
      setGuardando(false);
    }
  }

  return (
    <form className="evidence-form" onSubmit={revisar} noValidate>
      <h3>Revisar actividad</h3>
      <ErrorServidor fallo={fallo} />
      <fieldset className="actividad-revision">
        <legend className="sr-only">Resultado de la revisión</legend>
        {[
          ['VALIDADA', 'Validar'],
          ['OBSERVADA', 'Observar'],
        ].map(([valor, etiqueta]) => (
          <label key={valor} className="checkbox-field">
            <input
              type="radio"
              name="estadoRevision"
              value={valor}
              checked={estadoRevision === valor}
              onChange={() => setEstadoRevision(valor)}
            />
            {etiqueta}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Observaciones{estadoRevision === 'OBSERVADA' && ' *'}</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={observaciones}
          aria-invalid={faltaObservacion}
          onChange={(evento) => setObservaciones(evento.target.value)}
        />
        {faltaObservacion && <span className="caption">Explica qué debe corregir el docente.</span>}
      </label>
      <div className="actions">
        <button type="submit" disabled={guardando || faltaObservacion}>
          {guardando ? 'Guardando…' : 'Guardar revisión'}
        </button>
      </div>
    </form>
  );
}

/**
 * Modal de una actividad del plan de trabajo.
 * - docente: alta y edición (si el plan se puede editar y la actividad no está validada).
 * - admin: consulta y revisión de lo realizado.
 * - familia: solo consulta, con la salida mínima del servidor.
 */
export default function ActividadModal({
  modo,
  actividadId,
  plan,
  semanaInicial,
  onClose,
  onCambio,
}) {
  const dialogo = useRef(null);
  const recurso = useResource(actividadId ? ruta(actividadId) : null);
  // Se recarga sobre lo ya mostrado para no vaciar el formulario abierto.
  const [recargada, setRecargada] = useState(null);
  const [sucio, setSucio] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);
  const [aviso, setAviso] = useState('');
  const [fallo, setFallo] = useState(null);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  const actividad = recargada ?? recurso.data;
  const editable =
    modo === 'docente' && plan.puedeEditar && actividad?.estadoRevision !== 'VALIDADA';
  const titulo = actividadId ? (actividad?.titulo ?? 'Actividad') : 'Nueva actividad';

  function salir() {
    if (sucio) setConfirmacion({ tipo: 'salir' });
    else onClose();
  }

  async function quitarArchivo(archivo) {
    await api(`${ruta(actividad.id)}/archivos/${archivo.id}`, { method: 'DELETE' });
    setRecargada(await api(ruta(actividad.id)));
    setAviso('Archivo retirado.');
    onCambio({ cerrar: false });
  }

  async function darDeBaja() {
    await api(ruta(actividad.id), { method: 'DELETE' });
    onCambio({ cerrar: true, aviso: 'Actividad dada de baja.' });
  }

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog grading-dialog evidence-dialog"
      aria-labelledby="actividad-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        salir();
      }}
    >
      <h2 id="actividad-titulo">{titulo}</h2>
      {actividadId && recurso.loading && !actividad && <Loading>Cargando actividad…</Loading>}
      {actividadId && recurso.error && !actividad && (
        <ResourceError error={recurso.error} retry={recurso.retry} />
      )}
      {aviso && <Feedback intent="success" title={aviso} />}
      {fallo && <Feedback title={fallo.message} />}
      {actividad && (
        <DetalleActividad
          actividad={actividad}
          modo={modo}
          editable={editable}
          onQuitar={(archivo) => setConfirmacion({ tipo: 'archivo', archivo })}
          onError={setFallo}
        />
      )}
      {modo === 'docente' && actividadId && actividad && !editable && (
        <p className="muted">
          {actividad.estadoRevision === 'VALIDADA'
            ? 'La coordinación validó esta actividad: queda en solo lectura.'
            : 'El bimestre ya terminó: el plan queda en solo lectura.'}
        </p>
      )}
      {modo === 'docente' && (!actividadId || (actividad && editable)) && (
        <FormularioActividad
          key={actividad?.id ?? 'nueva'}
          actividad={actividad}
          plan={plan}
          semanaInicial={semanaInicial}
          onCambio={() => {
            setAviso('');
            setSucio(true);
          }}
          onGuardada={(mensaje) => onCambio({ cerrar: true, aviso: mensaje })}
        />
      )}
      {modo === 'admin' && actividad?.estado === 'REALIZADA' && (
        <FormularioRevision
          actividad={actividad}
          onRevisada={(mensaje) => onCambio({ cerrar: true, aviso: mensaje })}
        />
      )}
      <div className="actions">
        {editable && actividad && (
          <button
            type="button"
            className="destructive"
            onClick={() => setConfirmacion({ tipo: 'baja' })}
          >
            Dar de baja
          </button>
        )}
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
          Lo que escribiste en esta actividad no se guardará.
        </ConfirmarAccion>
      )}
      {confirmacion?.tipo === 'baja' && (
        <ConfirmarAccion
          titulo={`¿Dar de baja «${actividad.titulo}»?`}
          confirmar="Dar de baja"
          onConfirm={darDeBaja}
          onClose={() => setConfirmacion(null)}
        >
          La actividad dejará de aparecer en el plan de trabajo.
        </ConfirmarAccion>
      )}
      {confirmacion?.tipo === 'archivo' && (
        <ConfirmarAccion
          titulo={`¿Quitar «${confirmacion.archivo.nombre}»?`}
          confirmar="Quitar archivo"
          onConfirm={() => quitarArchivo(confirmacion.archivo)}
          onClose={() => setConfirmacion(null)}
        >
          El archivo dejará de estar disponible en esta actividad.
        </ConfirmarAccion>
      )}
    </dialog>
  );
}
