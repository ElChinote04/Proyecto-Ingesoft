import { useState } from 'react';
import { api } from '../api/client';
import ConfirmarAccion from './ConfirmarAccion';
import { Feedback, Loading, ResourceError } from './Feedback';
import TablaDatos from './TablaDatos';
import { useResource } from '../hooks/useResource';
import { formatTimestamp } from '../utils/format';

const ESTADOS = {
  PUBLICADA: ['Publicada', 'success'],
  LISTA: ['Lista', 'info'],
  CON_PENDIENTES: ['Con pendientes', 'warning'],
  SIN_DATOS: ['Sin datos', 'neutral'],
};

const RAZONES = {
  CON_PENDIENTES: 'ya tiene pendientes',
  YA_PUBLICADA: 'ya estaba publicada',
  SIN_DATOS: 'no tiene competencias que evaluar',
  OTRO_ANIO_ACADEMICO: 'es de otro año académico',
  NO_ENCONTRADA: 'ya no existe',
};

const AVISO_PUBLICAR =
  'Los docentes ya no podrán cambiar notas ni evidencia. Esta acción no se puede deshacer.';

function PendientesSeccion({ seccion, onClose }) {
  return (
    <div className="card publication-detail">
      <div className="publication-detail-heading">
        <h3>Pendientes de {seccion.nombre}</h3>
        <button type="button" className="text-button" onClick={onClose}>
          Ocultar
        </button>
      </div>
      <TablaDatos
        columnas={['Curso', 'Responsable', 'Sin nota', 'Sin evidencia']}
        filas={seccion.pendientes.map((pendiente) => ({
          id: pendiente.curso,
          celdas: [
            pendiente.curso,
            pendiente.sinRegla ? 'Administrador: sin regla de consolidación' : pendiente.docente,
            pendiente.sinNota,
            pendiente.sinEvidencia,
          ],
        }))}
      />
    </div>
  );
}

function ResultadoMasivo({ resultado }) {
  const { publicadas, omitidas } = resultado;
  return (
    <>
      {publicadas.length > 0 && (
        <Feedback intent="success" title={`Secciones publicadas: ${publicadas.length}`}>
          {publicadas.map(({ nombre }) => nombre).join(', ')}.
        </Feedback>
      )}
      {omitidas.length > 0 && (
        <Feedback intent="warning" title="Algunas secciones no se publicaron">
          {omitidas
            .map(({ id, nombre, razon }) => `${nombre ?? `Sección ${id}`}: ${RAZONES[razon]}`)
            .join('. ')}
          .
        </Feedback>
      )}
    </>
  );
}

