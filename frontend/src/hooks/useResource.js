import { useEffect, useState } from 'react';
import { api } from '../api/client';
// Con path vacío (null) no consulta nada: sirve para esperar a que los filtros sean válidos.
export function useResource(path) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${path}:${attempt}`;
  useEffect(() => {
    if (!path) return undefined;
    const abort = new AbortController();
    api(path, { signal: abort.signal })
      .then((data) => {
        if (!abort.signal.aborted) setState({ key, data, error: null });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ key, data: null, error });
      });
    return () => abort.abort();
  }, [path, key]);
  return {
    ...(state.key === key ? state : { data: null, error: null }),
    loading: Boolean(path) && state.key !== key,
    retry: () => setAttempt((a) => a + 1),
  };
}
