import { useState } from 'react';
import AppLayout from '../layouts/AppLayout';
import TablaDatos from '../components/TablaDatos';
import { Loading, ResourceError } from '../components/Feedback';
import { useResource } from '../hooks/useResource';
import { formatTimestamp } from '../utils/format';

const SEVERIDADES = { ERROR: ['Error', 'danger'], ADVERTENCIA: ['Advertencia', 'warning'] };
const SIN_FILTROS = { severidad: '', codigo: '', usuario: '', desde: '', hasta: '' };

export default function LogErrores() {
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const consulta = new URLSearchParams({ pagina, limite });
  for (const [campo, valor] of Object.entries(filtros)) if (valor) consulta.set(campo, valor);
  const errores = useResource(`/errores?${consulta}`);
  const datos = errores.data;
  const cambiarFiltro = (campo) => (e) => {
    setFiltros({ ...filtros, [campo]: e.target.value });
    setPagina(1);
  };
  // Conserva el código elegido aunque la lista aún se esté recargando.
  const codigos = [...new Set([...(datos?.codigos ?? []), filtros.codigo])];

  return (
    <AppLayout section="Log de errores" step="Log de errores">
      <div className="page-heading">
        <h1>Log de errores</h1>
        <p className="muted">
          Errores y advertencias del sistema, del más reciente al más antiguo. Horas de Lima.
        </p>
      </div>
      <div className="auditoria-filtros">
        <label className="field">
          Severidad
          <select value={filtros.severidad} onChange={cambiarFiltro('severidad')}>
            <option value="">Todas</option>
            {Object.entries(SEVERIDADES).map(([valor, [etiqueta]]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Código
          <select value={filtros.codigo} onChange={cambiarFiltro('codigo')}>
            <option value="">Todos</option>
            {codigos.filter(Boolean).map((codigo) => (
              <option key={codigo}>{codigo}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Usuario
          <input value={filtros.usuario} onChange={cambiarFiltro('usuario')} />
        </label>
        <label className="field">
          Desde
          <input type="date" value={filtros.desde} onChange={cambiarFiltro('desde')} />
        </label>
        <label className="field">
          Hasta
          <input type="date" value={filtros.hasta} onChange={cambiarFiltro('hasta')} />
        </label>
        <button
          className="secondary"
          onClick={() => {
            setFiltros(SIN_FILTROS);
            setPagina(1);
          }}
        >
          Limpiar filtros
        </button>
      </div>
      {errores.loading && <Loading>Cargando errores…</Loading>}
      {errores.error && <ResourceError {...errores} />}
      {datos && (
        <>
          <TablaDatos
            columnas={[
              'Fecha y hora',
              'Severidad',
              'Módulo',
              'Código',
              'Descripción',
              'Usuario',
              'Request ID',
            ]}
            filas={datos.registros.map((error, indice) => {
              const [etiqueta, color] = SEVERIDADES[error.severidad];
              return {
                id: `${error.fechaHora}-${indice}`,
                celdas: [
                  formatTimestamp(error.fechaHora),
                  <span key="severidad" className={`badge ${color}`}>
                    {etiqueta}
                  </span>,
                  error.modulo,
                  error.codigo,
                  error.descripcion,
                  error.usuario ?? 'Sin sesión',
                  error.requestId ?? '—',
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
              Página {pagina} de {Math.max(1, Math.ceil(datos.total / limite))} · {datos.total}{' '}
              registros
            </span>
            <button
              className="secondary"
              disabled={pagina === 1}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </button>
            <button
              className="secondary"
              disabled={pagina * limite >= datos.total}
              onClick={() => setPagina(pagina + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </AppLayout>
  );
}
