import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading } from '../components/Feedback';
import { api } from '../api/client';

// Estados en los que la pasarela todavía no ha dicho la última palabra.
const EN_CURSO = ['INICIADO', 'PROCESANDO'];
const INTERVALO_MS = 3000;
const ESPERA_MAXIMA_MS = 120000;

const DESENLACE = {
  CONFIRMADO: {
    intent: 'success',
    titulo: 'Pago confirmado',
    texto: 'La pasarela confirmó el cobro y la boleta quedó registrada como pagada.',
  },
  RECHAZADO: {
    intent: 'danger',
    titulo: 'El pago fue rechazado',
    texto:
      'La pasarela no autorizó el cobro. No se descontó ningún importe; puedes intentarlo de nuevo con otro medio de pago.',
  },
  CANCELADO: {
    intent: 'warning',
    titulo: 'El pago no se completó',
    texto: 'El intento quedó cancelado. La boleta sigue pendiente y puedes volver a pagarla.',
  },
};

const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  });

const soles = (monto) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(monto));

function leerCheckout(id) {
  try {
    return JSON.parse(sessionStorage.getItem(`sage:checkout:${id}`) ?? 'null');
  } catch {
    return null;
  }
}

function olvidarCheckout(id) {
  try {
    sessionStorage.removeItem(`sage:checkout:${id}`);
  } catch {
    // Sin sessionStorage no hay nada que limpiar.
  }
}

export default function ResultadoPago({ id, cancelado = false }) {
  const [pago, setPago] = useState(null);
  const [error, setError] = useState(null);
  const [sinRespuesta, setSinRespuesta] = useState(false);
  const [intento, setIntento] = useState(0);
  const [cerrando, setCerrando] = useState(false);
  const checkout = leerCheckout(id);

  useEffect(() => {
    let vivo = true;
    let temporizador;
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    async function consultar() {
      try {
        const datos = await api(`/pagos/${id}`);
        if (!vivo) return;
        setPago(datos);
        setError(null);
        if (!EN_CURSO.includes(datos.estado)) return olvidarCheckout(id);
        // La confirmación llega por el webhook de la pasarela, que puede
        // adelantarse o retrasarse respecto a este retorno. De ahí el sondeo.
        if (Date.now() < limite) temporizador = setTimeout(consultar, INTERVALO_MS);
        else setSinRespuesta(true);
      } catch (fallo) {
        if (vivo) setError(fallo);
      }
    }
    consultar();
    return () => {
      vivo = false;
      clearTimeout(temporizador);
    };
  }, [id, intento]);

  const reintentar = useCallback(() => {
    setSinRespuesta(false);
    setIntento((valor) => valor + 1);
  }, []);

  const cancelarIntento = useCallback(async () => {
    setCerrando(true);
    setError(null);
    try {
      await api(`/pagos/${id}`, { method: 'DELETE' });
      olvidarCheckout(id);
      reintentar();
    } catch (fallo) {
      setError(fallo);
      // Si la pasarela confirmó el pago mientras tanto, el servidor responde
      // 409 y ya aplicó la confirmación: basta con volver a consultar.
      if (fallo.status === 409) reintentar();
    } finally {
      setCerrando(false);
    }
  }, [id, reintentar]);

  const volver = () => {
    window.location.hash = '/pagos';
  };

  const enCurso = pago && EN_CURSO.includes(pago.estado);
  const desenlace = pago && DESENLACE[pago.estado];

  return (
    <AppLayout section="Pagos" step="Resultado del pago">
      <div className="page-heading">
        <h1>Resultado del pago</h1>
        {pago && (
          <p className="muted">
            {pago.boleta.concepto} · cuota {pago.boleta.numeroCuota} de{' '}
            {pago.boleta.estudiante.nombres} {pago.boleta.estudiante.apellidos} ·{' '}
            {soles(pago.monto)}
          </p>
        )}
      </div>

      <div className="card pago-resultado stack">
        {!pago && !error && <Loading>Consultando el estado del pago…</Loading>}

        {error && <Feedback title="No pudimos consultar el pago">{error.message}</Feedback>}

        {cancelado && enCurso && (
          <Feedback intent="warning" title="Volviste sin completar el pago">
            El intento sigue abierto en la pasarela. Puedes retomarlo donde lo dejaste o cancelarlo
            para generar uno nuevo más tarde.
          </Feedback>
        )}

        {!cancelado && enCurso && !sinRespuesta && (
          <Loading>Esperando la confirmación de la pasarela…</Loading>
        )}

        {enCurso && sinRespuesta && (
          <Feedback intent="info" title="La confirmación está demorando">
            El pago sigue en proceso. Si ya lo completaste, la boleta se actualizará en cuanto la
            pasarela nos avise; puedes cerrar esta página y revisarla más tarde.
          </Feedback>
        )}

        {desenlace && (
          <Feedback intent={desenlace.intent} title={desenlace.titulo}>
            {desenlace.texto}
            {pago.confirmadoEn && ` Fecha del pago: ${fechaHora(pago.confirmadoEn)}`}
          </Feedback>
        )}

        <div className="actions">
          <button onClick={volver}>Volver a mis boletas</button>
          {enCurso && checkout?.url && (
            <a className="button-link" href={checkout.url}>
              Retomar el pago
            </a>
          )}
          {enCurso && (
            <button className="secondary" disabled={cerrando} onClick={cancelarIntento}>
              {cerrando ? 'Cancelando…' : 'Cancelar este intento'}
            </button>
          )}
          {enCurso && !cancelado && (
            <button className="secondary" onClick={reintentar}>
              Actualizar
            </button>
          )}
        </div>

        {/* Atajo de desarrollo: con la pasarela simulada no hay pago real que
            confirmar, así que el recorrido se completa desde aquí. La ruta solo
            existe fuera de producción y con PAGOS_PROVEEDOR=simulada. */}
        {import.meta.env.DEV && enCurso && checkout?.simulado && (
          <div className="pago-simulacion">
            <p className="caption">Pasarela simulada · solo en desarrollo</p>
            <div className="actions">
              {['PAGADO', 'RECHAZADO'].map((resultado) => (
                <button
                  key={resultado}
                  className="secondary"
                  onClick={async () => {
                    try {
                      await api(`/pagos/${id}/simular`, { method: 'POST', body: { resultado } });
                    } catch (fallo) {
                      setError(fallo);
                    }
                    reintentar();
                  }}
                >
                  Simular {resultado.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
