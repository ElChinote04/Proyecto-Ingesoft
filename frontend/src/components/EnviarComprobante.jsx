import { useEffect, useRef, useState } from 'react';
import { Feedback } from './Feedback';
import { api } from '../api/client';

/**
 * US-009: reenvía por correo el comprobante en PDF de una boleta pagada.
 * El correo de destino lo escribe quien lo pide (SAGE no guarda correos de
 * contacto); se recuerda en este navegador para no tener que escribirlo de nuevo.
 */
const CLAVE_ULTIMO_CORREO = 'sage.ultimoCorreoComprobante';

function leerUltimoCorreo() {
  try {
    return localStorage.getItem(CLAVE_ULTIMO_CORREO) ?? '';
  } catch {
    return '';
  }
}

function DialogoEnvio({ boletaId, numero, onClose }) {
  const dialogo = useRef(null);
  const [correo, setCorreo] = useState(leerUltimoCorreo);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviadoA, setEnviadoA] = useState('');
  useEffect(() => {
    dialogo.current.showModal();
  }, []);

  async function enviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const data = await api(`/compromisos-pago/${boletaId}/comprobante/envio`, {
        method: 'POST',
        body: { correo: correo.trim() },
      });
      try {
        localStorage.setItem(CLAVE_ULTIMO_CORREO, data.enviadoA);
      } catch {
        // Sin almacenamiento disponible: solo no se recuerda el correo.
      }
      setEnviadoA(data.enviadoA);
    } catch (fallo) {
      setError(fallo.details?.[0]?.mensaje ?? fallo.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog"
      aria-labelledby={`enviar-comprobante-${boletaId}`}
      onCancel={(evento) => {
        evento.preventDefault();
        if (!enviando) onClose();
      }}
    >
      <h2 id={`enviar-comprobante-${boletaId}`}>Enviar comprobante por correo</h2>
      {enviadoA ? (
        <>
          <Feedback intent="success" title="Comprobante enviado">
            Enviamos el comprobante {numero} en PDF a {enviadoA}. Si no aparece en unos minutos,
            revisa la carpeta de correo no deseado.
          </Feedback>
          <div className="actions">
            <button type="button" onClick={onClose}>
              Listo
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={enviar}>
          <p>Se enviará el comprobante {numero} como archivo PDF adjunto.</p>
          <label className="field">
            <span>
              Correo de destino <span className="required-mark">*</span>
            </span>
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              maxLength={254}
              required
              autoFocus
              disabled={enviando}
              placeholder="nombre@correo.com"
            />
          </label>
          {error && <Feedback title="No pudimos enviar el comprobante">{error}</Feedback>}
          <div className="actions">
            <button type="button" className="secondary" disabled={enviando} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando || !correo.trim()}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export default function EnviarComprobante({ boletaId, numero, className = 'secondary' }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setAbierto(true)}>
        Enviar por correo
      </button>
      {abierto && (
        <DialogoEnvio boletaId={boletaId} numero={numero} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}
