// El enlace solo existe si hay a dónde ir.
export default function CodigoSolicitud({ requestId, enlace }) {
  if (!requestId) return '—';
  return (
    <span className="codigo-solicitud">
      <span>{requestId}</span>
      {enlace}
    </span>
  );
}
