import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useAuth } from '../hooks/useAuth';
import { useHorario } from '../hooks/useHorario';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export default function MiHorario() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState(user.roles.includes('DOCENTE') ? 'DOCENTE' : 'ALUMNO');
  const horario = useHorario(perfil);
  const data = horario.data?.perfil === perfil ? horario.data : null;
  const intervalos = [
    ...new Set(data?.bloques.map((bloque) => `${bloque.horaInicio}–${bloque.horaFin}`) ?? []),
  ].sort();
  const dias = DIAS.slice(
    0,
    Math.max(5, ...(data?.bloques.map((bloque) => bloque.diaSemana) ?? [])),
  );
  const cursos = [...new Set(data?.bloques.map((bloque) => bloque.curso) ?? [])];
  return (
    <AppLayout section="Mi horario" step="Mi horario" anioAcademico={data?.anioAcademico?.codigo}>
      <div className="page-heading">
        <h1>Mi horario semanal</h1>
        <p className="muted">
          {perfil === 'DOCENTE'
            ? 'Consulta tus clases asignadas para el año académico vigente.'
            : 'Consulta el horario vigente de la sección en la que estás matriculado.'}
        </p>
      </div>
      {user.roles.includes('DOCENTE') && user.roles.includes('ALUMNO') && (
        <label className="field horario-perfil">
          Consultar como
          <select value={perfil} onChange={(evento) => setPerfil(evento.target.value)}>
            <option value="DOCENTE">Docente</option>
            <option value="ALUMNO">Alumno</option>
          </select>
        </label>
      )}
      {horario.error && <ResourceError error={horario.error} retry={horario.retry} />}
      {!data && !horario.error && <Loading>Cargando horario…</Loading>}
      {data && (
        <>
          <div className="horario-filters">
            <label className="field">
              Año académico
              <input
                readOnly
                value={
                  data.anioAcademico ? `${data.anioAcademico.codigo} · Activo` : 'Sin año activo'
                }
              />
            </label>
            <label className="field">
              {perfil === 'DOCENTE' ? 'Docente' : 'Sección matriculada'}
              <input
                readOnly
                value={
                  perfil === 'DOCENTE'
                    ? user.nombre
                    : data.secciones?.join(', ') || 'Sin matrícula en el año activo'
                }
              />
            </label>
          </div>
          {!data.bloques.length ? (
            <Feedback intent="info">
              {data.anioAcademico
                ? 'No tienes clases asignadas en el año académico activo.'
                : 'El colegio todavía no ha activado un año académico.'}
            </Feedback>
          ) : (
            <div className="table-card">
              <table className="schedule-matrix horario-personal">
                <caption className="sr-only">
                  Horario semanal · {perfil === 'DOCENTE' ? 'Docente' : 'Alumno'} · Solo lectura
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Hora</th>
                    {dias.map((dia) => (
                      <th scope="col" key={dia}>
                        {dia}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {intervalos.map((intervalo) => (
                    <tr key={intervalo}>
                      <th scope="row">{intervalo}</th>
                      {dias.map((dia, indice) => {
                        const bloques = data.bloques.filter(
                          (bloque) =>
                            `${bloque.horaInicio}–${bloque.horaFin}` === intervalo &&
                            bloque.diaSemana === indice + 1,
                        );
                        return (
                          <td
                            key={dia}
                            className={
                              bloques.length
                                ? `horario-cell horario-tone-${cursos.indexOf(bloques[0].curso) % 3}`
                                : undefined
                            }
                          >
                            {bloques.length ? (
                              bloques.map((bloque) => (
                                <div className="horario-block" key={bloque.id}>
                                  <strong>
                                    {bloque.curso} · {bloque.seccion}
                                  </strong>
                                  <span>
                                    {bloque.docente} · {bloque.aula} · {bloque.horaInicio}–
                                    {bloque.horaFin}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="caption horario-note">
            Solo lectura. Se actualiza automáticamente al consultar esta pantalla.
          </p>
        </>
      )}
    </AppLayout>
  );
}
