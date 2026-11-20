import { useState } from 'react';
import { descargarArchivo } from '../api/client';

/** US-009: botón que descarga el comprobante en PDF de una boleta pagada. */
export default function DescargarComprobante({ boletaId, numero, className = 'secondary' }) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');

  async function descargar() {
    setDescargando(true);
    setError('');
    try {
      await descargarArchivo(
        `/compromisos-pago/${boletaId}/comprobante`,
        `comprobante-${numero}.pdf`,
      );
    } catch (fallo) {
      setError(fallo.message);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <span className="descargar-comprobante">
      <button className={className} onClick={descargar} disabled={descargando}>
        {descargando ? 'Descargando…' : 'Descargar comprobante'}
      </button>
      {error && (
        <span className="caption danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
