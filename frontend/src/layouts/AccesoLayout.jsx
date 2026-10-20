export default function AccesoLayout({ children, etiqueta = 'Acceso a SAGE' }) {
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
      <section className="login-area" aria-label={etiqueta}>
        {children}
      </section>
    </main>
  );
}
