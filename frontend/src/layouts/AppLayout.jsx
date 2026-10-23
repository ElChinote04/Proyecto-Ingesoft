import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Feedback } from '../components/Feedback';
export default function AppLayout({
  children,
  step = 'Seleccionar sesión',
  section = 'Asistencia',
  anioAcademico,
  onLeave = (action) => action(),
}) {
  const { user, logout } = useAuth();
  useEffect(() => {
    document.title = `SAGE | ${section} · ${step}`;
  }, [section, step]);
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
            {!user.requiereCambioContrasena &&
              user.roles.includes('ADMINISTRADOR') &&
              [
                ['inicio', 'Inicio'],
                ['usuarios', 'Usuarios y roles'],
                ['catalogos', 'Catálogos académicos'],
                ['matriculas', 'Alumnos y matrículas'],
                ['horarios', 'Horarios y sesiones'],
                ['reglas', 'Gestión académica'],
                ['auditoria', 'Auditoría'],
              ].map(([route, label]) => (
                <button
                  key={route}
                  className={
                    (route === 'reglas'
                      ? window.location.hash.startsWith('#/gestion')
                      : window.location.hash === `#/admin/${route}`)
                      ? 'nav-active'
                      : 'nav-item'
                  }
                  onClick={() =>
                    onLeave(() => {
                      window.location.hash = route === 'reglas' ? '/gestion' : `/admin/${route}`;
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
            {!user.requiereCambioContrasena && user.roles.includes('DOCENTE') && (
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
            {!user.requiereCambioContrasena && user.roles.includes('DOCENTE') && (
              <button
                className={section === 'Gestión Académica' ? 'nav-active' : 'nav-item'}
                onClick={() =>
                  onLeave(() => {
                    window.location.hash = '/gestion';
                  })
                }
              >
                <img
                  src={section === 'Gestión Académica' ? '/figma/nav-active.svg' : '/figma/nav.svg'}
                  alt=""
                />
                Gestión Académica
              </button>
            )}
            {!user.requiereCambioContrasena &&
              user.roles.some((rol) => ['ALUMNO'].includes(rol)) && (
                <button
                  className={section === 'Mis evaluaciones' ? 'nav-active' : 'nav-item'}
                  onClick={() =>
                    onLeave(() => {
                      window.location.hash = '/evaluaciones';
                    })
                  }
                >
                  <img
                    src={
                      section === 'Mis evaluaciones' ? '/figma/nav-active.svg' : '/figma/nav.svg'
                    }
                    alt=""
                  />
                  Mis evaluaciones
                </button>
              )}
            {!user.requiereCambioContrasena &&
              user.roles.some((rol) => ['DOCENTE', 'ALUMNO'].includes(rol)) && (
                <button
                  className={section === 'Mi horario' ? 'nav-active' : 'nav-item'}
                  onClick={() =>
                    onLeave(() => {
                      window.location.hash = '/horario';
                    })
                  }
                >
                  <img
                    src={section === 'Mi horario' ? '/figma/nav-active.svg' : '/figma/nav.svg'}
                    alt=""
                  />
                  Mi horario
                </button>
              )}
            {!user.requiereCambioContrasena &&
              user.roles.some((rol) => ['ALUMNO', 'APODERADO'].includes(rol)) && (
                <button
                  className={section === 'Portal académico' ? 'nav-active' : 'nav-item'}
                  onClick={() =>
                    onLeave(() => {
                      window.location.hash = '/portal';
                    })
                  }
                >
                  <img
                    src={
                      section === 'Portal académico' ? '/figma/nav-active.svg' : '/figma/nav.svg'
                    }
                    alt=""
                  />
                  Inicio
                </button>
              )}
            <button
              className={section === 'Seguridad' ? 'nav-active' : 'nav-item'}
              onClick={() =>
                onLeave(() => {
                  window.location.hash = '/contrasena';
                })
              }
            >
              <img
                src={section === 'Seguridad' ? '/figma/nav-active.svg' : '/figma/nav.svg'}
                alt=""
              />
              Cambiar contraseña
            </button>
          </nav>
        </div>
        <div className="sidebar-footer">
          {anioAcademico ? `Año académico ${anioAcademico}` : 'SAGE'}
          <span className="caption">{user.roles.join(' · ')}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <strong>
            {section === 'Asistencia'
              ? 'Control de asistencia'
              : section === 'Portal académico'
                ? step
                : section}
          </strong>
          <div>
            <span className="muted">{user.nombre}</span>
            <button className="text-button" disabled={busy} onClick={() => onLeave(close)}>
              {busy ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>
        <main>
          <div className="breadcrumb">
            Inicio
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
