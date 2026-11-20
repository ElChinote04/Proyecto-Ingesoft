import { Fragment, useState } from 'react';
import TablaDatos from './TablaDatos';
import CodigoSolicitud from './CodigoSolicitud';
import { Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';
import { filtroDelEnlace, formatTimestamp } from '../utils/format';

const RESULTADOS = {
  EXITO: ['Éxito', 'success'],
  DENEGADO: ['Denegado', 'danger'],
  FALLO: ['Fallido', 'warning'],
};
// El módulo de notas registra sus éxitos como 'EXITOSO'; se muestra igual que 'EXITO'.
const ETIQUETAS_RESULTADO = { ...RESULTADOS, EXITOSO: RESULTADOS.EXITO };
const SIN_FILTROS = { tipoEvento: '', resultado: '', desde: '', hasta: '' };
// Tarjetas del resumen, en el orden en que el backend devuelve los conteos.
const TARJETAS_RESUMEN = {
  LOGIN_FALLIDO: 'Logins fallidos',
  CUENTA_BLOQUEADA: 'Cuentas bloqueadas',
  ACCESO_DENEGADO: 'Accesos denegados',
  RESULTADO_EVALUACION_MODIFICADO: 'Notas modificadas',
  PAGO_ANULADO: 'Pagos anulados',
};
// Al llegar desde el log de errores, la tabla se abre filtrada por esa solicitud.
const focoDelEnlace = () => {
  const requestId = filtroDelEnlace('requestId');
  return requestId ? { etiqueta: `Solicitud ${requestId}`, filtros: { requestId } } : null;
};

const ETIQUETAS_CAMPO = {
  apoderadoId: 'Apoderado',
  estudianteId: 'Estudiante',
  competenciaId: 'Competencia',
  nivelLogro: 'Nivel de logro',
  conclusionDescriptiva: 'Conclusión descriptiva',
  identificador: 'Identificador',
  motivo: 'Motivo',
  intentosFallidos: 'Intentos fallidos',
  bloqueadoHasta: 'Bloqueada hasta',
  origen: 'Origen',
  ip: 'IP',
  ruta: 'Ruta',
  metodo: 'Método',
  sesionId: 'ID de sesión',
};
// Códigos que el backend guarda en el detalle; un valor sin traducción se muestra tal cual.
const ETIQUETAS_VALOR = {
  CREDENCIALES_INVALIDAS: 'Credenciales inválidas',
  CUENTA_BLOQUEADA: 'Cuenta bloqueada',
  CUENTA_INACTIVA: 'Cuenta inactiva',
  SIN_ROLES: 'Sin roles asignados',
};
const ES_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const etiquetaCampo = (campo) => {
  if (ETIQUETAS_CAMPO[campo]) return ETIQUETAS_CAMPO[campo];
  const texto = campo.replace(/([A-Z])/g, ' $1').toLowerCase();
  return texto[0].toUpperCase() + texto.slice(1);
};
const esObjeto = (valor) => valor !== null && typeof valor === 'object';
// Algunos eventos guardan un valor suelto, por ejemplo una condición de asistencia.
const comoCampos = (valor) => (esObjeto(valor) ? valor : valor == null ? {} : { valor });

function mostrarValor(valor, campo, nombres) {
  if (valor == null) return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (Array.isArray(valor) && !valor.some(esObjeto)) return valor.join(', ');
  if (esObjeto(valor)) return <ListaCampos datos={valor} nombres={nombres} />;
  if (Object.hasOwn(nombres, campo)) return nombres[campo][valor] ?? `#${valor}`;
  if (typeof valor === 'string' && ES_FECHA_HORA.test(valor)) return formatTimestamp(valor);
  return ETIQUETAS_VALOR[valor] ?? String(valor);
}

const esGrupo = (valor) => esObjeto(valor) && !Array.isArray(valor);

// Con "anterior" muestra lo que cambió como "B → A"; sin él, los datos sueltos primero y los
// agrupados (por ejemplo, el origen de la petición) después, cada grupo con su título.
function ListaCampos({ datos, anterior, nombres }) {
  const todos = [...new Set([...Object.keys(anterior ?? {}), ...Object.keys(datos)])];
  const grupos = anterior ? [] : todos.filter((campo) => esGrupo(datos[campo]));
  const campos = todos.filter((campo) => !grupos.includes(campo));
  return (
    <>
      {campos.length > 0 && (
        <dl className="auditoria-campos">
          {campos.map((campo) => {
            const cambio =
              anterior && JSON.stringify(anterior[campo]) !== JSON.stringify(datos[campo]);
            return (
              <Fragment key={campo}>
                <dt>{etiquetaCampo(campo)}</dt>
                <dd>
                  {cambio ? (
                    <>
                      <del className="valor-anterior">
                        {mostrarValor(anterior[campo], campo, nombres)}
                      </del>
                      {' → '}
                      <ins className="valor-nuevo">
                        {mostrarValor(datos[campo], campo, nombres)}
                      </ins>
                    </>
                  ) : (
                    mostrarValor(datos[campo], campo, nombres)
                  )}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      )}
      {grupos.map((campo) => (
        <section key={campo} className="auditoria-grupo">
          <h4>{etiquetaCampo(campo)}</h4>
          <ListaCampos datos={datos[campo]} nombres={nombres} />
        </section>
      ))}
    </>
  );
}

// Los cambios muestran el valor anterior y el nuevo; el resto, su detalle. El módulo de notas los
// guarda como valorAnterior/valorNuevo y el resto del sistema como anterior/nuevo.
function DetalleEvento({ detalle, nota, nombres }) {
  const anterior = detalle?.anterior ?? detalle?.valorAnterior;
  const nuevo = detalle?.nuevo ?? detalle?.valorNuevo;
  if (anterior !== undefined || nuevo !== undefined)
    return (
      <div className="auditoria-cambio">
        <ListaCampos
          datos={{ ...nota, ...comoCampos(nuevo) }}
          anterior={anterior == null ? undefined : { ...nota, ...comoCampos(anterior) }}
          nombres={nombres}
        />
        {detalle.motivo && <span>Motivo: {detalle.motivo}</span>}
      </div>
    );
  if (!esObjeto(detalle) || Object.keys(detalle).length === 0) return '—';
  return (
    <details>
      <summary>Ver detalle</summary>
      <div className="auditoria-detalle">
        <ListaCampos datos={detalle} nombres={nombres} />
      </div>
    </details>
  );
}

export default function ConsultaAuditoria() {
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  // Historial de una cuenta, de un registro o de una solicitud; se suma a los filtros de arriba.
  const [foco, setFoco] = useState(focoDelEnlace);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const consulta = new URLSearchParams({ pagina, limite });
  for (const [campo, valor] of Object.entries({ ...filtros, ...foco?.filtros }))
    if (valor) consulta.set(campo, valor);
  const eventos = useResource(`/admin/auditoria?${consulta}`);
  const datos = eventos.data;
  // El resumen solo cambia con el periodo; los demás filtros afectan a la tabla.
  const periodo = new URLSearchParams();
  for (const campo of ['desde', 'hasta']) if (filtros[campo]) periodo.set(campo, filtros[campo]);
  const resumen = useResource(`/admin/auditoria/resumen?${periodo}`);
  const cambiarFiltro = (campo) => (e) => {
    setFiltros({ ...filtros, [campo]: e.target.value });
    setPagina(1);
  };
  const enfocar = (etiqueta, filtrosFoco) => {
    setFoco({ etiqueta, filtros: filtrosFoco });
    setPagina(1);
  };
  const quitarFoco = () => {
    setFoco(null);
    setPagina(1);
    // Quita el filtro del enlace sin volver a montar la pantalla.
    window.history.replaceState(null, '', '#/admin/auditoria');
  };
  // Conserva el evento elegido aunque la lista aún se esté recargando.
  const tiposEvento = [...new Set([...(datos?.tiposEvento ?? []), filtros.tipoEvento])];

  return (
    <>
      <p className="muted">
        Registro inmutable de las operaciones del sistema, del más reciente al más antiguo. Horas de
        Lima.
      </p>
      <div className="auditoria-filtros">
        <label className="field">
          Tipo de evento
          <select value={filtros.tipoEvento} onChange={cambiarFiltro('tipoEvento')}>
            <option value="">Todos</option>
            {tiposEvento.filter(Boolean).map((tipo) => (
              <option key={tipo}>{tipo}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Resultado
          <select value={filtros.resultado} onChange={cambiarFiltro('resultado')}>
            <option value="">Todos</option>
            {Object.entries(RESULTADOS).map(([valor, [etiqueta]]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Desde
          <input type="date" value={filtros.desde} onChange={cambiarFiltro('desde')} />
        </label>
        <label className="field">
          Hasta
          <input type="date" value={filtros.hasta} onChange={cambiarFiltro('hasta')} />
        </label>
        <button
          className="secondary"
          onClick={() => {
            setFiltros(SIN_FILTROS);
            quitarFoco();
          }}
        >
          Limpiar filtros
        </button>
      </div>
      {resumen.data && (
        <section className="resumen-auditoria" aria-label="Resumen de seguridad">
          <h2>
            Resumen de seguridad{' '}
            <span className="muted">
              {filtros.desde || filtros.hasta ? 'del periodo elegido' : 'de todo el historial'}
            </span>
          </h2>
          <div className="resumen-tarjetas">
            {resumen.data.map(({ tipoEvento, total }) => {
              const activa = filtros.tipoEvento === tipoEvento;
              return (
                <button
                  key={tipoEvento}
                  type="button"
                  className={`resumen-tarjeta${activa ? ' activa' : ''}`}
                  aria-pressed={activa}
                  title={activa ? 'Quitar este filtro' : `Ver solo ${tipoEvento}`}
                  onClick={() => {
                    setFiltros({ ...filtros, tipoEvento: activa ? '' : tipoEvento });
                    setPagina(1);
                  }}
                >
                  <strong>{total}</strong>
                  <span>{TARJETAS_RESUMEN[tipoEvento] ?? tipoEvento}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {foco && (
        <p className="filtro-activo">
          Filtrando: <strong>{foco.etiqueta}</strong>
          <button type="button" className="enlace-tabla" onClick={quitarFoco}>
            ✕ Quitar
          </button>
        </p>
      )}
      {eventos.loading && <Loading>Cargando auditoría…</Loading>}
      {eventos.error && <ResourceError {...eventos} />}
      {datos && (
        <>
          <TablaDatos
            className="auditoria-tabla"
            columnas={[
              'Fecha y hora',
              'Usuario',
              'Evento',
              'Entidad',
              'Resultado',
              'Request ID',
              'Detalle',
            ]}
            filas={datos.registros.map((evento) => {
              const [etiqueta, color] = ETIQUETAS_RESULTADO[evento.resultado] ?? [
                evento.resultado,
                'info',
              ];
              return {
                id: evento.id,
                celdas: [
                  formatTimestamp(evento.fechaHora),
                  evento.usuarioId ? (
                    <button
                      key="usuario"
                      type="button"
                      className="enlace-tabla"
                      title="Ver todo lo que hizo esta cuenta"
                      onClick={() =>
                        enfocar(`Acciones de ${evento.usuario}`, { usuarioId: evento.usuarioId })
                      }
                    >
                      {evento.usuario}
                    </button>
                  ) : (
                    'Cuenta no identificada'
                  ),
                  evento.tipoEvento,
                  // Un intento con una cuenta inexistente queda con entidadId 0: no hay historial.
                  evento.entidadId > 0 ? (
                    <button
                      key="entidad"
                      type="button"
                      className="enlace-tabla"
                      title="Ver el historial de este registro"
                      onClick={() =>
                        enfocar(`Historial de ${evento.entidad} #${evento.entidadId}`, {
                          entidad: evento.entidad,
                          entidadId: evento.entidadId,
                        })
                      }
                    >
                      {evento.entidad} #{evento.entidadId}
                    </button>
                  ) : (
                    `${evento.entidad} #${evento.entidadId}`
                  ),
                  <span key="resultado" className={`badge ${color}`}>
                    {etiqueta}
                  </span>,
                  <CodigoSolicitud
                    key="solicitud"
                    requestId={evento.requestId}
                    enlace={
                      evento.tieneError && (
                        <a href={`#/errores?requestId=${encodeURIComponent(evento.requestId)}`}>
                          Ver error
                        </a>
                      )
                    }
                  />,
                  <DetalleEvento
                    key="detalle"
                    detalle={evento.detalle}
                    nota={evento.nota}
                    nombres={datos.nombres}
                  />,
                ],
              };
            })}
          />
          <div className="pagination">
            <label>
              Filas por página{' '}
              <select
                value={limite}
                onChange={(e) => {
                  setLimite(Number(e.target.value));
                  setPagina(1);
                }}
              >
                {[10, 25, 50].map((cantidad) => (
                  <option key={cantidad}>{cantidad}</option>
                ))}
              </select>
            </label>
            <span>
              Página {pagina} de {Math.max(1, Math.ceil(datos.total / limite))} · {datos.total}{' '}
              registros
            </span>
            <button
              className="secondary"
              disabled={pagina === 1}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </button>
            <button
              className="secondary"
              disabled={pagina * limite >= datos.total}
              onClick={() => setPagina(pagina + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </>
  );
}
