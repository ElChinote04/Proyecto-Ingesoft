import { api } from '../api/client';
import { useAdminData } from '../hooks/useAdminData';
import { AdminForm, Field, Select } from '../components/AdminForm';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { statuses } from '../utils/format';
import TeacherHistory from './TeacherHistory';

export default function TeacherAttendance() {
  const { data, error, retry } = useAdminData('catalogos');

  if (error) {
    return <ResourceError error={error} retry={retry} />;
  }

  if (!data) {
    return <Loading>Cargando docentes...</Loading>;
  }

  const [catalogos] = data;
  const docentes = catalogos.docentes ?? [];

  if (!docentes.length) {
    return (
      <Feedback intent="info" title="Sin docentes">
        No hay docentes disponibles para registrar asistencia.
      </Feedback>
    );
  }

  async function guardar(form) {
    const docenteId = Number(form.get('docenteId'));
    const fecha = form.get('fecha');
    const condicion = form.get('condicion');
    const observacion = String(form.get('observacion') ?? '');

    const resultado = await api(
      `/asistencias/docentes/${docenteId}/dias/${fecha}`,
      {
        method: 'PUT',
        body: { condicion, observacion },
      }
    );

    return `Asistencia registrada: ${resultado.condicion}.`;
  }

  return (
  <>
    <AdminForm
      title="Registro de asistencia docente"
      submit="Guardar asistencia"
      reset={false}
      onSave={guardar}
    >
      <Select
        label="Docente"
        name="docenteId"
        items={docentes.map((d) => ({
          id: d.id,
          label: d.nombre,
        }))}
      />

      <Field
        label="Fecha"
        name="fecha"
        type="date"
      />

      <Select
        label="Estado de asistencia"
        name="condicion"
        items={statuses.map(([value, label]) => ({
          id: value,
          label,
        }))}
      />

      <Field
        label="Observación"
        name="observacion"
        required={false}
        maxLength={300}
        placeholder="Opcional"
      />
        </AdminForm>

    <TeacherHistory docentes={docentes} />
  </>
  );
}