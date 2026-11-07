import { useState } from 'react';
import { Feedback } from './Feedback';
import { normalizeUserField, userFieldRules } from '../utils/userValidation.js';

export function Field({
  label,
  name,
  type = 'text',
  required = true,
  validationMessage,
  ...props
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && (
          <span className="required-mark" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        onInvalid={(event) => {
          if (validationMessage) event.target.setCustomValidity(validationMessage);
        }}
        onInput={(event) => event.target.setCustomValidity('')}
        {...props}
      />
    </label>
  );
}
export function Select({ label, name, items, ...props }) {
  return (
    <label className="field">
      <span>
        {label}
        <span className="required-mark" aria-hidden="true">
          {' '}
          *
        </span>
      </span>
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
export function UserField({ name, ...props }) {
  const rule = userFieldRules[name];
  return (
    <Field
      name={name}
      maxLength={rule.maxLength}
      pattern={name === 'identificador' ? undefined : rule.pattern.source}
      title={rule.message}
      validationMessage={rule.message}
      onBlur={(event) => {
        event.target.value = normalizeUserField(name, event.target.value);
        event.target.setCustomValidity('');
      }}
      {...props}
    />
  );
}
export function PersonFields({ userAccount = false }) {
  if (userAccount)
    return (
      <>
        <UserField
          label="DNI (exactamente 8 dígitos)"
          name="numeroDocumento"
          inputMode="numeric"
          minLength={8}
        />
        <UserField label="Nombres" name="nombres" autoComplete="given-name" />
        <UserField label="Apellidos" name="apellidos" autoComplete="family-name" />
      </>
    );
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
