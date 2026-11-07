import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Feedback } from './Feedback';

// Mismos límites que el servidor (US-010). La vista previa solo orienta: quien
// decide si las cuotas son válidas es el backend.
const MIN_CUOTAS = 2;
const MAX_CUOTAS = 6;

const aCentimos = (monto) => Math.round(Number(monto) * 100);
const soles = (centimos) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(centimos / 100);

const fechaCorta = (fecha) =>
  fecha.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function sumarMeses(iso, meses) {
  const fecha = new Date(`${iso}T00:00:00Z`);
  const total = fecha.getUTCMonth() + meses;
  const anio = fecha.getUTCFullYear() + Math.floor(total / 12);
  const mes = total % 12;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(fecha.getUTCDate(), ultimoDia)));
}

/** Cuotas que resultarían, o el motivo por el que no son válidas. */
function calcularVistaPrevia(total, numeroCuotas, montoCuota, fechaPrimerVencimiento) {
  const cuota = aCentimos(montoCuota);
  if (!cuota || cuota <= 0 || !fechaPrimerVencimiento) return { cuotas: [] };
  const ultima = total - cuota * (numeroCuotas - 1);
  if (ultima <= 0) return { cuotas: [], error: 'Con esas cuotas se supera el total de la boleta.' };
  if (ultima > cuota)
    return { cuotas: [], error: 'Con esas cuotas no se completa el total de la boleta.' };
  return {
    cuotas: Array.from({ length: numeroCuotas }, (_, i) => ({
      numero: i + 1,
      monto: i === numeroCuotas - 1 ? ultima : cuota,
      vence: sumarMeses(fechaPrimerVencimiento, i),
    })),
  };
}

/** Monto por cuota sugerido: el reparto en partes iguales, redondeado hacia arriba. */
const sugerirMonto = (total, numeroCuotas) => (Math.ceil(total / numeroCuotas) / 100).toFixed(2);

/**
 * US-010: el administrador divide una boleta pendiente en cuotas. Cada cuota
 * queda como una boleta que el apoderado paga por separado; la original pasa a
 * «Parcial» hasta que se pague la última.
 */
export default function FraccionarBoleta({ boleta, descripcion, onClose, onSaved }) {
  const dialogo = useRef(null);
  const total = aCentimos(boleta.monto);
  const [numeroCuotas, setNumeroCuotas] = useState(MIN_CUOTAS);
  const [montoCuota, setMontoCuota] = useState(sugerirMonto(total, MIN_CUOTAS));
  const [fechaPrimerVencimiento, setFecha] = useState(boleta.fechaVencimiento);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  const vistaPrevia = calcularVistaPrevia(total, numeroCuotas, montoCuota, fechaPrimerVencimiento);

  function cambiarCuotas(valor) {
    setNumeroCuotas(valor);
    setMontoCuota(sugerirMonto(total, valor));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api(`/compromisos-pago/${boleta.id}/fracciones`, {
        method: 'POST',
        body: { numeroCuotas, montoCuota, fechaPrimerVencimiento },
      });
      onSaved();
    } catch (fallo) {
      setError(fallo.message);
      setGuardando(false);
    }
  }

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog"
      aria-labelledby="fraccionar-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!guardando) onClose();
      }}
    >
      <h2 id="fraccionar-titulo">Pagar en cuotas</h2>
      <p className="muted">
        {descripcion} · total <strong>{soles(total)}</strong>
      </p>
      <form className="stack" onSubmit={guardar}>
        <div className="form-grid">
          <label className="field">
            <span>
              Número de cuotas
              <span className="required-mark" aria-hidden="true">
                {' '}
                *
              </span>
            </span>
            <select
              value={numeroCuotas}
              onChange={(e) => cambiarCuotas(Number(e.target.value))}
              disabled={guardando}
            >
              {Array.from({ length: MAX_CUOTAS - MIN_CUOTAS + 1 }, (_, i) => i + MIN_CUOTAS).map(
                (n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            <span>
              Monto por cuota (S/)
              <span className="required-mark" aria-hidden="true">
                {' '}
                *
              </span>
            </span>
            <input
              inputMode="decimal"
              required
              pattern="\d{1,6}(\.\d{1,2})?"
              value={montoCuota}
              onChange={(e) => setMontoCuota(e.target.value)}
              disabled={guardando}
            />
          </label>
          <label className="field">
            <span>
              Vencimiento de la primera cuota
              <span className="required-mark" aria-hidden="true">
                {' '}
                *
              </span>
            </span>
            <input
              type="date"
              required
              value={fechaPrimerVencimiento}
              onChange={(e) => setFecha(e.target.value)}
              disabled={guardando}
            />
          </label>
        </div>

        {vistaPrevia.error && (
          <Feedback intent="warning" title="Revisa las cuotas">
            {vistaPrevia.error}
          </Feedback>
        )}
        {vistaPrevia.cuotas.length > 0 && (
          <ol className="fracciones-vista">
            {vistaPrevia.cuotas.map((c) => (
              <li key={c.numero}>
                <span>
                  Cuota {c.numero} · vence {fechaCorta(c.vence)}
                </span>
                <strong>{soles(c.monto)}</strong>
              </li>
            ))}
          </ol>
        )}
        <p className="caption">
          La última cuota se ajusta para que la suma sea exactamente el total. La boleta quedará
          como «Parcial» hasta que se pague la última cuota, y cada cuota tendrá su comprobante.
        </p>

        {error && <Feedback title="No pudimos dividir la boleta">{error}</Feedback>}
        <div className="actions">
          <button type="button" className="secondary" disabled={guardando} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando || !vistaPrevia.cuotas.length}>
            {guardando ? 'Guardando…' : 'Confirmar cuotas'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
