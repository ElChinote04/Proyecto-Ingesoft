import { useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { Feedback, Loading } from './components/Feedback';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import SessionSelect from './pages/SessionSelect';
import Attendance from './pages/Attendance';
import Confirmation from './pages/Confirmation';
import './styles/app.css';
function Screens() {
  const { user, loading, startupError, restore } = useAuth();
  const [route, setRoute] = useState(window.location.hash.slice(1));
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    const change = () => {
      setRoute(window.location.hash.slice(1));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  if (loading)
    return (
      <div className="center">
        <Loading>Comprobando sesión…</Loading>
      </div>
    );
  if (startupError)
    return (
      <div className="center stack">
        <Feedback>{startupError}</Feedback>
        <button onClick={restore}>Volver a intentar</button>
      </div>
    );
  if (!user) return <Login />;
  if (!user.roles.includes('DOCENTE'))
    return (
      <AppLayout step="Acceso">
        <h1>Acceso restringido</h1>
        <Feedback intent="info">
          Tu cuenta está autenticada, pero no tiene el rol Docente requerido para este módulo.
        </Feedback>
      </AppLayout>
    );
  if (route === '/confirmacion' && saved) return <Confirmation result={saved} />;
  const match = route.match(/^\/sesiones\/(\d+)$/);
  if (match)
    return (
      <Attendance
        key={match[1]}
        id={match[1]}
        onSaved={(result) => {
          setSaved(result);
          window.location.hash = '/confirmacion';
        }}
      />
    );
  return <SessionSelect />;
}
export default function App() {
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}
