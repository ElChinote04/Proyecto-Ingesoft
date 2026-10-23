import { useEffect, useRef, useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import TablaDatos from '../components/TablaDatos';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useResource } from '../hooks/useResource';

// MOROSA no es un estado almacenado: el servidor lo deriva de la fecha de
// vencimiento al consultar. Aquí solo se traduce a una etiqueta.
const ESTADOS = {
  PENDIENTE: { etiqueta: 'Pendiente', clase: 'warning' },
  MOROSA: { etiqueta: 'Morosa', clase: 'danger' },
  PAGADA: { etiqueta: 'Pagada', clase: 'success' },
  ANULADA: { etiqueta: 'Anulada', clase: 'info' },
};
const PAGABLES = ['PENDIENTE', 'MOROSA'];
const TOPE_RESUMEN = 100;

const soles = (monto) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(monto));

const fechaCorta = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// pagadaEn es un instante UTC: se muestra en la hora de Lima para que un pago
// hecho de noche no aparezca con la fecha del día siguiente.
const fechaDeInstante = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  });

// El concepto guardado ya lleva el periodo («Pensión 2026-10»), que la tabla
// muestra en su propia columna.
const conceptoDe = (boleta) =>
  `${boleta.concepto.replace(` ${boleta.periodo}`, '')} · cuota ${boleta.numeroCuota}`;

function periodoLargo(periodo) {
  const [anio, mes] = periodo.split('-');
  const nombre = new Date(Number(anio), Number(mes) - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
  });
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

const nombreDe = (estudiante) => `${estudiante.nombres} ${estudiante.apellidos}`;

/**
 * US-007B pide mostrar alumno, concepto, monto, vencimiento y estado antes de
 * iniciar el pago. Mientras se crea la operación el diálogo no se puede cerrar
 * ni volver a enviar.
 */
function ConfirmarPago({ boleta, iniciando, error, onConfirm, onClose }) {
  const dialogo = useRef(null);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);
  const estilo = ESTADOS[boleta.estado];
  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog"
      aria-labelledby="pagar-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!iniciando) onClose();
      }}
    >
      <h2 id="pagar-titulo">Confirmar pago</h2>
      <dl className="pago-detalle">
        <dt>Alumno</dt>
        <dd>{nombreDe(boleta.estudiante)}</dd>
        <dt>Concepto</dt>
        <dd>
          {conceptoDe(boleta)} · {periodoLargo(boleta.periodo)}
        </dd>
        <dt>Vence</dt>
        <dd>{fechaCorta(boleta.fechaVencimiento)}</dd>
        <dt>Estado</dt>
        <dd>
          <span className={`badge ${estilo.clase}`}>{estilo.etiqueta}</span>
        </dd>
        <dt>Monto</dt>
        <dd>
          <strong>{soles(boleta.monto)}</strong>
        </dd>
      </dl>
      <p className="caption">
        Te llevaremos a la página segura de la pasarela para completar el pago. La boleta no
        cambiará de estado hasta que la pasarela confirme el cobro.
      </p>
      {error && <Feedback title="No pudimos iniciar el pago">{error}</Feedback>}
      <div className="actions">
        <button className="secondary" disabled={iniciando} onClick={onClose}>
          Cancelar
        </button>
        <button disabled={iniciando} onClick={onConfirm}>
          {iniciando ? 'Redirigiendo…' : `Pagar ${soles(boleta.monto)}`}
        </button>
      </div>
    </dialog>
  );
}

