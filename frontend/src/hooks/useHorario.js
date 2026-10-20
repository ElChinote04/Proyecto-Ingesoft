import { useEffect, useState } from 'react';
import { api } from '../api/client';

// La actualización automática consulta sin renovar la sesión por inactividad.
export function useHorario(perfil) {
  const [estado, setEstado] = useState({ data: null, error: null });
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let enCurso = false;
    async function actualizar() {
      if (enCurso || document.hidden) return;
      enCurso = true;
      try {
        const data = await api(`/horarios?perfil=${perfil}`, {
          signal: abort.signal,
          headers: { 'X-Sage-Background': '1' },
        });
        if (!abort.signal.aborted) setEstado({ data, error: null });
      } catch (error) {
        if (error.name !== 'AbortError') setEstado((previo) => ({ ...previo, error }));
      } finally {
        enCurso = false;
      }
    }
    actualizar();
    const intervalo = setInterval(actualizar, 10000);
    window.addEventListener('focus', actualizar);
    document.addEventListener('visibilitychange', actualizar);
    return () => {
      abort.abort();
      clearInterval(intervalo);
      window.removeEventListener('focus', actualizar);
      document.removeEventListener('visibilitychange', actualizar);
    };
  }, [perfil, intento]);
  return { ...estado, retry: () => setIntento((valor) => valor + 1) };
}
