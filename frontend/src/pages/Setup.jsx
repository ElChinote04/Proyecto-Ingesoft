import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { AdminForm, Field, PersonFields } from '../components/AdminForm';
import { Feedback, Loading, ResourceError } from '../components/Feedback';

export default function Setup() {
  useEffect(() => {
    document.title = 'SAGE | Configurar el colegio';
  }, []);
  const resource = useResource('/instalacion');
  const [created, setCreated] = useState(false);
  return (
    <main className="setup-page">
      <div className="brand">SAGE</div>
      <h1>Configurar el colegio</h1>
      <p className="muted">Crea la primera cuenta de administrador para comenzar.</p>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ResourceError {...resource} />
      ) : created || !resource.data.requerido ? (
        <div className="card stack">
          <Feedback intent="success">
            El sistema ya tiene administrador. Puedes iniciar sesión.
          </Feedback>
          <a className="button-link" href="#/login">
            Ir a iniciar sesión
          </a>
        </div>
      ) : (
        <AdminForm
          title="Administrador inicial"
          submit="Crear administrador"
          onSave={async (form) => {
            await api('/instalacion', { method: 'POST', body: Object.fromEntries(form) });
            setCreated(true);
          }}
        >
          <PersonFields />
          <Field
            label="Usuario o correo"
            name="identificador"
            autoComplete="username"
            maxLength={200}
          />
          <Field
            label="Contraseña (mínimo 10 caracteres)"
            name="contrasena"
            type="password"
            minLength={10}
            autoComplete="new-password"
          />
          {resource.data.requiereClave && (
            <>
              <Field
                label="Clave de instalación"
                name="claveInstalacion"
                type="password"
                autoComplete="off"
              />
              <p className="muted form-wide">
                Esta instalación requiere una clave. Solicítala al responsable del servidor. Solo se
                utiliza para crear esta primera cuenta.
              </p>
            </>
          )}
        </AdminForm>
      )}
    </main>
  );
}
