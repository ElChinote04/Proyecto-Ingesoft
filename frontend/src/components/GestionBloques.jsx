import { useState } from 'react';
import { AdminForm, Field, Select } from './AdminForm';
import TablaDatos from './TablaDatos';
import ConfirmarAccion from './ConfirmarAccion';
import { api } from '../api/client';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export default function GestionBloques({ catalogos, bloques, onSaved }) {
  const [edicion, setEdicion] = useState(null);
  const [eliminacion, setEliminacion] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const activos = bloques.filter((bloque) => bloque.activo);
  const paginaActual = Math.min(pagina, Math.max(1, Math.ceil(activos.length / limite)));
  return (
    <section className="portal-historial">
      <h2>Asignaciones registradas</h2>
      <TablaDatos
        columnas={['Curso y sección', 'Día y hora', 'Aula', 'Acciones']}
        filas={activos.slice((paginaActual - 1) * limite, paginaActual * limite).map((bloque) => ({
          id: bloque.id,
          celdas: [
            `${bloque.asignacion.curso.nombre} · ${bloque.asignacion.seccion.grado.nombre} ${bloque.asignacion.seccion.nombre} · ${bloque.asignacion.seccion.anioAcademico.codigo}`,
            `${DIAS[bloque.diaSemana - 1]} ${bloque.horaInicio}–${bloque.horaFin}`,
            bloque.aula.codigo,
            <div key="acciones" className="row-actions">
              <button
                className="secondary"
                disabled={!bloque.asignacion.seccion.anioAcademico.activo}
                onClick={() => setEdicion(bloque)}
              >
                Editar
              </button>
              <button
                className="secondary"
                disabled={!bloque.asignacion.seccion.anioAcademico.activo}
                onClick={() => setEliminacion(bloque)}
              >
                Retirar asignación
              </button>
            </div>,
          ],
        }))}
      />
      <div className="pagination">
        <label>
          Filas por página
          <select
            value={limite}
            onChange={(evento) => {
              setLimite(Number(evento.target.value));
              setPagina(1);
            }}
          >
            {[10, 25, 50].map((valor) => (
              <option key={valor}>{valor}</option>
            ))}
          </select>
        </label>
        <span>
          Página {paginaActual} de {Math.max(1, Math.ceil(activos.length / limite))}
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
          disabled={paginaActual * limite >= activos.length}
          onClick={() => setPagina(paginaActual + 1)}
        >
          Siguiente
        </button>
      </div>
      {edicion && (
        <AdminForm
          key={edicion.id}
          title="Editar asignación"
          submit="Guardar cambios"
          reset={false}
          onCancel={() => setEdicion(null)}
          onSave={async (form) => {
            const body = Object.fromEntries(form);
            for (const nombre of ['cursoId', 'seccionId', 'docenteId', 'aulaId', 'diaSemana'])
              body[nombre] = Number(body[nombre]);
            await api(`/admin/bloques/${edicion.id}`, { method: 'PUT', body });
            onSaved();
            return 'Asignación actualizada. Los horarios personales reflejarán el cambio automáticamente.';
          }}
        >
          <Select
            label="Curso"
            name="cursoId"
            defaultValue={edicion.asignacion.cursoId}
            items={catalogos.cursos.map((curso) => ({ id: curso.id, label: curso.nombre }))}
          />
          <Select
            label="Sección"
            name="seccionId"
            defaultValue={edicion.asignacion.seccionId}
            items={catalogos.secciones
              .filter((seccion) => seccion.anioAcademico.activo)
              .map((seccion) => ({
                id: seccion.id,
                label: `${seccion.grado.nombre} ${seccion.nombre}`,
              }))}
          />
          <Select
            label="Docente"
            name="docenteId"
            defaultValue={edicion.asignacion.docenteId}
            items={catalogos.docentes.map((docente) => ({ id: docente.id, label: docente.nombre }))}
          />
          <Select
            label="Aula"
            name="aulaId"
            defaultValue={edicion.aulaId}
            items={catalogos.aulas.map((aula) => ({ id: aula.id, label: aula.codigo }))}
          />
          <Select
            label="Día"
            name="diaSemana"
            defaultValue={edicion.diaSemana}
            items={DIAS.map((dia, indice) => ({ id: indice + 1, label: dia }))}
          />
          <Field
            label="Hora de inicio"
            name="horaInicio"
            type="time"
            defaultValue={edicion.horaInicio}
          />
          <Field label="Hora de fin" name="horaFin" type="time" defaultValue={edicion.horaFin} />
          <p className="muted form-wide">
            Si la asignación ya tiene sesiones de clase, crea un bloque nuevo para conservar el
            historial.
          </p>
        </AdminForm>
      )}
      {eliminacion && (
        <ConfirmarAccion
          titulo="Retirar asignación"
          confirmar="Retirar asignación"
          onClose={() => setEliminacion(null)}
          onConfirm={async () => {
            await api(`/admin/bloques/${eliminacion.id}`, { method: 'DELETE' });
            onSaved();
          }}
        >
          La asignación dejará de aparecer en los horarios vigentes. Se conservarán sus sesiones y
          asistencias anteriores.
        </ConfirmarAccion>
      )}
    </section>
  );
}