function Resumen({ boletas, parcial, administrador }) {
  const pendientes = boletas.filter((boleta) => PAGABLES.includes(boleta.estado));
  const vencidas = pendientes.filter((boleta) => boleta.estado === 'MOROSA');
  const deuda = pendientes.reduce((suma, boleta) => suma + Number(boleta.monto), 0);
  const proxima = pendientes
    .filter((boleta) => boleta.estado === 'PENDIENTE')
    .map((boleta) => boleta.fechaVencimiento)
    .sort()[0];
  return (
    <section className="portal-summary" aria-label="Resumen de pagos">
      <article className="card portal-summary-card">
        <p className="muted">{administrador ? 'Por cobrar' : 'Saldo pendiente'}</p>
        <strong>{soles(deuda)}</strong>
        <p className="caption">
          {pendientes.length === 1
            ? '1 boleta por pagar'
            : `${pendientes.length} boletas por pagar`}
          {parcial && ` (sobre las primeras ${TOPE_RESUMEN})`}
        </p>
      </article>
      <article className={`card portal-summary-card ${vencidas.length ? '' : 'horario-tone-1'}`}>
        <p className="muted">Boletas morosas</p>
        <strong>{vencidas.length}</strong>
        <p className="caption">
          {administrador
            ? 'Boletas vencidas sin pago.'
            : vencidas.length
              ? 'Regulariza su pago para evitar recargos.'
              : 'No tienes boletas morosas.'}
        </p>
      </article>
      <article className="card portal-summary-card horario-tone-0">
        <p className="muted">Próximo vencimiento</p>
        <strong>{proxima ? fechaCorta(proxima) : 'Sin cuotas próximas'}</strong>
        <p className="caption">
          {proxima
            ? 'Fecha límite de la siguiente cuota.'
            : administrador
              ? 'No quedan cuotas por vencer.'
              : 'Estás al día con el cronograma.'}
        </p>
      </article>
    </section>
  );
}

