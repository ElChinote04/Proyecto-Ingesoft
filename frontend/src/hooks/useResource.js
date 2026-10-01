import { useEffect, useState } from 'react';
import { api } from '../api/client';
export function useResource(path) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${path}:${attempt}`;
  useEffect(() => {
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
    loading: state.key !== key,
    retry: () => setAttempt((a) => a + 1),
  };
}
