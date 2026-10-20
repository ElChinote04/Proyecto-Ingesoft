import { useEffect, useRef, useState } from 'react';
import { Feedback } from './Feedback';

export default function ConfirmarAccion({ titulo, children, confirmar, onConfirm, onClose }) {
  const dialogo = useRef(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialogo.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialogo}
      className="confirmation-dialog"
      aria-labelledby="confirmar-titulo"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!ocupado) onClose();
      }}
    >
      <h2 id="confirmar-titulo">{titulo}</h2>
      <p>{children}</p>
      {error && <Feedback>{error}</Feedback>}
      <div className="actions">
        <button className="secondary" disabled={ocupado} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="destructive"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            setError('');
            try {
              await onConfirm();
              onClose();
            } catch (fallo) {
              setError(fallo.message);
              setOcupado(false);
            }
          }}
        >
          {ocupado ? 'Guardando…' : confirmar}
        </button>
      </div>
    </dialog>
  );
}
