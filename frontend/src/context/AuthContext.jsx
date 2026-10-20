import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { AuthContext } from './auth';
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [startupError, setStartupError] = useState('');
  // Las respuestas de una sesión anterior no deben restaurarla después del logout.
  const sesionActual = useRef({});
  async function restore() {
    const sesion = sesionActual.current;
    setLoading(true);
    setStartupError('');
    try {
      const data = await api('/auth/me');
      if (sesionActual.current === sesion) setUser(data);
    } catch (error) {
      if (sesionActual.current !== sesion) return;
      if (error.status === 401) setUser(null);
      else setStartupError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    const sesion = sesionActual.current;
    api('/auth/me', { signal: abort.signal })
      .then((data) => {
        if (!abort.signal.aborted && sesionActual.current === sesion) setUser(data);
      })
      .catch((error) => {
        if (sesionActual.current === sesion && error.name !== 'AbortError' && error.status !== 401)
          setStartupError(error.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    const expired = () => {
      sesionActual.current = {};
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
    function consultarSesion(background = false) {
      const sesion = sesionActual.current;
      api('/auth/me', background ? { headers: { 'X-Sage-Background': '1' } } : undefined)
        .then((data) => {
          if (sesionActual.current === sesion) setUser(data);
        })
        .catch((error) => {
          if (sesionActual.current === sesion && error.status === 401)
            window.dispatchEvent(new Event('sage:expired'));
        });
    }
    const actividad = () => {
      ultimaAccion = Date.now();
      if (Date.now() - ultimoEnvio < Math.min(60000, inactividadSegundos * 500)) return;
      ultimoEnvio = Date.now();
      consultarSesion();
    };
    const verificar = setInterval(() => {
      if (Date.now() - ultimaAccion >= inactividadSegundos * 1000) {
        api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        window.dispatchEvent(new Event('sage:expired'));
      }
    }, 1000);
    const foco = () => consultarSesion(true);
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
    sesionActual.current = {};
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
    sesionActual.current = {};
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    sesionActual.current = {};
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
