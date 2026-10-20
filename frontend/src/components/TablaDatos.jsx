export default function TablaDatos({ columnas, filas, vacio = 'No se encontraron registros.' }) {
  return (
    <div className="table-card portal-table">
      <table>
        <thead>
          <tr>
            {columnas.map((columna) => (
              <th key={columna} scope="col">
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length ? (
            filas.map((fila) => (
              <tr key={fila.id}>
                {fila.celdas.map((celda, indice) => (
                  <td key={columnas[indice]}>{celda}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columnas.length} className="muted">
                {vacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
