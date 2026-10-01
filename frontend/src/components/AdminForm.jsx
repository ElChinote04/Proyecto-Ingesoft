import { useState } from 'react';
import { Feedback } from './Feedback';

export function Field({ label, name, type = 'text', required = true, ...props }) {
  return (
    <label className="field">
      {label}
      <input name={name} type={type} required={required} {...props} />
    </label>
  );
}
export function Select({ label, name, items, ...props }) {
  return (
    <label className="field">
      {label}
      <select
        name={name}
        required
        {...(props.value === undefined ? { defaultValue: '' } : {})}
        {...props}
      >
        <option value="" disabled>
          Seleccionar…
        </option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function PersonFields() {
  return (
    <>
      <Field label="Documento de identidad" name="numeroDocumento" maxLength={30} />
      <Field label="Nombres" name="nombres" maxLength={100} />
      <Field label="Apellidos" name="apellidos" maxLength={100} />
    </>
  );
}
export function AdminForm({ title, children, submit = 'Guardar', onSave, reset = true, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setSuccess('');
    setBusy(true);
    try {
      const message = await onSave(new FormData(form));
      if (reset) form.reset();
      setSuccess(message || 'Guardado correctamente.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card admin-form" onSubmit={save}>
      <h2>{title}</h2>
      {error && (
        <Feedback title={error.message}>
          {error.details?.map((d, i) => (
            <p key={i}>{d.mensaje}</p>
          ))}
        </Feedback>
      )}
      {success && <Feedback intent="success">{success}</Feedback>}
      <fieldset disabled={busy}>
        <div className="form-grid">{children}</div>
        <div className="actions">
          {onCancel && (
            <button type="button" className="secondary" onClick={onCancel}>
              Cancelar edición
            </button>
          )}
          <button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : submit}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
