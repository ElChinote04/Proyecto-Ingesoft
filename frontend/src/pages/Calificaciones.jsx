import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import TablaDatos from '../components/TablaDatos';
import CalificarAlumno from '../components/CalificarAlumno';
import EvaluacionesSalon from '../components/EvaluacionesSalon';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';
import { bimestrePorDefecto } from '../utils/planTrabajo';

const SECCION = 'Gestión Académica';
const PASO = 'Calificaciones';

// Se monta solo con un salón elegido, así useResource nunca consulta una ruta incompleta.
function AlumnosDelSalon({ salon, bimestre }) {
  const alumnos = useResource(`/secciones/${salon.id}/alumnos`);
  const [alumnoActivo, setAlumnoActivo] = useState(null);

  if (alumnos.loading) return <Loading>Cargando alumnos…</Loading>;
  if (alumnos.error) return <ResourceError error={alumnos.error} retry={alumnos.retry} />;

  const filas = alumnos.data.map((alumno) => ({
    id: alumno.matriculaId,
    celdas: [
      alumno.nombre,
      alumno.codigo,
      <button
        key="calificar"
        type="button"
        aria-label={`Calificar a ${alumno.nombre}`}
        onClick={() => setAlumnoActivo(alumno)}
      >
        Calificar
      </button>,
    ],
  }));

  return (
    <>
      <TablaDatos
        columnas={['Estudiante', 'Código', 'Acción']}
        filas={filas}
        vacio="Este salón todavía no tiene alumnos matriculados."
      />
      {alumnoActivo && (
        <CalificarAlumno
          alumno={alumnoActivo}
          salon={salon}
          bimestre={bimestre}
          onClose={() => setAlumnoActivo(null)}
        />
      )}
    </>
  );
}

export default function Calificaciones() {
  const salones = useResource('/secciones');
  const bimestres = useResource('/bimestres');
  const [salonElegido, setSalonElegido] = useState('');
  const [bimestreElegido, setBimestreElegido] = useState('');
  const [verEvaluaciones, setVerEvaluaciones] = useState(false);

  if (salones.loading)
    return (
      <AppLayout section={SECCION} step={PASO}>
        <Loading>Cargando tus salones…</Loading>
      </AppLayout>
    );
  if (salones.error)
    return (
      <AppLayout section={SECCION} step={PASO}>
        <ResourceError error={salones.error} retry={salones.retry} />
      </AppLayout>
    );

  const lista = salones.data;
  // Con un solo salón asignado no hay nada que elegir: se abre directamente.
  const salonId = salonElegido || (lista.length === 1 ? String(lista[0].id) : '');
  const salon = lista.find((item) => String(item.id) === salonId);
  const delAnio = (bimestres.data ?? []).filter(
    (item) => salon && item.anioAcademicoId === salon.anioAcademicoId,
  );
  const bimestre =
    delAnio.find((item) => String(item.id) === bimestreElegido) ??
    (delAnio.length ? bimestrePorDefecto(delAnio) : null);

  return (
    <AppLayout section={SECCION} step={PASO} anioAcademico={lista[0]?.anioAcademico}>
      <div className="page-heading">
        <h1>Calificaciones</h1>
        <p className="muted">
          Crea las evaluaciones del bimestre y registra la nota de cada alumno con su examen
          corregido. La letra la calcula el sistema con la escala del colegio.
        </p>
      </div>
      {!lista.length ? (
        <Feedback intent="info" title="Sin salones asignados">
          Todavía no tienes salones asignados en el año académico activo.
        </Feedback>
      ) : (
        <>
          <div className="card grade-context">
            <label className="field">
              Salón
              <select value={salonId} onChange={(event) => setSalonElegido(event.target.value)}>
                <option value="" disabled>
                  Seleccionar salón
                </option>
                {lista.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
            {salon && (
              <label className="field">
                Bimestre
                <select
                  value={bimestre?.id ?? ''}
                  disabled={!delAnio.length}
                  onChange={(event) => setBimestreElegido(event.target.value)}
                >
                  {!delAnio.length && <option value="">Sin bimestres</option>}
                  {delAnio.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {salon && bimestre && (
              <div className="grade-context-action">
                <button type="button" onClick={() => setVerEvaluaciones(true)}>
                  Evaluaciones del bimestre
                </button>
              </div>
            )}
          </div>
          {bimestres.error && <ResourceError error={bimestres.error} retry={bimestres.retry} />}
          {salon && bimestre && (
            <AlumnosDelSalon key={`${salon.id}-${bimestre.id}`} salon={salon} bimestre={bimestre} />
          )}
          {verEvaluaciones && salon && bimestre && (
            <EvaluacionesSalon
              salon={salon}
              bimestre={bimestre}
              onClose={() => setVerEvaluaciones(false)}
            />
          )}
        </>
      )}
    </AppLayout>
  );
}
