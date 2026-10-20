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
  const userId = user?.id;
  const inactividadSegundos = user?.inactividadSegundos;
  useEffect(() => {
    if (!userId) return;
    let ultimaAccion = Date.now();
    let ultimoEnvio = 0;
    const actividad = () => {
      ultimaAccion = Date.now();
      if (Date.now() - ultimoEnvio < Math.min(60000, inactividadSegundos * 500)) return;
      ultimoEnvio = Date.now();
      api('/auth/me')
        .then(setUser)
        .catch((error) => {
          if (error.status === 401) window.dispatchEvent(new Event('sage:expired'));
        });
    };
    const verificar = setInterval(() => {
      if (Date.now() - ultimaAccion >= inactividadSegundos * 1000) {
        api('/auth/logout', { method: 'POST' }).catch(() => {
          window.dispatchEvent(new Event('sage:expired'));
        });
        window.dispatchEvent(new Event('sage:expired'));
      }
    }, 1000);
    const foco = () =>
      api('/auth/me', { headers: { 'X-Sage-Background': '1' } })
        .then(setUser)
        .catch((error) => {
          if (error.status === 401) window.dispatchEvent(new Event('sage:expired'));
        });
    const cambiarClave = () => {
      setUser((previo) => (previo ? { ...previo, requiereCambioContrasena: true } : null));
      window.location.hash = '/contrasena';
    };
    for (const evento of ['pointerdown', 'keydown', 'scroll'])
      window.addEventListener(evento, actividad, { passive: true });
    window.addEventListener('focus', foco);
    window.addEventListener('sage:password-required', cambiarClave);
    return () => {
      clearInterval(verificar);
      for (const evento of ['pointerdown', 'keydown', 'scroll'])
        window.removeEventListener(evento, actividad);
      window.removeEventListener('focus', foco);
      window.removeEventListener('sage:password-required', cambiarClave);
    };
  }, [userId, inactividadSegundos]);
  async function login(credentials) {
    const data = await api('/auth/login', { method: 'POST', body: credentials });
    setNotice('');
    setUser(data);
    window.location.hash = data.requiereCambioContrasena
      ? '/contrasena'
      : data.roles.includes('ADMINISTRADOR')
        ? '/admin/inicio'
        : data.roles.includes('DOCENTE')
          ? '/sesiones'
          : '/portal';
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
