import { useState } from 'react';
import { AdminForm, Field, Select } from './AdminForm';
import TablaDatos from './TablaDatos';
import ConfirmarAccion from './ConfirmarAccion';
import { api } from '../api/client';

export function VincularApoderado({ catalogos, estudiantes, onSaved }) {
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const totalPaginas = Math.max(1, Math.ceil(catalogos.vinculos.length / limite));
  const paginaActual = Math.min(pagina, totalPaginas);
  return (
    <>
      <AdminForm
        title="Vincular apoderado y estudiante"
        submit="Guardar vínculo"
        onSave={async (form) => {
          await api('/admin/apoderados/estudiantes', {
            method: 'PUT',
            body: {
              apoderadoId: Number(form.get('apoderadoId')),
              estudianteId: Number(form.get('estudianteId')),
              parentesco: form.get('parentesco'),
              activo: form.get('activo') === 'true',
            },
          });
          onSaved();
          return 'Vínculo actualizado. El apoderado puede consultar únicamente a sus estudiantes vinculados.';
        }}
      >
        <Select
          label="Apoderado"
          name="apoderadoId"
          items={catalogos.apoderados.map((apoderado) => ({
            id: apoderado.id,
            label: apoderado.nombre,
          }))}
        />
        <Select
          label="Estudiante"
          name="estudianteId"
          items={estudiantes.map((estudiante) => ({
            id: estudiante.id,
            label: `${estudiante.nombres} ${estudiante.apellidos}`,
          }))}
        />
        <Field label="Parentesco" name="parentesco" maxLength={50} />
        <Select
          label="Estado del vínculo"
          name="activo"
          items={[
            { id: 'true', label: 'Activo' },
            { id: 'false', label: 'Inactivo' },
          ]}
        />
      </AdminForm>
      <TablaDatos
        columnas={['Apoderado', 'Estudiante', 'Parentesco', 'Estado']}
        filas={catalogos.vinculos
          .slice((paginaActual - 1) * limite, paginaActual * limite)
          .map((vinculo) => {
            const estudiante = estudiantes.find((item) => item.id === vinculo.estudianteId);
            return {
              id: `${vinculo.apoderadoId}-${vinculo.estudianteId}`,
              celdas: [
                catalogos.apoderados.find((item) => item.id === vinculo.apoderadoId)?.nombre ??
                  'Apoderado inactivo',
                estudiante
                  ? `${estudiante.nombres} ${estudiante.apellidos}`
                  : `Estudiante #${vinculo.estudianteId}`,
                vinculo.parentesco,
                vinculo.activo ? 'Activo' : 'Inactivo',
              ],
            };
          })}
      />
      <div className="pagination">
        <label>
          Filas por página{' '}
          <select
            value={limite}
            onChange={(e) => {
              setLimite(Number(e.target.value));
              setPagina(1);
            }}
          >
            {[10, 25, 50].map((cantidad) => (
              <option key={cantidad}>{cantidad}</option>
            ))}
          </select>
        </label>
        <span>
          Página {paginaActual} de {totalPaginas}
        </span>
        <button
          className="secondary"
          disabled={paginaActual === 1}
          onClick={() => setPagina(paginaActual - 1)}
        >
          Anterior
        </button>
        <button
          className="secondary"
          disabled={paginaActual === totalPaginas}
          onClick={() => setPagina(paginaActual + 1)}
        >
          Siguiente
        </button>
      </div>
    </>
  );
}

export function AdministrarAnio({ anios, onSaved }) {
  const [seleccion, setSeleccion] = useState(null);
  return (
    <section className="portal-historial">
      <h2>Año académico activo</h2>
      <p className="muted">
        Los horarios personales muestran las asignaciones del año activo. Los demás años se
        conservan para consulta.
      </p>
      <TablaDatos
        columnas={['Año académico', 'Estado', 'Acción']}
        filas={anios.map((anio) => ({
          id: anio.id,
          celdas: [
            anio.codigo,
            anio.activo ? 'Activo' : 'Solo consulta',
            <button
              key="activar"
              className="secondary"
              disabled={anio.activo}
              onClick={() => setSeleccion(anio)}
            >
              Activar año
            </button>,
          ],
        }))}
      />
      {seleccion && (
        <ConfirmarAccion
          titulo="Activar año académico"
          confirmar="Activar año"
          onClose={() => setSeleccion(null)}
          onConfirm={async () => {
            await api(`/admin/anios/${seleccion.id}/activacion`, { method: 'PUT' });
            onSaved();
          }}
        >
          Se activará {seleccion.codigo}. Los usuarios verán automáticamente los horarios
          correspondientes a ese año.
        </ConfirmarAccion>
      )}
    </section>
  );
}
