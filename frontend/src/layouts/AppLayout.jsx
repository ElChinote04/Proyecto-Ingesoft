import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Feedback } from '../components/Feedback';
export default function AppLayout({
  children,
  step = 'Seleccionar sesión',
  section = 'Asistencia',
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
          <nav aria-label="Menú principal">
            {user.roles.includes('ADMINISTRADOR') &&
              [
                ['inicio', 'Inicio'],
                ['usuarios', 'Usuarios y roles'],
                ['catalogos', 'Catálogos académicos'],
                ['matriculas', 'Alumnos y matrículas'],
                ['horarios', 'Horarios y sesiones'],
                ['auditoria', 'Auditoría'],
              ].map(([route, label]) => (
                <button
                  key={route}
                  className={
                    window.location.hash === `#/admin/${route}` ? 'nav-active' : 'nav-item'
                  }
                  onClick={() =>
                    onLeave(() => {
                      window.location.hash = `/admin/${route}`;
                    })
                  }
                >
                  <img
                    src={
                      window.location.hash === `#/admin/${route}`
                        ? '/figma/nav-active.svg'
                        : '/figma/nav.svg'
                    }
                    alt=""
                  />
                  {label}
                </button>
              ))}
            {user.roles.includes('DOCENTE') && (
              <button
                className={section === 'Asistencia' ? 'nav-active' : 'nav-item'}
                onClick={() =>
                  onLeave(() => {
                    window.location.hash = '/sesiones';
                  })
                }
              >
                <img
                  src={section === 'Asistencia' ? '/figma/nav-active.svg' : '/figma/nav.svg'}
                  alt=""
                />
                Control de asistencia
              </button>
            )}
          </nav>
        </div>
        <div className="sidebar-footer">
          Prototipo de arquitectura<span className="caption">Gestión académica escolar</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <strong>{section === 'Asistencia' ? 'Control de asistencia' : section}</strong>
          <div>
            <span className="muted">{user.nombre}</span>
            <button className="text-button" disabled={busy} onClick={() => onLeave(close)}>
              {busy ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>
        <main>
          <div className="breadcrumb">
            {section}
            <span aria-hidden="true">/</span>
            {step}
          </div>
          {error && <Feedback>{error}</Feedback>}
          {children}
        </main>
      </div>
    </div>
  );
}
