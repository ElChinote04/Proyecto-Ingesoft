import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AuthContext } from './auth';
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [startupError, setStartupError] = useState('');
  async function restore() {
    setLoading(true);
    setStartupError('');
    try {
      setUser(await api('/auth/me'));
    } catch (error) {
      if (error.status === 401) setUser(null);
      else setStartupError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    api('/auth/me', { signal: abort.signal })
      .then(setUser)
      .catch((error) => {
        if (error.name !== 'AbortError' && error.status !== 401) setStartupError(error.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    const expired = () => {
      setUser(null);
      setNotice('Tu sesión venció. Inicia sesión nuevamente para continuar.');
    };
    window.addEventListener('sage:expired', expired);
    return () => {
      abort.abort();
      window.removeEventListener('sage:expired', expired);
    };
  }, []);
  async function login(credentials) {
    const data = await api('/auth/login', { method: 'POST', body: credentials });
    setNotice('');
    setUser(data);
    window.location.hash = data.roles.includes('ADMINISTRADOR') ? '/admin/inicio' : '/sesiones';
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    setUser(null);
    setNotice('Sesión cerrada correctamente.');
    window.location.hash = '/login';
  }
  return (
    <AuthContext value={{ user, loading, notice, startupError, restore, login, logout }}>
      {children}
    </AuthContext>
  );
}
