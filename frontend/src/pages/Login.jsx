import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Feedback } from '../components/Feedback';
export default function Login() {
  const { login, notice } = useAuth();
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState({});
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identificador = form.get('identificador').trim();
    const contrasena = form.get('contrasena');
    const errors = { identificador: !identificador, contrasena: !contrasena };
    setInvalid(errors);
    setError('');
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      await login({ identificador, contrasena });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="brand-panel">
        <div className="login-brand">SAGE</div>
        <h2>Gestión escolar en un solo lugar</h2>
        <p>Acceso seguro para administradores, docentes, estudiantes y apoderados.</p>
        <div className="school-card">
          <h3>Colegio Secundario Nuevo Horizonte</h3>
          <p>Control de asistencia escolar</p>
        </div>
      </section>
      <section className="login-area" aria-label="Acceso a SAGE">
        <form className="login-card" noValidate onSubmit={submit}>
          <h1>Iniciar sesión</h1>
          <p className="muted">Ingresa con las credenciales asignadas por el colegio.</p>
          {notice && <Feedback intent="info">{notice}</Feedback>}
          {error && <Feedback title="No pudimos ingresar">{error}</Feedback>}
          <label className="field">
            Identificador
            <input
              name="identificador"
              autoComplete="username"
              autoFocus
              placeholder="Usuario o correo"
              aria-invalid={invalid.identificador || undefined}
              aria-describedby={invalid.identificador ? 'identifier-error' : undefined}
              disabled={busy}
            />
            {invalid.identificador && (
              <span id="identifier-error" className="field-error">
                Ingresa tu usuario o correo.
              </span>
            )}
          </label>
          <label className="field">
            Contraseña
            <input
              name="contrasena"
              type="password"
              autoComplete="current-password"
              aria-invalid={invalid.contrasena || undefined}
              aria-describedby={invalid.contrasena ? 'password-error' : undefined}
              disabled={busy}
            />
            {invalid.contrasena && (
              <span id="password-error" className="field-error">
                Ingresa tu contraseña.
              </span>
            )}
          </label>
          <div className="actions">
            <button disabled={busy} type="submit">
              {busy ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>
          <a className="caption" href="#/instalacion">
            Configurar el primer administrador
          </a>
        </form>
      </section>
    </main>
  );
}
