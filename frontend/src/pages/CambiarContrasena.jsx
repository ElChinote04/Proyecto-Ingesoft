import AppLayout from '../layouts/AppLayout';
import AccesoLayout from '../layouts/AccesoLayout';
import { useEffect, useState } from 'react';
import { Feedback } from '../components/Feedback';
import { AdminForm, Field } from '../components/AdminForm';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function CambiarContrasena() {
  const { user, logout } = useAuth();
  const [errorSalida, setErrorSalida] = useState('');
  const [saliendo, setSaliendo] = useState(false);
  useEffect(() => {
    document.title = 'SAGE | Cambiar contraseña';
  }, []);
  const contenido = (
    <>
      <div className="page-heading">
        <h1>Cambiar contraseña</h1>
        <p className="muted">
          {user.requiereCambioContrasena
            ? 'Para continuar, reemplaza la contraseña inicial que te entregó la administración.'
            : 'Al cambiar tu contraseña se cerrarán tus sesiones abiertas.'}
        </p>
      </div>
      <AdminForm
        title="Nueva contraseña"
        submit="Cambiar contraseña"
        reset={false}
        onSave={async (form) => {
          if (form.get('nuevaContrasena') !== form.get('confirmacion'))
            throw new Error('Las contraseñas nuevas no coinciden.');
          await api('/auth/contrasena', {
            method: 'PUT',
            body: {
              contrasenaActual: form.get('contrasenaActual'),
              nuevaContrasena: form.get('nuevaContrasena'),
            },
          });
          await logout();
        }}
      >
        <Field
          label="Contraseña actual"
          name="contrasenaActual"
          type="password"
          autoComplete="current-password"
        />
        <Field
          label="Nueva contraseña (mínimo 10 caracteres)"
          name="nuevaContrasena"
          type="password"
          minLength={10}
          autoComplete="new-password"
        />
        <Field
          label="Repetir nueva contraseña"
          name="confirmacion"
          type="password"
          minLength={10}
          autoComplete="new-password"
        />
      </AdminForm>
    </>
  );
  return user.requiereCambioContrasena ? (
    <AccesoLayout etiqueta="Cambiar contraseña inicial">
      <div className="password-card">
        <p className="caption">{user.identificador}</p>
        {contenido}
        {errorSalida && <Feedback>{errorSalida}</Feedback>}
        <button
          className="text-button"
          disabled={saliendo}
          onClick={async () => {
            setSaliendo(true);
            try {
              await logout();
            } catch (error) {
              setErrorSalida(error.message);
            } finally {
              setSaliendo(false);
            }
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </AccesoLayout>
  ) : (
    <AppLayout section="Seguridad" step="Cambiar contraseña">
      {contenido}
    </AppLayout>
  );
}