function EstadoBimestre({ bimestreId }) {
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [detalleId, setDetalleId] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [fallo, setFallo] = useState(null);
  const ruta = `/calificaciones/bimestres/${bimestreId}`;
  const estado = useResource(`${ruta}/publicacion?${new URLSearchParams({ pagina, limite })}`);

  if (estado.loading) return <Loading>Cargando secciones…</Loading>;
  if (estado.error) return <ResourceError error={estado.error} retry={estado.retry} />;

  const { resumen, secciones, seccionesListas, paginacion } = estado.data;
  const paginas = Math.max(1, Math.ceil(paginacion.total / limite));
  const detalle = secciones.find(({ id }) => id === detalleId);

  async function publicarSeccion(seccion) {
    try {
      await api(`${ruta}/secciones/${seccion.id}/publicacion`, { method: 'POST' });
      setResultado({ publicadas: [seccion], omitidas: [] });
    } catch (error) {
      setFallo(error);
    } finally {
      estado.retry();
    }
  }

  async function publicarListas() {
    try {
      setResultado(
        await api(`${ruta}/publicacion`, {
          method: 'POST',
          body: { seccionIds: seccionesListas.map(({ id }) => id) },
        }),
      );
    } catch (error) {
      setFallo(error);
    } finally {
      estado.retry();
    }
  }

  function accion(seccion) {
    if (seccion.estado === 'LISTA')
      return (
        <button
          key="accion"
          type="button"
          className="secondary"
          aria-label={`Publicar ${seccion.nombre}`}
          onClick={() => {
            setResultado(null);
            setFallo(null);
            setConfirmacion(seccion);
          }}
        >
          Publicar
        </button>
      );
    if (seccion.estado === 'CON_PENDIENTES')
      return (
        <button
          key="accion"
          type="button"
          className="secondary"
          aria-label={`Ver pendientes de ${seccion.nombre}`}
          aria-expanded={detalleId === seccion.id}
          onClick={() => setDetalleId(seccion.id)}
        >
          Ver pendientes
        </button>
      );
    if (seccion.publicadoEn)
      return (
        <span key="accion" className="caption">
          {formatTimestamp(seccion.publicadoEn)}
        </span>
      );
    return null;
  }

  return (
    <>
      <div className="publication-summary">
        <p className="muted" aria-live="polite">
          Publicadas: {resumen.publicadas} · Listas: {resumen.listas} · Con pendientes:{' '}
          {resumen.conPendientes}
        </p>
        <button
          type="button"
          disabled={!seccionesListas.length}
          onClick={() => {
            setResultado(null);
            setFallo(null);
            setConfirmacion({ masiva: true });
          }}
        >
          Publicar secciones listas ({seccionesListas.length})
        </button>
      </div>
      {resultado && <ResultadoMasivo resultado={resultado} />}
      {fallo && <Feedback title={fallo.message} />}
      <TablaDatos
        columnas={['Sección', 'Avance', 'Estado', 'Acción']}
        vacio="No hay secciones en este año académico."
        filas={secciones.map((seccion) => {
          const [etiqueta, color] = ESTADOS[seccion.estado];
          return {
            id: seccion.id,
            celdas: [
              seccion.nombre,
              `${seccion.totalCompleto} de ${seccion.totalEsperado}`,
              <span key="estado" className={`badge ${color}`}>
                {etiqueta}
              </span>,
              accion(seccion),
            ],
          };
        })}
      />
      <div className="pagination">
        <label>
          Filas por página{' '}
          <select
            value={limite}
            onChange={(evento) => {
              setLimite(Number(evento.target.value));
              setPagina(1);
            }}
          >
            {[10, 25, 50].map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
        </label>
        <span>
          Página {paginacion.pagina} de {paginas} · {paginacion.total} secciones
        </span>
        <div className="row-actions">
          <button
            type="button"
            className="secondary"
            disabled={pagina <= 1}
            onClick={() => setPagina(pagina - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            className="secondary"
            disabled={pagina >= paginas}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
      {detalle?.pendientes.length > 0 && (
        <PendientesSeccion seccion={detalle} onClose={() => setDetalleId(null)} />
      )}
      {confirmacion?.masiva && (
        <ConfirmarAccion
          titulo={`¿Publicar ${seccionesListas.length} ${seccionesListas.length === 1 ? 'sección' : 'secciones'}?`}
          confirmar="Publicar secciones"
          onConfirm={publicarListas}
          onClose={() => setConfirmacion(null)}
        >
          {seccionesListas.map(({ nombre }) => nombre).join(', ')}. Sus alumnos y apoderados verán
          la libreta. {AVISO_PUBLICAR}
        </ConfirmarAccion>
      )}
      {confirmacion?.id && (
        <ConfirmarAccion
          titulo={`¿Publicar ${confirmacion.nombre}?`}
          confirmar="Publicar"
          onConfirm={() => publicarSeccion(confirmacion)}
          onClose={() => setConfirmacion(null)}
        >
          Los alumnos y apoderados de {confirmacion.nombre} verán su libreta. {AVISO_PUBLICAR}
        </ConfirmarAccion>
      )}
    </>
  );
}

export default function PublicacionLibretas() {
  const bimestres = useResource('/bimestres');
  const [bimestreElegido, setBimestreElegido] = useState('');
  const bimestreId = bimestreElegido || bimestres.data?.[0]?.id;

  return (
    <section className="publication-section" aria-labelledby="publicacion-titulo">
      <h2 id="publicacion-titulo">Publicación de libretas</h2>
      <p className="muted">
        Una sección se publica cuando todas sus competencias tienen nota y evidencia.
      </p>
      {bimestres.loading ? (
        <Loading>Cargando bimestres…</Loading>
      ) : bimestres.error ? (
        <ResourceError error={bimestres.error} retry={bimestres.retry} />
      ) : !bimestreId ? (
        <Feedback intent="info" title="Sin bimestres activos">
          El año académico activo todavía no tiene bimestres configurados.
        </Feedback>
      ) : (
        <>
          <label className="field publication-term">
            Bimestre
            <select
              value={bimestreId}
              onChange={(evento) => setBimestreElegido(Number(evento.target.value))}
            >
              {bimestres.data.map((bimestre) => (
                <option key={bimestre.id} value={bimestre.id}>
                  {bimestre.nombre}
                </option>
              ))}
            </select>
          </label>
          <EstadoBimestre key={bimestreId} bimestreId={bimestreId} />
        </>
      )}
    </section>
  );
}
