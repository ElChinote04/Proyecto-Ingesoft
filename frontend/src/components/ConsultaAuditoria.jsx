import { Fragment, useState } from 'react';
import TablaDatos from './TablaDatos';
import { Loading, ResourceError } from './Feedback';
import { useResource } from '../hooks/useResource';
import { formatTimestamp } from '../utils/format';

const RESULTADOS = {
  EXITO: ['Éxito', 'success'],
  DENEGADO: ['Denegado', 'danger'],
  FALLO: ['Fallido', 'warning'],
};
// El módulo de notas registra sus éxitos como 'EXITOSO'; se muestra igual que 'EXITO'.
const ETIQUETAS_RESULTADO = { ...RESULTADOS, EXITOSO: RESULTADOS.EXITO };
const SIN_FILTROS = { tipoEvento: '', resultado: '', desde: '', hasta: '' };

const ETIQUETAS_CAMPO = {
  apoderadoId: 'Apoderado',
  estudianteId: 'Estudiante',
  competenciaId: 'Competencia',
  nivelLogro: 'Nivel de logro',
  conclusionDescriptiva: 'Conclusión descriptiva',
};
const etiquetaCampo = (campo) => {
  if (ETIQUETAS_CAMPO[campo]) return ETIQUETAS_CAMPO[campo];
  const texto = campo.replace(/([A-Z])/g, ' $1').toLowerCase();
  return texto[0].toUpperCase() + texto.slice(1);
};
const esObjeto = (valor) => valor !== null && typeof valor === 'object';
// Algunos eventos guardan un valor suelto, por ejemplo una condición de asistencia.
const comoCampos = (valor) => (esObjeto(valor) ? valor : valor == null ? {} : { valor });

function mostrarValor(valor, campo, nombres) {
  if (valor == null) return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (Array.isArray(valor) && !valor.some(esObjeto)) return valor.join(', ');
  if (esObjeto(valor)) return <ListaCampos datos={valor} nombres={nombres} />;
  if (Object.hasOwn(nombres, campo)) return nombres[campo][valor] ?? `#${valor}`;
  return String(valor);
}

// Con "anterior" muestra lo que cambió como "B → A"; sin él, solo los datos.
function ListaCampos({ datos, anterior, nombres }) {
  const campos = [...new Set([...Object.keys(anterior ?? {}), ...Object.keys(datos)])];
  return (
    <dl className="auditoria-campos">
      {campos.map((campo) => {
        const cambio = anterior && JSON.stringify(anterior[campo]) !== JSON.stringify(datos[campo]);
        return (
          <Fragment key={campo}>
            <dt>{etiquetaCampo(campo)}</dt>
            <dd>
              {cambio && (
                <>
                  {mostrarValor(anterior[campo], campo, nombres)}
                  {' → '}
                </>
              )}
              {mostrarValor(datos[campo], campo, nombres)}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

// Los cambios muestran el valor anterior y el nuevo; el resto, su detalle. El módulo de notas los
// guarda como valorAnterior/valorNuevo y el resto del sistema como anterior/nuevo.
function DetalleEvento({ detalle, nota, nombres }) {
  const anterior = detalle?.anterior ?? detalle?.valorAnterior;
  const nuevo = detalle?.nuevo ?? detalle?.valorNuevo;
  if (anterior !== undefined || nuevo !== undefined)
    return (
      <div className="auditoria-cambio">
        <ListaCampos
          datos={{ ...nota, ...comoCampos(nuevo) }}
          anterior={anterior == null ? undefined : { ...nota, ...comoCampos(anterior) }}
          nombres={nombres}
        />
        {detalle.motivo && <span>Motivo: {detalle.motivo}</span>}
      </div>
    );
  if (!esObjeto(detalle) || Object.keys(detalle).length === 0) return '—';
  return (
    <details>
      <summary>Ver detalle</summary>
      <ListaCampos datos={detalle} nombres={nombres} />
    </details>
  );
}

export default function ConsultaAuditoria() {
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const consulta = new URLSearchParams({ pagina, limite });
  for (const [campo, valor] of Object.entries(filtros)) if (valor) consulta.set(campo, valor);
  const eventos = useResource(`/admin/auditoria?${consulta}`);
  const datos = eventos.data;
  const cambiarFiltro = (campo) => (e) => {
    setFiltros({ ...filtros, [campo]: e.target.value });
    setPagina(1);
  };
  // Conserva el evento elegido aunque la lista aún se esté recargando.
  const tiposEvento = [...new Set([...(datos?.tiposEvento ?? []), filtros.tipoEvento])];

  return (
    <>
      <p className="muted">
        Registro inmutable de las operaciones del sistema, del más reciente al más antiguo. Horas de
        Lima.
      </p>
      <div className="auditoria-filtros">
        <label className="field">
          Tipo de evento
          <select value={filtros.tipoEvento} onChange={cambiarFiltro('tipoEvento')}>
            <option value="">Todos</option>
            {tiposEvento.filter(Boolean).map((tipo) => (
              <option key={tipo}>{tipo}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Resultado
          <select value={filtros.resultado} onChange={cambiarFiltro('resultado')}>
            <option value="">Todos</option>
            {Object.entries(RESULTADOS).map(([valor, [etiqueta]]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
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
      {eventos.loading && <Loading>Cargando auditoría…</Loading>}
      {eventos.error && <ResourceError {...eventos} />}
      {datos && (
        <>
          <TablaDatos
            columnas={['Fecha y hora', 'Usuario', 'Evento', 'Entidad', 'Resultado', 'Detalle']}
            filas={datos.registros.map((evento) => {
              const [etiqueta, color] = ETIQUETAS_RESULTADO[evento.resultado] ?? [
                evento.resultado,
                'info',
              ];
              return {
                id: evento.id,
                celdas: [
                  formatTimestamp(evento.fechaHora),
                  evento.usuario ?? 'Cuenta no identificada',
                  evento.tipoEvento,
                  `${evento.entidad} #${evento.entidadId}`,
                  <span key="resultado" className={`badge ${color}`}>
                    {etiqueta}
                  </span>,
                  <DetalleEvento
                    key="detalle"
                    detalle={evento.detalle}
                    nota={evento.nota}
                    nombres={datos.nombres}
                  />,
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
    </>
  );
}
