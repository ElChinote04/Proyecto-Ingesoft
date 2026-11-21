import { useEffect, useRef, useState } from 'react';
import AsignacionForm from './AsignacionForm';
import ConfirmarAccion from './ConfirmarAccion';
import { api } from '../api/client';

export default function GestionBloques({ catalogos, bloque, onSaved, onClose }) {
  const dialogo = useRef(null);
  const [eliminacion, setEliminacion] = useState(false);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialogo}
      className="schedule-edit-dialog"
      aria-label="Editar asignación"
      onClick={(evento) => {
        if (evento.target !== evento.currentTarget || eliminacion) return;
        const limites = evento.currentTarget.getBoundingClientRect();
        const fuera =
          evento.clientX < limites.left ||
          evento.clientX > limites.right ||
          evento.clientY < limites.top ||
          evento.clientY > limites.bottom;
        if (fuera && !dialogo.current.querySelector('fieldset')?.disabled) onClose();
      }}
      onCancel={(evento) => {
        evento.preventDefault();
        if (!dialogo.current.querySelector('fieldset')?.disabled) onClose();
      }}
    >
      <AsignacionForm
        key={bloque.id}
        catalogos={catalogos}
        bloque={bloque}
        onCancel={onClose}
        onSaved={() => {
          onSaved();
          onClose();
        }}
        actions={
          <button type="button" className="destructive" onClick={() => setEliminacion(true)}>
            Retirar asignación
          </button>
        }
      />
      {eliminacion && (
        <ConfirmarAccion
          titulo="Retirar asignación"
          confirmar="Retirar asignación"
          onClose={() => setEliminacion(false)}
          onConfirm={async () => {
            await api(`/admin/bloques/${bloque.id}`, { method: 'DELETE' });
            onSaved();
            onClose();
          }}
        >
          La asignación dejará de aparecer en los horarios vigentes. Se conservarán sus sesiones y
          asistencias anteriores.
        </ConfirmarAccion>
      )}
    </dialog>
  );
}
