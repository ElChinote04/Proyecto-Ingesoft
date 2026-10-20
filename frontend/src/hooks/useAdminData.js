import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Conserva los formularios y sus mensajes durante una recarga del listado.
export function useAdminData(paths) {
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all(paths.split(',').map((path) => api(`/admin/${path}`, { signal: abort.signal })))
      .then((data) => {
        if (!abort.signal.aborted) setState({ data, error: null });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState((previous) => ({ ...previous, error }));
      });
    return () => abort.abort();
  }, [paths, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}
