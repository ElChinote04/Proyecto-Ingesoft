import { useEffect, useRef, useState } from 'react';
import { Feedback } from './Feedback';
import { api } from '../api/client';
import { conceptoDe, fechaDeInstante, nombreDe, periodoLargo, soles } from '../utils/pagos';

const MINIMO_MOTIVO = 10;

/**
 * US-013: el administrador anula un pago confirmado que se registró por error.
 * El pago no se borra: queda anulado con su motivo en la auditoría, su
 * comprobante deja de valer y la boleta vuelve a quedar por cobrar.
 */
export default function AnularPago({ boleta, onAnulado, onClose }) {
  const dialogo = useRef(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  async function anular(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api(`/pagos/${boleta.pagoConfirmadoId}/anulacion`, {
        method: 'PUT',
        body: { motivo: motivo.trim() },
      });
      onAnulado();
    } catch (fallo) {
      setError(fallo.details?.[0]?.mensaje ?? fallo.message);
      setEnviando(false);
    }
  }

  const motivoValido = motivo.trim().length >= MINIMO_MOTIVO;
  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog"
      aria-labelledby="anular-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!enviando) onClose();
      }}
    >
      <h2 id="anular-titulo">Anular pago</h2>
      <dl className="pago-detalle">
        <dt>Alumno</dt>
        <dd>{nombreDe(boleta.estudiante)}</dd>
        <dt>Concepto</dt>
        <dd>
          {conceptoDe(boleta)} · {periodoLargo(boleta.periodo)}
        </dd>
        <dt>Monto</dt>
        <dd>
          <strong>{soles(boleta.monto)}</strong>
        </dd>
        <dt>Pagada el</dt>
        <dd>{fechaDeInstante(boleta.pagadaEn)}</dd>
        <dt>Comprobante</dt>
        <dd>{boleta.comprobante}</dd>
      </dl>
      <Feedback intent="warning" title="Qué ocurre al anular">
        El pago queda anulado (no se borra), el comprobante {boleta.comprobante} deja de ser válido
        y la boleta vuelve a quedar pendiente de pago. La devolución del dinero, si corresponde, se
        gestiona en la pasarela.
      </Feedback>
      <form onSubmit={anular}>
        <label className="field anulacion-motivo">
          <span>
            Motivo de la anulación <span className="required-mark">*</span>
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            rows={3}
            required
            disabled={enviando}
            placeholder="Por ejemplo: el pago se aplicó a la boleta de otro estudiante."
          />
          <span className="caption">
            Queda registrado en la auditoría. Mínimo {MINIMO_MOTIVO} caracteres.
          </span>
        </label>
        {error && <Feedback title="No pudimos anular el pago">{error}</Feedback>}
        <div className="actions">
          <button type="button" className="secondary" disabled={enviando} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="destructive" disabled={enviando || !motivoValido}>
            {enviando ? 'Anulando…' : 'Anular pago'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
