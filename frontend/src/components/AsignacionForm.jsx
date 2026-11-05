import { useEffect, useState } from 'react';
import { AdminForm, Field, Select } from './AdminForm';
import { Feedback } from './Feedback';
import { api } from '../api/client';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const CAMPOS_ID = ['cursoId', 'seccionId', 'docenteId', 'aulaId', 'diaSemana'];
const VACIO = {
  cursoId: '',
  seccionId: '',
  docenteId: '',
  aulaId: '',
  diaSemana: '',
  horaInicio: '',
  horaFin: '',
};

export default function AsignacionForm({ catalogos, bloque, onSaved, onCancel, actions }) {
  const [datos, setDatos] = useState(() =>
    bloque
      ? {
          cursoId: bloque.asignacion.cursoId,
          seccionId: bloque.asignacion.seccionId,
          docenteId: bloque.asignacion.docenteId,
          aulaId: bloque.aulaId,
          diaSemana: bloque.diaSemana,
          horaInicio: bloque.horaInicio,
          horaFin: bloque.horaFin,
        }
      : VACIO,
  );
  const [estado, setEstado] = useState(null);
  const [intento, setIntento] = useState(0);
  const body = { ...datos };
  for (const campo of CAMPOS_ID) body[campo] = Number(body[campo]);
  const horaValida = (hora) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
  const completo =
    CAMPOS_ID.every((campo) => Number.isInteger(body[campo]) && body[campo] > 0) &&
    horaValida(body.horaInicio) &&
    horaValida(body.horaFin);
  const intervaloValido = body.horaInicio < body.horaFin;
  const consulta =
    completo && intervaloValido
      ? JSON.stringify({ ...body, ...(bloque && { bloqueId: bloque.id }) })
      : '';

  useEffect(() => {
    if (!consulta) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        await api('/admin/bloques/validar', {
          method: 'POST',
          body: JSON.parse(consulta),
          signal: abort.signal,
        });
        if (!abort.signal.aborted) setEstado({ consulta, disponible: true });
      } catch (error) {
        if (!abort.signal.aborted) setEstado({ consulta, disponible: false, error });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [consulta, intento]);

  const actual = estado?.consulta === consulta ? estado : null;
  const cambiar = (evento) => {
    if (String(datos[evento.target.name]) === evento.target.value) return;
    setEstado(null);
    setDatos((previo) => ({ ...previo, [evento.target.name]: evento.target.value }));
  };
  const campo = (name) => ({ name, value: datos[name], onChange: cambiar });
  return (
    <AdminForm
      title={bloque ? 'Editar asignación' : 'Nueva asignación horaria'}
      submit={bloque ? 'Guardar cambios' : 'Guardar asignación'}
      reset={false}
      onCancel={onCancel}
      actions={actions}
      submitDisabled={!consulta || !actual?.disponible}
      onSave={async () => {
        if (!consulta || !actual?.disponible)
          throw new Error('Completa los datos y espera la comprobación de cruces.');
        const guardado = await api(bloque ? `/admin/bloques/${bloque.id}` : '/admin/bloques', {
          method: bloque ? 'PUT' : 'POST',
          body,
        });
        if (!bloque) {
          setDatos(VACIO);
          setEstado(null);
        }
        onSaved();
        return bloque
          ? 'Asignación actualizada.'
          : `Bloque #${guardado.id} asignado. Crea una sesión con fecha para tomar asistencia.`;
      }}
    >
      <Select
        label="Año / grado / sección"
        {...campo('seccionId')}
        items={catalogos.secciones
          .filter((s) => s.anioAcademico.activo)
          .map((s) => ({
            id: s.id,
            label: `${s.anioAcademico.codigo} · ${s.grado.nombre} ${s.nombre}`,
          }))}
      />
      <Select
        label="Curso"
        {...campo('cursoId')}
        items={catalogos.cursos.map((c) => ({ id: c.id, label: c.nombre }))}
      />
      <Select
        label="Docente"
        {...campo('docenteId')}
        items={catalogos.docentes.map((d) => ({ id: d.id, label: d.nombre }))}
      />
      <Select
        label="Aula"
        {...campo('aulaId')}
        items={catalogos.aulas.map((a) => ({ id: a.id, label: a.codigo }))}
      />
      <Select
        label="Día de la semana"
        {...campo('diaSemana')}
        items={DIAS.map((d, i) => ({ id: i + 1, label: d }))}
      />
      <Field label="Hora de inicio" type="time" {...campo('horaInicio')} />
      <Field label="Hora de fin" type="time" {...campo('horaFin')} />
      <div className="form-wide" aria-live="polite">
        {completo && !intervaloValido && (
          <Feedback>La hora final debe ser posterior a la inicial.</Feedback>
        )}
        {consulta && !actual && <Feedback intent="info">Comprobando cruces…</Feedback>}
        {consulta && actual?.disponible && (
          <Feedback intent="success">Sin cruces detectados.</Feedback>
        )}
        {consulta && actual?.error && <Feedback>{actual.error.message}</Feedback>}
        {consulta && actual?.error && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEstado(null);
              setIntento((i) => i + 1);
            }}
          >
            Volver a comprobar
          </button>
        )}
      </div>
      {bloque && (
        <p className="muted form-wide">
          Las asignaciones con sesiones de clase conservan su historial. Puedes retirarlas y crear
          otra asignación.
        </p>
      )}
    </AdminForm>
  );
}
