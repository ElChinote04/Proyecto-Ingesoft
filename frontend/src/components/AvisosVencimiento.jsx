import { Feedback } from './Feedback';
import { useResource } from '../hooks/useResource';
import { fechaCorta, nombreDe, periodoLargo, soles } from '../utils/pagos';

const cuando = (dias) =>
  dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `vence en ${dias} días`;

/**
 * US-011: aviso en el portal del apoderado cuando una pensión de sus
 * estudiantes vence dentro de los próximos días. Si no hay nada por vencer, o
 * la consulta falla, no muestra nada: es un recordatorio, no un bloqueo.
 */
export default function AvisosVencimiento({ enlazarPagos = true }) {
  const { data } = useResource('/avisos-vencimiento');
  if (!data?.avisos.length) return null;
  const { avisos, diasAnticipacion } = data;
  return (
    <div className="avisos-vencimiento">
      <Feedback
        intent="warning"
        title={
          avisos.length === 1
            ? `Tienes una pensión por vencer en los próximos ${diasAnticipacion} días`
            : `Tienes ${avisos.length} pensiones por vencer en los próximos ${diasAnticipacion} días`
        }
      >
        <ul>
          {avisos.map((aviso) => (
            <li key={aviso.boletaId}>
              <span className="aviso-cuando">{cuando(aviso.diasRestantes)}</span> (
              {fechaCorta(aviso.fechaVencimiento)}) · {nombreDe(aviso.estudiante)} ·{' '}
              {periodoLargo(aviso.periodo)} · {soles(aviso.monto)}
            </li>
          ))}
        </ul>
        {enlazarPagos && (
          <a href="#/pagos" className="avisos-enlace">
            Ir a Pagos y boletas
          </a>
        )}
      </Feedback>
    </div>
  );
}
