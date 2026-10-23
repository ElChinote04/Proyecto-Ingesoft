import { useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { Feedback, Loading } from './components/Feedback';
import Login from './pages/Login';
import SessionSelect from './pages/SessionSelect';
import Attendance from './pages/Attendance';
import Confirmation from './pages/Confirmation';
import Admin from './pages/Admin';
import Setup from './pages/Setup';
import Portal from './pages/Portal';
import MiHorario from './pages/MiHorario';
import Pagos from './pages/Pagos';
import ResultadoPago from './pages/ResultadoPago';
import CambiarContrasena from './pages/CambiarContrasena';
import Gestion from './pages/ReglasConsolidacion';
import Libreta from './pages/Libreta';
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
  if (!user) return route === '/instalacion' ? <Setup /> : <Login />;
  const perfiles = [user.roles.join(','), user.docenteId, user.estudianteId, user.apoderadoId].join(
    ':',
  );
  if (user.requiereCambioContrasena || route === '/contrasena') return <CambiarContrasena />;
  if (route === '/horario' && user.roles.some((rol) => ['DOCENTE', 'ALUMNO'].includes(rol)))
    return <MiHorario key={perfiles} />;
  if (route === '/portal' && user.roles.some((rol) => ['ALUMNO', 'APODERADO'].includes(rol)))
    return <Portal key={perfiles} />;
  // El retorno de la pasarela puede traer parámetros detrás de la ruta, por eso
  // la expresión no está anclada al final.
  const retorno = route.match(/^\/pagos\/(\d+)\/(resultado|cancelado)/);
  if (retorno)
    return (
      <ResultadoPago key={retorno[1]} id={retorno[1]} cancelado={retorno[2] === 'cancelado'} />
    );
  if (route === '/pagos' && user.roles.some((rol) => ['APODERADO', 'ADMINISTRADOR'].includes(rol)))
    return <Pagos key={perfiles} />;
  if (
    (route === '/gestion' || route === '/gestion/nueva' || /^\/gestion\/editar\/\d+$/.test(route)) &&
    user.roles.some((rol) => ['DOCENTE', 'ADMINISTRADOR'].includes(rol))
  )
    return <Gestion />;
  if (
    route === '/evaluaciones' &&
    user.roles.some((rol) => ['ALUMNO', 'APODERADO'].includes(rol))
  )
    return <Libreta key={perfiles} />;
  if (
    user.roles.includes('ADMINISTRADOR') &&
    (route.startsWith('/admin') || !user.roles.includes('DOCENTE'))
  )
    return <Admin key={route} page={route.split('/')[2] || 'inicio'} />;
  if (!user.roles.includes('DOCENTE')) return <Portal key={perfiles} />;
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
