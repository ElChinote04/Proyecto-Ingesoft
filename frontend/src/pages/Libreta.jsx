import { useEffect, useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import DocumentoLibreta from '../components/DocumentoLibreta';
import { Feedback, Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';

const TIPOS = [
  { id: 'BIMESTRAL', etiqueta: 'Bimestral' },
  { id: 'ANUAL', etiqueta: 'Anual' },
];

function nombreDelArchivo({ matricula, estudiante }) {
  const apellidos = estudiante.apellidosNombres
    .split(',')[0]
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-');
  return `Libreta-${matricula.anioAcademico}-${apellidos}`;
}

// El navegador propone el título de la pestaña como nombre del PDF.
function useTituloAlImprimir(titulo) {
  useEffect(() => {
    if (!titulo) return undefined;
    let tituloPantalla = document.title;
    const antes = () => {
      tituloPantalla = document.title;
      document.title = titulo;
    };
    const despues = () => {
      document.title = tituloPantalla;
    };
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', despues);
    return () => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', despues);
    };
  }, [titulo]);
}

function AvisoDeLibreta({ esAnual, totalPeriodos, totalPublicados, periodo }) {
  if (!esAnual && !periodo?.publicado)
    return (
      <Feedback intent="info" title="Bimestre no publicado">
        La libreta de este bimestre todavía no fue publicada.
      </Feedback>
    );
  if (esAnual && !totalPublicados)
    return (
      <Feedback intent="info" title="Todavía no hay bimestres publicados">
        El informe anual se muestra desde que se publica el primer bimestre.
      </Feedback>
    );
  if (esAnual && totalPublicados < totalPeriodos)
    return (
      <Feedback intent="info" title="Informe en progreso">
        {totalPublicados} de {totalPeriodos} bimestres publicados. Las calificaciones anuales
        aparecen al publicar el último.
      </Feedback>
    );
  return null;
}

function ConsultaLibreta({ matriculaId, controles }) {
  const libreta = useResource(`/libretas/${matriculaId}`);
  const [tipo, setTipo] = useState('BIMESTRAL');
  const [periodoId, setPeriodoId] = useState(null);
  useTituloAlImprimir(libreta.data ? nombreDelArchivo(libreta.data) : null);

  if (libreta.loading || libreta.error)
    return (
      <>
        <div className="libreta-controles">{controles}</div>
        {libreta.loading ? <Loading>Cargando libreta…</Loading> : <ResourceError {...libreta} />}
      </>
    );

  const { periodos } = libreta.data;
  const publicados = periodos.filter(({ publicado }) => publicado);
  const periodo =
    periodos.find(({ id }) => id === periodoId) ?? publicados.at(-1) ?? periodos[0] ?? null;
  const esAnual = tipo === 'ANUAL';
  const hayDocumento = esAnual ? publicados.length > 0 : Boolean(periodo?.publicado);

  return (
    <>
      <div className="libreta-controles">
        {controles}
        <fieldset className="libreta-tipo">
          <legend>Tipo de libreta</legend>
          <div>
            {TIPOS.map(({ id, etiqueta }) => (
              <label key={id}>
                <input
                  type="radio"
                  name="tipo-libreta"
                  value={id}
                  checked={tipo === id}
                  onChange={() => setTipo(id)}
                />
                {etiqueta}
              </label>
            ))}
          </div>
        </fieldset>
        {!esAnual && periodo && (
          <label className="field">
            Bimestre
            <select
              value={periodo.id}
              onChange={(event) => setPeriodoId(Number(event.target.value))}
            >
              {periodos.map(({ id, nombre, publicado }) => (
                <option key={id} value={id}>
                  {publicado ? nombre : `${nombre} (no publicado)`}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" disabled={!hayDocumento} onClick={() => window.print()}>
          Imprimir o guardar PDF
        </button>
      </div>
      <div className="libreta-avisos">
        <AvisoDeLibreta
          esAnual={esAnual}
          totalPeriodos={periodos.length}
          totalPublicados={publicados.length}
          periodo={periodo}
        />
      </div>
      {hayDocumento && (
        <DocumentoLibreta libreta={libreta.data} periodo={esAnual ? null : periodo} />
      )}
    </>
  );
}

export default function Libreta() {
  const estudiantes = useResource('/libretas');
  const [estudianteId, setEstudianteId] = useState(null);
  const [matriculaId, setMatriculaId] = useState(null);
  const lista = estudiantes.data ?? [];
  const estudiante = lista.find(({ id }) => id === estudianteId) ?? lista[0];
  const matriculas = estudiante?.matriculas ?? [];
  const matricula =
    matriculas.find(({ id }) => id === matriculaId) ??
    matriculas.find(({ activa }) => activa) ??
    matriculas[0];

  const controles = (
    <>
      {lista.length > 1 && (
        <label className="field">
          Consultar estudiante
          <select
            value={estudiante.id}
            onChange={(event) => {
              setEstudianteId(Number(event.target.value));
              setMatriculaId(null);
            }}
          >
            {lista.map(({ id, nombre }) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {matriculas.length > 1 && (
        <label className="field">
          Año académico
          <select
            value={matricula.id}
            onChange={(event) => setMatriculaId(Number(event.target.value))}
          >
            {matriculas.map(({ id, anioAcademico, activa }) => (
              <option key={id} value={id}>
                {activa ? anioAcademico : `${anioAcademico} (matrícula inactiva)`}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );

  return (
    <AppLayout section="Mis evaluaciones" step="Libreta" anioAcademico={matricula?.anioAcademico}>
      <div className="page-heading">
        <h1>Libreta de notas</h1>
        <p className="muted">
          {matricula
            ? `${estudiante.nombre} · ${matricula.seccion}. Información visible únicamente para el alumno y su apoderado.`
            : 'Información visible únicamente para el alumno y su apoderado.'}
        </p>
      </div>
      {estudiantes.loading && <Loading>Cargando libreta…</Loading>}
      {estudiantes.error && <ResourceError {...estudiantes} />}
      {estudiantes.data && !matricula && (
        <Feedback intent="info" title="Libreta no disponible">
          Todavía no hay una matrícula asociada a este perfil.
        </Feedback>
      )}
      {matricula && (
        <ConsultaLibreta key={matricula.id} matriculaId={matricula.id} controles={controles} />
      )}
    </AppLayout>
  );
}
