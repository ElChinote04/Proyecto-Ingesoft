import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Feedback } from '../components/Feedback';
export default function AppLayout({
  children,
  step = 'Seleccionar sesión',
  onLeave = (action) => action(),
}) {
  const { user, logout } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function close() {
    setBusy(true);
    try {
      await logout();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">SAGE</div>
          <p className="caption">{user.roles.join(' · ')}</p>
          {user.roles.includes('DOCENTE') && (
            <nav aria-label="Menú principal">
              <button
                className="nav-active"
                onClick={() =>
                  onLeave(() => {
                    window.location.hash = '/sesiones';
                  })
                }
              >
                <img src="/figma/nav-active.svg" alt="" />
                Control de asistencia
              </button>
            </nav>
          )}
        </div>
        <div className="sidebar-footer">
          Prototipo de arquitectura<span className="caption">Gestión académica escolar</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <strong>Control de asistencia</strong>
          <div>
            <span className="muted">{user.nombre}</span>
            <button className="text-button" disabled={busy} onClick={() => onLeave(close)}>
              {busy ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>
        <main>
          <div className="breadcrumb">
            Asistencia<span aria-hidden="true">/</span>
            {step}
          </div>
          {error && <Feedback>{error}</Feedback>}
          {children}
        </main>
      </div>
    </div>
  );
}