export default function Pagos() {
  const { user } = useAuth();
  const [estudianteId, setEstudianteId] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [porPagar, setPorPagar] = useState(null);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState('');
  // El administrador consulta los cronogramas emitidos (US-006) sin poder
  // pagarlos: el pago solo lo inicia el apoderado a cargo del estudiante.
  const puedePagar = user.roles.includes('APODERADO');

  // Dos consultas distintas a propósito: la tabla pagina en el servidor y el
  // resumen necesita el total del año, no la página que se esté viendo.
  const resumen = useResource(`/compromisos-pago?limite=${TOPE_RESUMEN}`);
  const consulta = [
    `pagina=${pagina}`,
    `limite=${limite}`,
    estudianteId && `estudianteId=${estudianteId}`,
    estado && `estado=${estado}`,
  ]
    .filter(Boolean)
    .join('&');
  const listado = useResource(`/compromisos-pago?${consulta}`);

  function abrirPago(boleta) {
    setError('');
    setPorPagar(boleta);
  }

  async function pagar(boleta) {
    setIniciando(true);
    setError('');
    try {
      const pago = await api('/pagos', { method: 'POST', body: { compromisoPagoId: boleta.id } });
      // El enlace de checkout no se guarda en la base: queda en la pestaña para
      // poder retomarlo si el apoderado vuelve sin haber pagado.
      try {
        sessionStorage.setItem(
          `sage:checkout:${pago.pagoId}`,
          JSON.stringify({
            url: pago.urlCheckout,
            simulado: pago.urlCheckout.includes('simulado='),
          }),
        );
      } catch {
        // Sin sessionStorage el flujo sigue funcionando; solo se pierde el
        // enlace para retomar un pago abandonado.
      }
      window.location.assign(pago.urlCheckout);
    } catch (fallo) {
      setError(fallo.message);
      setIniciando(false);
      // La boleta pudo cambiar mientras tanto (pagada en otra pestaña o con un
      // intento ya abierto): se recarga para mostrar la acción que corresponde.
      if (fallo.status === 409) {
        resumen.retry();
        listado.retry();
      }
    }
  }

  const todas = resumen.data?.boletas ?? [];
  const estudiantes = [...new Map(todas.map((b) => [b.estudiante.id, b.estudiante])).values()].sort(
    (a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'),
  );
  const delEstudiante = estudianteId
    ? todas.filter((b) => String(b.estudiante.id) === String(estudianteId))
    : todas;

  function cambiarFiltro(aplicar) {
    aplicar();
    setPagina(1);
  }

  return (
    <AppLayout section="Pagos" step="Pagos y boletas">
      <div className="page-heading portal-heading">
        <div>
          <h1>Pagos y boletas</h1>
          <p className="muted">
            {puedePagar
              ? 'Consulta el cronograma de pensiones de tus estudiantes y paga en línea.'
              : 'Consulta los cronogramas de pensiones emitidos y el estado de cada boleta.'}
          </p>
        </div>
        {puedePagar && <span className="badge success">Pago seguro</span>}
      </div>

      {porPagar && (
        <ConfirmarPago
          boleta={porPagar}
          iniciando={iniciando}
          error={error}
          onConfirm={() => pagar(porPagar)}
          onClose={() => setPorPagar(null)}
        />
      )}

      {resumen.loading && <Loading>Cargando tus boletas…</Loading>}
      {resumen.error && <ResourceError {...resumen} />}

      {resumen.data && !todas.length && (
        <Feedback intent="info">
          {puedePagar
            ? 'Todavía no hay boletas emitidas a tu nombre. Se generan al matricular al estudiante; si crees que falta alguna, comunícate con la administración.'
            : 'Todavía no se ha emitido ningún compromiso de pago. Se emiten desde Alumnos y matrículas.'}
        </Feedback>
      )}

      {resumen.data && todas.length > 0 && (
        <>
          <Resumen
            boletas={delEstudiante}
            parcial={resumen.data.total > todas.length}
            administrador={!puedePagar}
          />

          <div className="pagos-filtros">
            {estudiantes.length > 1 && (
              <label className="field">
                Estudiante
                <select
                  value={estudianteId}
                  onChange={(e) => cambiarFiltro(() => setEstudianteId(e.target.value))}
                >
                  <option value="">Todos</option>
                  {estudiantes.map((estudiante) => (
                    <option key={estudiante.id} value={estudiante.id}>
                      {nombreDe(estudiante)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Estado
              <select
                value={estado}
                onChange={(e) => cambiarFiltro(() => setEstado(e.target.value))}
              >
                <option value="">Todos</option>
                {Object.entries(ESTADOS).map(([clave, { etiqueta }]) => (
                  <option key={clave} value={clave}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="portal-historial">
            <h2>Historial de boletas</h2>
            {listado.loading && <Loading>Cargando boletas…</Loading>}
            {listado.error && <ResourceError {...listado} />}
            {listado.data && (
              <>
                <TablaDatos
                  className="tabla-apilable"
                  columnas={[
                    'Periodo',
                    'Concepto',
                    'Estudiante',
                    'Vence',
                    'Monto',
                    'Estado',
                    'Acción',
                  ]}
                  filas={listado.data.boletas.map((boleta) => {
                    const estilo = ESTADOS[boleta.estado] ?? { etiqueta: boleta.estado, clase: '' };
                    return {
                      id: boleta.id,
                      celdas: [
                        periodoLargo(boleta.periodo),
                        conceptoDe(boleta),
                        nombreDe(boleta.estudiante),
                        fechaCorta(boleta.fechaVencimiento),
                        soles(boleta.monto),
                        <span key="estado" className={`badge ${estilo.clase}`}>
                          {estilo.etiqueta}
                        </span>,
                        boleta.pagadaEn ? (
                          <span key="pagada" className="muted">
                            Pagada el {fechaDeInstante(boleta.pagadaEn)}
                          </span>
                        ) : PAGABLES.includes(boleta.estado) && boleta.pagoEnCursoId ? (
                          // Un intento abierto bloquea un pago nuevo (409); se
                          // ofrece retomarlo o cancelarlo desde su pantalla.
                          <a
                            key="en-curso"
                            href={`#/pagos/${boleta.pagoEnCursoId}/cancelado`}
                            className="pago-en-curso"
                          >
                            Pago en proceso · ver
                          </a>
                        ) : PAGABLES.includes(boleta.estado) && puedePagar ? (
                          <button key="pagar" onClick={() => abrirPago(boleta)}>
                            Pagar
                          </button>
                        ) : (
                          <span key="sin-accion" className="muted">
                            —
                          </span>
                        ),
                      ],
                    };
                  })}
                  vacio="No hay boletas que coincidan con el filtro."
                />
                <div className="pagination">
                  <label>
                    Filas por página{' '}
                    <select
                      value={limite}
                      onChange={(e) => cambiarFiltro(() => setLimite(Number(e.target.value)))}
                    >
                      {[10, 25, 50].map((cantidad) => (
                        <option key={cantidad}>{cantidad}</option>
                      ))}
                    </select>
                  </label>
                  <span>
                    Página {pagina} de {Math.max(1, Math.ceil(listado.data.total / limite))}
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
                    disabled={pagina * limite >= listado.data.total}
                    onClick={() => setPagina(pagina + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </>
            )}
          </section>

          {puedePagar && (
            <p className="caption pagos-nota">
              El pago se completa en la página de la pasarela. {user.nombre.split(' ')[0]}, SAGE
              nunca recibe ni almacena los datos de tu tarjeta.
            </p>
          )}
        </>
      )}
    </AppLayout>
  );
}
