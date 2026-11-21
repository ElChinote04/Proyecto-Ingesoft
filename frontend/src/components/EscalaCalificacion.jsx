import { useState } from 'react';
import { api } from '../api/client';
import { CampoError } from './CampoArchivos';
import ConfirmarAccion from './ConfirmarAccion';
import { Feedback, Loading, ResourceError } from './Feedback';
import LetraLogro from './LetraLogro';
import { useResource } from '../hooks/useResource';
import { formatearNota } from '../utils/notas';

const LETRAS = [
  ['minimoAD', 'AD'],
  ['minimoA', 'A'],
  ['minimoB', 'B'],
];

// Mismo cálculo que el servidor: redondeo al entero, medio hacia arriba, y la primera letra
// cuyo mínimo se alcanza.
function letraDe(promedio, escala) {
  const entera = Math.floor(promedio + 0.5);
  return LETRAS.find(([campo]) => entera >= escala[campo])?.[1] ?? 'C';
}

function validar(escala) {
  const errores = {};
  for (const [campo, letra] of LETRAS)
    if (!Number.isInteger(escala[campo]) || escala[campo] < 1 || escala[campo] > 20)
      errores[campo] = `La nota mínima de ${letra} es un entero de 1 a 20.`;
  if (!errores.minimoA && escala.minimoA >= escala.minimoAD)
    errores.minimoA = 'A debe empezar por debajo de AD.';
  if (!errores.minimoB && escala.minimoB >= escala.minimoA)
    errores.minimoB = 'B debe empezar por debajo de A.';
  return errores;
}

function FormularioEscala({ vigente, onGuardada }) {
  const [valores, setValores] = useState({
    minimoAD: String(vigente.minimoAD),
    minimoA: String(vigente.minimoA),
    minimoB: String(vigente.minimoB),
  });
  const [errores, setErrores] = useState({});
  const [confirmar, setConfirmar] = useState(null);
  const escala = Object.fromEntries(
    Object.entries(valores).map(([campo, valor]) => [campo, Number(valor)]),
  );
  const valida = !Object.keys(validar(escala)).length;
  const hasta = { minimoAD: 20, minimoA: escala.minimoAD - 1, minimoB: escala.minimoA - 1 };
  const sinCambios = LETRAS.every(([campo]) => escala[campo] === vigente[campo]);

  function revisar(evento) {
    evento.preventDefault();
    const encontrados = validar(escala);
    setErrores(encontrados);
    if (!Object.keys(encontrados).length) setConfirmar(escala);
  }

  return (
    <>
      <form className="scale-form" onSubmit={revisar} noValidate>
        <table className="scale-table">
          <thead>
            <tr>
              <th>Letra</th>
              <th>Desde</th>
              <th>Hasta</th>
            </tr>
          </thead>
          <tbody>
            {LETRAS.map(([campo, letra]) => (
              <tr key={campo}>
                <td>
                  <LetraLogro nivel={letra} />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    aria-label={`Nota mínima de ${letra}`}
                    aria-invalid={Boolean(errores[campo])}
                    aria-describedby={`escala-${campo}-error`}
                    value={valores[campo]}
                    onChange={(evento) => {
                      setValores((actual) => ({ ...actual, [campo]: evento.target.value }));
                      setErrores((actual) => ({ ...actual, [campo]: '' }));
                    }}
                  />
                  <CampoError id={`escala-${campo}-error`}>{errores[campo]}</CampoError>
                </td>
                <td>{valida ? hasta[campo] : '—'}</td>
              </tr>
            ))}
            <tr>
              <td>
                <LetraLogro nivel="C" />
              </td>
              <td>0</td>
              <td>{valida ? escala.minimoB - 1 : '—'}</td>
            </tr>
          </tbody>
        </table>
        {valida && (
          <p className="caption">
            Vista previa: {formatearNota(17.5)} → 18 → {letraDe(17.5, escala)} ·{' '}
            {formatearNota(13.49)} → 13 → {letraDe(13.49, escala)}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={sinCambios}>
            Guardar escala
          </button>
        </div>
      </form>
      {confirmar && (
        <ConfirmarAccion
          titulo="¿Guardar la escala?"
          confirmar="Guardar escala"
          onConfirm={async () =>
            onGuardada(await api('/escala-calificacion', { method: 'PUT', body: confirmar }))
          }
          onClose={() => setConfirmar(null)}
        >
          Se recalcularán las letras de todos los bimestres que todavía no tienen la libreta
          publicada. Lo ya publicado no cambia.
        </ConfirmarAccion>
      )}
    </>
  );
}

export default function EscalaCalificacion() {
  const escala = useResource('/escala-calificacion');
  const [guardada, setGuardada] = useState(null);
  const vigente = guardada ?? escala.data;

  return (
    <section className="card academic-section scale-card">
      <h2>Escala de calificación</h2>
      <p className="muted">
        Una sola tabla para todo el colegio. Convierte el promedio de 0 a 20 de cada competencia en
        la letra del bimestre, redondeado al entero (17,5 pasa a 18).
      </p>
      {guardada && (
        <Feedback intent="success" title={`Escala guardada (versión ${guardada.version})`}>
          Se recalcularon {guardada.letrasRecalculadas} letras de bimestres sin publicar.
        </Feedback>
      )}
      {!vigente && escala.error ? (
        <ResourceError error={escala.error} retry={escala.retry} />
      ) : !vigente ? (
        <Loading>Cargando escala…</Loading>
      ) : (
        <FormularioEscala key={vigente.version} vigente={vigente} onGuardada={setGuardada} />
      )}
    </section>
  );
}
