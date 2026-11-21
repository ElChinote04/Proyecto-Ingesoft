
import { useState } from 'react';
import { api } from '../api/client';

function IconoExportacion({ formato }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      {formato === 'excel' ? (
        <>
          <path d="M8 13h8M8 17h8M12 11v8" />
        </>
      ) : (
        <>
          <path d="M8 12h8M8 16h6" />
        </>
      )}
    </svg>
  );
}


// Gráficos de asistencias: utilidades locales para evitar crear archivos adicionales.
const coloresGraficos = {
  presentes: '#4ade80',
  tardanzas: '#fde047',
  ausencias: '#f87171',
};

const coloresTextoGraficos = {
  presentes: '#14532d',
  tardanzas: '#713f12',
  ausencias: '#7f1d1d',
};

const seriesGraficos = [
  { clave: 'presentes', nombre: 'Presentes' },
  { clave: 'tardanzas', nombre: 'Tardanzas' },
  { clave: 'ausencias', nombre: 'Ausencias' },
];

function agruparAsistenciasPorFecha(registros, campoEstado) {
  const porFecha = new Map();

  for (const registro of registros) {
    const fecha = String(registro.fecha ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;

    if (!porFecha.has(fecha)) {
      porFecha.set(fecha, { fecha, presentes: 0, tardanzas: 0, ausencias: 0 });
    }

    const grupo = porFecha.get(fecha);
    if (registro[campoEstado] === 'PRESENTE') grupo.presentes += 1;
    if (registro[campoEstado] === 'TARDANZA') grupo.tardanzas += 1;
    if (registro[campoEstado] === 'AUSENTE') grupo.ausencias += 1;
  }

  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function etiquetaGraficoFecha(fecha) {
  const [, mes, dia] = String(fecha).split('-');
  return mes && dia ? `${dia}/${mes}` : fecha;
}

function GraficosAsistencia({ totales, porFecha }) {
  const maxBarras = Math.max(1, totales.presentes, totales.tardanzas, totales.ausencias);
  const pasosBarras = Math.min(4, maxBarras);
  // Gráfico de barras apiladas: útil incluso si el filtro devuelve un único día.
  const totalDia = (dia) => seriesGraficos.reduce((total, serie) => total + dia[serie.clave], 0);
  const maxTotalDia = Math.max(1, ...porFecha.map(totalDia));
  const anchoBarraFecha = 520;
  const altoBarraFecha = porFecha.length === 1 ? 34 : 20;
  const altoFilaFecha = porFecha.length === 1 ? 52 : 32;
  const inicioBarrasFecha = porFecha.length === 1 ? 78 : 48;
  const altoGraficoFecha = Math.max(200, inicioBarrasFecha + porFecha.length * altoFilaFecha + 22);
  const sinDatos = totales.presentes + totales.tardanzas + totales.ausencias === 0;

  const tarjetaGrafico = {
    border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px',
    minWidth: 0, background: '#fff',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
      gap: '16px', marginTop: '16px',
    }}>
      <div style={tarjetaGrafico}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#111827' }}>
          Distribución por estado
        </h4>
        {sinDatos ? (
          <p style={{ color: '#6b7280' }}>No hay registros para graficar.</p>
        ) : (
          <svg role="img" aria-label="Gráfico de barras: presentes, tardanzas y ausencias"
            viewBox="0 0 500 230" style={{ width: '100%', height: 'auto' }}>
            {Array.from({ length: pasosBarras + 1 }, (_, paso) => (
              <g key={paso}>
                <line x1="34" y1={180 - paso * 140 / pasosBarras} x2="482" y2={180 - paso * 140 / pasosBarras}
                  stroke="#e5e7eb" strokeDasharray="3 4" />
                <text x="27" y={184 - paso * 140 / pasosBarras} textAnchor="end" fontSize="11" fill="#6b7280">
                  {Math.round((maxBarras / pasosBarras) * paso)}
                </text>
              </g>
            ))}
            {seriesGraficos.map((serie, indice) => {
              const valor = totales[serie.clave];
              const alto = (valor / maxBarras) * 140;
              const x = 88 + indice * 148;
              return (
                <g key={serie.clave}>
                  <rect x={x} y={180 - alto} width="65" height={alto} rx="4"
                    fill={coloresGraficos[serie.clave]} />
                  <text x={x + 32.5} y={Math.max(20, 174 - alto)} textAnchor="middle"
                    fill="#111827" fontWeight="600" fontSize="13">{valor}</text>
                  <text x={x + 32.5} y="201" textAnchor="middle" fill="#374151"
                    fontSize="12">{serie.nombre}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div style={tarjetaGrafico}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#111827' }}>
          Asistencias por fecha
        </h4>
        {porFecha.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No hay registros por fecha para graficar.</p>
        ) : (
          <>
            <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 8px' }}>
              Una barra por día, dividida en presentes, tardanzas y ausencias.
            </p>
            <div style={{ overflow: 'auto', maxHeight: '345px' }}>
              <svg role="img" aria-label="Barras apiladas de asistencia por fecha"
                viewBox={`0 0 720 ${altoGraficoFecha}`}
                style={{ display: 'block', width: '100%', minWidth: '560px', height: 'auto' }}>
                <text x="104" y="24" fill="#6b7280" fontSize="11">0</text>
                <text x="624" y="24" textAnchor="end" fill="#6b7280" fontSize="11">
                  {maxTotalDia} registros
                </text>
                <line x1="104" x2="624" y1="31" y2="31" stroke="#e5e7eb" />
                {porFecha.map((dia, indice) => {
                  const y = inicioBarrasFecha + indice * altoFilaFecha;
                  const total = totalDia(dia);
                  return (
                    <g key={dia.fecha}>
                      <text x="91" y={y + altoBarraFecha / 2 + 4} textAnchor="end"
                        fontSize="12" fill="#374151">{etiquetaGraficoFecha(dia.fecha)}</text>
                      <rect x="104" y={y} width={anchoBarraFecha} height={altoBarraFecha}
                        rx="4" fill="#f3f4f6" />
                      {seriesGraficos.map((serie, posicion) => {
                        const valor = dia[serie.clave];
                        const previos = seriesGraficos.slice(0, posicion)
                          .reduce((acumulado, anterior) => acumulado + dia[anterior.clave], 0);
                        const x = 104 + previos / maxTotalDia * anchoBarraFecha;
                        const ancho = valor / maxTotalDia * anchoBarraFecha;
                        return valor > 0 ? (
                          <g key={serie.clave}>
                            <rect x={x} y={y} width={ancho} height={altoBarraFecha}
                              fill={coloresGraficos[serie.clave]}>
                              <title>{`${etiquetaGraficoFecha(dia.fecha)} — ${serie.nombre}: ${valor}`}</title>
                            </rect>
                            {ancho >= 24 && (
                              <text x={x + ancho / 2} y={y + altoBarraFecha / 2 + 4}
                                fill={coloresTextoGraficos[serie.clave]} textAnchor="middle" fontSize="12" fontWeight="700"
                                pointerEvents="none">{valor}</text>
                            )}
                          </g>
                        ) : null;
                      })}
                      <text x="643" y={y + altoBarraFecha / 2 + 4}
                        fontSize="12" fontWeight="600" fill="#111827">{total}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', marginTop: '8px' }}>
              {seriesGraficos.map((serie) => (
                <span key={serie.clave} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: coloresGraficos[serie.clave] }} />
                  {serie.nombre}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// Gráficos PNG para Excel. Se generan en el navegador sin dependencias adicionales.
// ExcelJS permite incrustar imágenes, pero no crear gráficos nativos editables.
function crearImagenGraficoExcel(tipo, datos) {
  const ancho = 920;
  const esDistribucion = tipo === 'distribucion';
  const alto = esDistribucion ? 345 : Math.max(195, 111 + datos.length * 38);
  const escala = 2; // Exportación nítida en Excel y al imprimir.
  const canvas = document.createElement('canvas');
  canvas.width = ancho * escala;
  canvas.height = alto * escala;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite generar las imágenes de los gráficos.');
  ctx.scale(escala, escala);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);

  const escribir = (valor, x, y, opciones = {}) => {
    const { color = '#111827', tamano = 15, negrita = false, alineacion = 'left' } = opciones;
    ctx.fillStyle = color;
    ctx.font = `${negrita ? '600' : '400'} ${tamano}px Arial, sans-serif`;
    ctx.textAlign = alineacion;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(valor), x, y);
  };
  const rectangulo = (x, y, w, h, color) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  rectangulo(0, 0, ancho, 5, '#551c9d');
  escribir(esDistribucion ? 'Distribución por estado' : 'Asistencias por fecha', 28, 42,
    { tamano: 22, negrita: true });
  escribir('SAGE | Módulo de asistencias', ancho - 28, 42,
    { tamano: 12, color: '#64748b', alineacion: 'right' });

  if (esDistribucion) {
    const maximo = Math.max(1, ...seriesGraficos.map((serie) => Number(datos[serie.clave] || 0)));
    const base = 265;
    const alturaMaxima = 170;
    for (let paso = 0; paso <= 4; paso += 1) {
      const y = base - (paso / 4) * alturaMaxima;
      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(75, y);
      ctx.lineTo(870, y);
      ctx.stroke();
      ctx.setLineDash([]);
      escribir(Math.round((maximo * paso) / 4), 58, y + 5,
        { tamano: 12, color: '#64748b', alineacion: 'right' });
    }
    seriesGraficos.forEach((serie, indice) => {
      const valor = Number(datos[serie.clave] || 0);
      const altura = (valor / maximo) * alturaMaxima;
      const x = 188 + indice * 258;
      rectangulo(x, base - altura, 116, altura, coloresGraficos[serie.clave]);
      escribir(valor, x + 58, Math.max(82, base - altura - 12),
        { tamano: 18, negrita: true, alineacion: 'center' });
      escribir(serie.nombre, x + 58, 298,
        { tamano: 16, alineacion: 'center', color: '#334155' });
    });
  } else {
    const maximo = Math.max(1, ...datos.map((dia) =>
      seriesGraficos.reduce((suma, serie) => suma + Number(dia[serie.clave] || 0), 0)));
    const xInicio = 130;
    const anchoBarras = 640;
    escribir('0', xInicio, 72, { tamano: 12, color: '#64748b' });
    escribir(`${maximo} registros`, xInicio + anchoBarras, 72,
      { tamano: 12, color: '#64748b', alineacion: 'right' });
    datos.forEach((dia, indice) => {
      const y = 88 + indice * 38;
      const total = seriesGraficos.reduce((suma, serie) =>
        suma + Number(dia[serie.clave] || 0), 0);
      escribir(etiquetaGraficoFecha(dia.fecha), 108, y + 19,
        { tamano: 14, color: '#334155', alineacion: 'right' });
      rectangulo(xInicio, y, anchoBarras, 26, '#f1f5f9');
      let acumulado = 0;
      seriesGraficos.forEach((serie) => {
        const valor = Number(dia[serie.clave] || 0);
        const x = xInicio + (acumulado / maximo) * anchoBarras;
        const w = (valor / maximo) * anchoBarras;
        rectangulo(x, y, w, 26, coloresGraficos[serie.clave]);
        if (valor > 0 && w >= 25) escribir(valor, x + w / 2, y + 19,
          { tamano: 13, negrita: true, color: coloresTextoGraficos[serie.clave], alineacion: 'center' });
        acumulado += valor;
      });
      escribir(total, xInicio + anchoBarras + 18, y + 19,
        { tamano: 14, negrita: true, color: '#334155' });
    });
    const leyendaY = alto - 20;
    seriesGraficos.forEach((serie, indice) => {
      const x = 180 + indice * 205;
      rectangulo(x, leyendaY - 12, 13, 13, coloresGraficos[serie.clave]);
      escribir(serie.nombre, x + 20, leyendaY, { tamano: 13, color: '#334155' });
    });
    if (!datos.length) escribir('Sin asistencias por fecha', 28, 105,
      { tamano: 15, color: '#64748b' });
  }

  return { base64: canvas.toDataURL('image/png'), ancho, alto };
}

function agregarGraficosExcel(libro, totales, porFecha) {
  const hoja = libro.addWorksheet('Gráficos');
  hoja.columns = Array.from({ length: 13 }, () => ({ width: 12 }));
  hoja.mergeCells('A1:M2');
  const titulo = hoja.getCell('A1');
  titulo.value = 'SAGE - GRÁFICOS DE ASISTENCIA';
  titulo.font = { size: 17, bold: true, color: { argb: 'FFFFFFFF' } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF551C9D' } };
  titulo.alignment = { vertical: 'middle', horizontal: 'center' };
  hoja.getCell('A3').value = 'Distribución general y asistencias por fecha del periodo consultado';
  hoja.getCell('A3').font = { italic: true, color: { argb: 'FF64748B' } };

  let fila = 5;
  const insertarImagen = (tipo, datos) => {
    const imagen = crearImagenGraficoExcel(tipo, datos);
    const id = libro.addImage({ base64: imagen.base64, extension: 'png' });
    hoja.addImage(id, { tl: { col: 0, row: fila - 1 },
      ext: { width: imagen.ancho, height: imagen.alto } });
    fila += Math.ceil(imagen.alto / 20) + 3;
  };
  insertarImagen('distribucion', totales);
  // Dividir periodos largos evita gráficos enormes y mantiene las fechas legibles.
  if (!porFecha.length) {
    insertarImagen('fechas', []);
  } else {
    for (let inicio = 0; inicio < porFecha.length; inicio += 12) {
      insertarImagen('fechas', porFecha.slice(inicio, inicio + 12));
    }
  }

  fila += 1;
  hoja.getCell(`A${fila}`).value = 'DATOS DE LOS GRÁFICOS (consultables en Excel)';
  hoja.getCell(`A${fila}`).font = { bold: true, color: { argb: 'FF551C9D' }, size: 12 };
  fila += 2;
  const encabezados = ['Fecha', 'Presentes', 'Tardanzas', 'Ausencias', 'Total'];
  hoja.getRow(fila).values = encabezados;
  hoja.getRow(fila).eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF551C9D' } };
    celda.alignment = { horizontal: 'center' };
  });
  porFecha.forEach((dia) => {
    fila += 1;
    hoja.getRow(fila).values = [
      dia.fecha, dia.presentes, dia.tardanzas, dia.ausencias,
      dia.presentes + dia.tardanzas + dia.ausencias,
    ];
  });
  hoja.views = [{ state: 'frozen', ySplit: 3 }];
  hoja.pageSetup.orientation = 'landscape';
  hoja.pageSetup.fitToPage = true;
  hoja.pageSetup.fitToWidth = 1;
  return hoja;
}

// Dibujo vectorial en jsPDF; no requiere capturas del navegador ni dependencias nuevas.
function agregarGraficosPDF(pdf, totales, porFecha) {
  pdf.addPage();
  const colores = {
    presentes: [74, 222, 128],
    tardanzas: [253, 224, 71],
    ausencias: [248, 113, 113],
  };
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(85, 28, 157);
  pdf.text('Graficos de asistencia', 14, 19);
  pdf.setFontSize(11);
  pdf.setTextColor(40, 40, 40);
  pdf.text('Distribucion por estado', 14, 32);
  const maxBarras = Math.max(1, ...seriesGraficos.map((s) => totales[s.clave]));
  const base = 90;
  const altoBarras = 46;
  const pasosBarras = Math.min(4, maxBarras);
  Array.from({ length: pasosBarras + 1 }, (_, paso) => paso).forEach((paso) => {
    const y = base - (paso / pasosBarras) * altoBarras;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(33, y, 277, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(String(Math.round(maxBarras * paso / pasosBarras)), 28, y + 1, { align: 'right' });
  });
  seriesGraficos.forEach((serie, indice) => {
    const alto = totales[serie.clave] / maxBarras * altoBarras;
    const x = 60 + indice * 78;
    pdf.setFillColor(...colores[serie.clave]);
    if (alto > 0) pdf.rect(x, base - alto, 28, alto, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(40, 40, 40);
    pdf.setFontSize(9);
    pdf.text(String(totales[serie.clave]), x + 14, Math.max(42, base - alto - 2), { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(serie.nombre, x + 14, 97, { align: 'center' });
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(40, 40, 40);
  pdf.text('Asistencias por fecha', 14, 116);
  if (porFecha.length === 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Sin registros por fecha para graficar.', 14, 136);
    return;
  }
  const sumaDia = (dia) => seriesGraficos.reduce((total, serie) => total + dia[serie.clave], 0);
  const maxDia = Math.max(1, ...porFecha.map(sumaDia));
  const inicioX = 45;
  const anchoTotal = 218;
  const filasPorPagina = 8;
  for (let pagina = 0; pagina * filasPorPagina < porFecha.length; pagina += 1) {
    if (pagina > 0) {
      pdf.addPage();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(85, 28, 157);
      pdf.text('Graficos de asistencia (continuacion)', 14, 19);
      pdf.setFontSize(11);
      pdf.setTextColor(40, 40, 40);
      pdf.text('Asistencias por fecha', 14, 32);
    }
    const primeraFilaY = pagina === 0 ? 126 : 43;
    const dias = porFecha.slice(pagina * filasPorPagina, (pagina + 1) * filasPorPagina);
    dias.forEach((dia, indice) => {
      const y = primeraFilaY + indice * 8;
      const total = sumaDia(dia);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(55, 65, 81);
      pdf.text(etiquetaGraficoFecha(dia.fecha), 40, y + 4.2, { align: 'right' });
      pdf.setFillColor(243, 244, 246);
      pdf.rect(inicioX, y, anchoTotal, 5.7, 'F');
      let acumulado = 0;
      seriesGraficos.forEach((serie) => {
        const valor = dia[serie.clave];
        const ancho = valor / maxDia * anchoTotal;
        if (ancho > 0) {
          pdf.setFillColor(...colores[serie.clave]);
          pdf.rect(inicioX + acumulado / maxDia * anchoTotal, y, ancho, 5.7, 'F');
          if (ancho >= 9) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.setTextColor(17, 24, 39);
            pdf.text(String(valor), inicioX + (acumulado + valor / 2) / maxDia * anchoTotal,
              y + 3.9, { align: 'center' });
          }
        }
        acumulado += valor;
      });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(40, 40, 40);
      pdf.text(String(total), 270, y + 4.2);
    });
    const leyendaY = primeraFilaY + dias.length * 8 + 7;
    seriesGraficos.forEach((serie, indice) => {
      const x = 59 + indice * 73;
      pdf.setFillColor(...colores[serie.clave]);
      pdf.rect(x, leyendaY - 2.7, 3, 3, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(40, 40, 40);
      pdf.text(serie.nombre, x + 5, leyendaY);
    });
  }

}

const estilos = {
  contenedor: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    marginTop: '24px',
  },
  titulo: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: '#111827',
  },
  subtitulo: {
    color: '#6b7280',
    fontSize: '14px',
    marginTop: '6px',
    marginBottom: '24px',
  },
  filtros: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  campo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  etiqueta: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
  },
  entrada: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    background: '#ffffff',
    color: '#111827',
  },
  acciones: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '20px',
    gap: '10px',
    flexWrap: 'wrap',
  },
  boton: {
    background: '#551c9d',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  separador: {
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    margin: '28px 0',
  },
  seccion: {
    fontSize: '17px',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '16px',
  },
  tarjetas: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
    gap: '12px',
  },
  tarjeta: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '18px',
    background: '#f9fafb',
  },
  tarjetaTitulo: {
    color: '#6b7280',
    fontSize: '13px',
    margin: 0,
  },
  tarjetaValor: {
    fontSize: '28px',
    fontWeight: 700,
    marginTop: '10px',
    marginBottom: 0,
  },
  tablaContenedor: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
  },
  tabla: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    textAlign: 'left',
  },
  encabezado: {
    padding: '14px',
    background: '#f3f4f6',
    color: '#374151',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  celda: {
    padding: '14px',
    borderTop: '1px solid #e5e7eb',
    color: '#374151',
  },
};

const coloresEstado = {
  PRESENTE: {
    background: '#dcfce7',
    color: '#166534',
  },
  TARDANZA: {
    background: '#fef3c7',
    color: '#92400e',
  },
  AUSENTE: {
    background: '#fee2e2',
    color: '#991b1b',
  },
};

const nombresEstado = {
  PRESENTE: 'Presente',
  TARDANZA: 'Tardanza',
  AUSENTE: 'Ausente',
};

function formatearFecha(fecha) {
  if (!fecha) return '—';

  const valor = String(fecha).slice(0, 10);
  const [anio, mes, dia] = valor.split('-');

  if (!anio || !mes || !dia) return valor;

  return `${dia}/${mes}/${anio}`;
}

function porcentaje(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 10000) / 100;
}

function resumenPorCampo(registros, campo) {
  const grupos = new Map();

  for (const registro of registros) {
    const clave = String(campo(registro));
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        total: 0,
        presentes: 0,
        tardanzas: 0,
        ausencias: 0,
      });
    }

    const grupo = grupos.get(clave);
    grupo.total += 1;

    if (registro.condicion === 'PRESENTE') grupo.presentes += 1;
    if (registro.condicion === 'TARDANZA') grupo.tardanzas += 1;
    if (registro.condicion === 'AUSENTE') grupo.ausencias += 1;
  }

  return Array.from(grupos.values()).map((grupo) => ({
    ...grupo,
    temprano: porcentaje(grupo.presentes, grupo.total),
    porcentajeTardanzas: porcentaje(grupo.tardanzas, grupo.total),
    porcentajeAusencias: porcentaje(grupo.ausencias, grupo.total),
  }));
}

function estilizarEncabezadoExcel(fila) {
  fila.height = 28;
  fila.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF551C9D' },
    };
    celda.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
  });
}

function configurarTablaExcel(hoja, encabezados, filas, anchos) {
  hoja.columns = anchos.map((width) => ({ width }));
  const encabezado = hoja.addRow(encabezados);
  estilizarEncabezadoExcel(encabezado);

  if (filas.length === 0) {
    hoja.addRow(['Sin registros']);
  } else {
    filas.forEach((fila) => hoja.addRow(fila));
  }

  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + encabezados.length)}${Math.max(2, hoja.rowCount)}`,
  };
  hoja.pageSetup.orientation = 'landscape';
  hoja.pageSetup.fitToPage = true;
  hoja.pageSetup.fitToWidth = 1;
}

export default function TeacherAttendanceReport({ docentes }) {
  const [reporte, setReporte] = useState(null);
  const [docenteId, setDocenteId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [exportandoPDF, setExportandoPDF] = useState(false);
  const [error, setError] = useState('');

  const resumen = reporte?.resumen ?? {};
  const asistencias = reporte?.asistencias ?? [];
  const tieneRegistros = Number(reporte?.total ?? 0) > 0 || asistencias.length > 0;
  // Orden cronológico para que el detalle tenga la misma secuencia en pantalla y archivos.
  const asistenciasPorFecha = [...asistencias].sort((a, b) => {
    const fechaA = String(a.fecha ?? '').slice(0, 10);
    const fechaB = String(b.fecha ?? '').slice(0, 10);
    return fechaA.localeCompare(fechaB) ||
      obtenerDocente(a.docenteId).localeCompare(obtenerDocente(b.docenteId), 'es');
  });

  const fechasGrafico = agruparAsistenciasPorFecha(asistencias, 'condicion');
  const totalesGrafico = {
    presentes: reporte?.resumen?.PRESENTE ?? 0,
    tardanzas: reporte?.resumen?.TARDANZA ?? 0,
    ausencias: reporte?.resumen?.AUSENTE ?? 0,
  };

  const resumenDocentes = resumenPorCampo(
    asistencias,
    (asistencia) => asistencia.docenteId
  ).sort((a, b) =>
    obtenerDocente(a.clave).localeCompare(obtenerDocente(b.clave), 'es')
  );

  const totalRegistros = reporte?.total ?? 0;
  const porcentajeTempranoGeneral = porcentaje(
    resumen.PRESENTE ?? 0,
    totalRegistros
  );

  const filasDocentes = resumenDocentes.map((grupo) => [
    obtenerDocente(grupo.clave),
    grupo.total,
    grupo.presentes,
    grupo.tardanzas,
    grupo.ausencias,
    `${grupo.temprano.toFixed(2)}%`,
    `${grupo.porcentajeTardanzas.toFixed(2)}%`,
    `${grupo.porcentajeAusencias.toFixed(2)}%`,
  ]);

  function obtenerDocente(id) {
    const docente = docentes.find(
      (d) => Number(d.id) === Number(id)
    );

    return docente?.nombre ?? `Docente ${id}`;
  }

  function obtenerFiltroDocente() {
    const id = reporte?.filtros?.docenteId;

    if (!id) return 'Todos los docentes';

    return obtenerDocente(id);
  }

  function obtenerFilas() {
    return asistenciasPorFecha.map((asistencia) => [
      formatearFecha(asistencia.fecha),
      obtenerDocente(asistencia.docenteId),
      nombresEstado[asistencia.condicion] ??
        asistencia.condicion,
      asistencia.observacion || '—',
    ]);
  }

  async function generarReporte() {
    if (!fechaInicio || !fechaFin) {
      setReporte(null);
      setError('Selecciona ambas fechas.');
      return;
    }

    if (fechaInicio > fechaFin) {
      setReporte(null);
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }

    setError('');
    setReporte(null);
    setCargando(true);

    try {
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin,
      });

      if (docenteId) {
        params.set('docenteId', docenteId);
      }

      const resultado = await api(
        `/reportes/asistencia/docentes?${params.toString()}`
      );

      setReporte({
        ...resultado,
        filtros: {
          fechaInicio,
          fechaFin,
          docenteId,
        },
      });
    } catch (err) {
      setError(err.message || 'No se pudo generar el reporte.');
    } finally {
      setCargando(false);
    }
  }

  async function descargarExcel() {
    if (!reporte || exportandoExcel || exportandoPDF || cargando) return;

    setError('');
    setExportandoExcel(true);

    try {
      const { default: ExcelJS } = await import('exceljs');
      const libro = new ExcelJS.Workbook();
      libro.creator = 'SAGE';
      libro.subject = 'Reporte de asistencia docente';

      const hojaResumen = libro.addWorksheet('Resumen general');
      hojaResumen.columns = [{ width: 34 }, { width: 22 }];
      hojaResumen.mergeCells('A1:B2');
      hojaResumen.getCell('A1').value = 'SAGE - REPORTE DE ASISTENCIA DOCENTE';
      hojaResumen.getCell('A1').font = {
        size: 16,
        bold: true,
        color: { argb: 'FF551C9D' },
      };
      hojaResumen.getCell('A4').value = 'Docente';
      hojaResumen.getCell('B4').value = obtenerFiltroDocente();
      hojaResumen.getCell('A5').value = 'Fecha inicial';
      hojaResumen.getCell('B5').value = formatearFecha(reporte.filtros.fechaInicio);
      hojaResumen.getCell('A6').value = 'Fecha final';
      hojaResumen.getCell('B6').value = formatearFecha(reporte.filtros.fechaFin);
      hojaResumen.addRow([]);
      hojaResumen.addRow(['Indicador', 'Valor']);
      estilizarEncabezadoExcel(hojaResumen.getRow(8));
      [
        ['Total de registros', totalRegistros],
        ['Presentes', resumen.PRESENTE ?? 0],
        ['Tardanzas', resumen.TARDANZA ?? 0],
        ['Ausencias', resumen.AUSENTE ?? 0],
        ['% Presentes', `${porcentajeTempranoGeneral.toFixed(2)}%`],
        ['% Tardanzas', `${porcentaje(resumen.TARDANZA ?? 0, totalRegistros).toFixed(2)}%`],
        ['% Inasistencias', `${porcentaje(resumen.AUSENTE ?? 0, totalRegistros).toFixed(2)}%`],
      ].forEach((fila) => hojaResumen.addRow(fila));
      hojaResumen.pageSetup.fitToPage = true;
      hojaResumen.pageSetup.fitToWidth = 1;

      const hojaDetalle = libro.addWorksheet('Detalle de asistencia por fecha');
      configurarTablaExcel(
        hojaDetalle,
        ['Fecha', 'Docente', 'Estado', 'Observación'],
        obtenerFilas(),
        [19, 34, 18, 50]
      );

      const hojaDocentes = libro.addWorksheet('Resumen por docente');
      configurarTablaExcel(
        hojaDocentes,
        ['Docente', 'Total', 'Presentes', 'Tardanzas', 'Ausencias', '% Presentes', '% Tardanzas', '% Inasistencias'],
        filasDocentes,
        [34, 13, 15, 15, 15, 19, 19, 20]
      );

      agregarGraficosExcel(libro, totalesGrafico, fechasGrafico);

      const buffer = await libro.xlsx.writeBuffer();
      const archivo = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `asistencia_docente_${reporte.filtros.fechaInicio}_${reporte.filtros.fechaFin}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || 'No se pudo descargar el archivo Excel.');
    } finally {
      setExportandoExcel(false);
    }
  }

  async function descargarPDF() {
    if (!reporte || exportandoPDF || exportandoExcel || cargando) return;

    setError('');
    setExportandoPDF(true);

    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      const ancho = pdf.internal.pageSize.getWidth();
      const alto = pdf.internal.pageSize.getHeight();

      pdf.setFillColor(85, 28, 157);
      pdf.rect(0, 0, ancho, 29, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(17);
      pdf.setTextColor(255, 255, 255);
      pdf.text('SAGE - Reporte de asistencia docente', 14, 19);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      pdf.text(
        `Periodo: ${formatearFecha(reporte.filtros.fechaInicio)} al ${formatearFecha(reporte.filtros.fechaFin)}`,
        14,
        39
      );
      const textoDocente = pdf.splitTextToSize(
        `Docente: ${obtenerFiltroDocente()}`,
        ancho - 28
      );
      pdf.text(textoDocente, 14, 46);

      function tituloSeccion(texto, y) {
        let posicion = y;
        if (posicion > alto - 35) {
          pdf.addPage();
          posicion = 20;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(85, 28, 157);
        pdf.text(texto, 14, posicion);
        return posicion + 5;
      }

      const estiloTabla = {
        theme: 'grid',
        headStyles: { fillColor: [85, 28, 157], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
        margin: { left: 14, right: 14, top: 16, bottom: 18 },
      };

      const inicioResumen = tituloSeccion('Resumen general', 46 + textoDocente.length * 5 + 8);
      autoTable(pdf, {
        ...estiloTabla,
        startY: inicioResumen,
        head: [['Total', 'Presentes', 'Tardanzas', 'Ausencias', '% Presentes', '% Tardanzas', '% Inasistencias']],
        body: [[
          totalRegistros,
          resumen.PRESENTE ?? 0,
          resumen.TARDANZA ?? 0,
          resumen.AUSENTE ?? 0,
          `${porcentajeTempranoGeneral.toFixed(2)}%`,
          `${porcentaje(resumen.TARDANZA ?? 0, totalRegistros).toFixed(2)}%`,
          `${porcentaje(resumen.AUSENTE ?? 0, totalRegistros).toFixed(2)}%`,
        ]],
      });

      // Gráficos en una página vectorial, seguidos del detalle en una página nueva.
      agregarGraficosPDF(pdf, totalesGrafico, fechasGrafico);
      pdf.addPage();
      const inicioDetalle = tituloSeccion('Detalle de asistencia por fecha', 20);
      const registros = obtenerFilas();
      autoTable(pdf, {
        ...estiloTabla,
        startY: inicioDetalle,
        head: [['Fecha', 'Docente', 'Estado', 'Observación']],
        body: registros.length
          ? registros
          : [['Sin registros', '—', '—', '—']],
        columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 70 }, 2: { cellWidth: 40 } },
      });

      const inicioDocentes = tituloSeccion('Resumen por docente', (pdf.lastAutoTable?.finalY ?? 70) + 12);
      autoTable(pdf, {
        ...estiloTabla,
        startY: inicioDocentes,
        head: [['Docente', 'Total', 'Presentes', 'Tardanzas', 'Ausencias', '% Presentes', '% Tardanzas', '% Inasistencias']],
        body: filasDocentes.length
          ? filasDocentes
          : [['Sin registros', '—', '—', '—', '—', '—', '—', '—']],
        columnStyles: { 0: { cellWidth: 65 } },
      });

      const paginas = pdf.getNumberOfPages();
      for (let numero = 1; numero <= paginas; numero++) {
        pdf.setPage(numero);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`SAGE - Página ${numero} de ${paginas}`, 14, alto - 9);
      }

      pdf.save(
        `asistencia_docente_${reporte.filtros.fechaInicio}_${reporte.filtros.fechaFin}.pdf`
      );
    } catch (err) {
      setError(err.message || 'No se pudo descargar el archivo PDF.');
    } finally {
      setExportandoPDF(false);
    }
  }

  const indicadores = [
    {
      titulo: 'Total de registros',
      valor: reporte?.total ?? 0,
      color: '#111827',
    },
    {
      titulo: 'Presentes',
      valor: resumen.PRESENTE ?? 0,
      color: '#166534',
    },
    {
      titulo: 'Tardanzas',
      valor: resumen.TARDANZA ?? 0,
      color: '#92400e',
    },
    {
      titulo: 'Ausencias',
      valor: resumen.AUSENTE ?? 0,
      color: '#991b1b',
    },
    {
      titulo: '% Presentes',
      valor: `${porcentajeTempranoGeneral.toFixed(2)}%`,
      color: '#2563eb',
    },
    {
      titulo: '% Tardanzas',
      valor: `${porcentaje(resumen.TARDANZA ?? 0, totalRegistros).toFixed(2)}%`,
      color: '#b45309',
    },
    {
      titulo: '% Inasistencias',
      valor: `${porcentaje(resumen.AUSENTE ?? 0, totalRegistros).toFixed(2)}%`,
      color: '#dc2626',
    },
  ];

  return (
    <section style={estilos.contenedor}>
      <h2 style={estilos.titulo}>
        Reporte de asistencia docente
      </h2>

      <p style={estilos.subtitulo}>
        Consulta y analiza los registros de asistencia.
      </p>

      <div style={estilos.filtros}>
        <div style={estilos.campo}>
          <label
            htmlFor="docenteReporte"
            style={estilos.etiqueta}
          >
            Docente
          </label>

          <select
            id="docenteReporte"
            value={docenteId}
            onChange={(e) => setDocenteId(e.target.value)}
            style={estilos.entrada}
          >
            <option value="">Todos los docentes</option>

            {docentes.map((docente) => (
              <option key={docente.id} value={docente.id}>
                {docente.nombre}
              </option>
            ))}
          </select>
        </div>

        <div style={estilos.campo}>
          <label
            htmlFor="fechaInicio"
            style={estilos.etiqueta}
          >
            Desde
          </label>

          <input
            id="fechaInicio"
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            style={estilos.entrada}
          />
        </div>

        <div style={estilos.campo}>
          <label
            htmlFor="fechaFin"
            style={estilos.etiqueta}
          >
            Hasta
          </label>

          <input
            id="fechaFin"
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            style={estilos.entrada}
          />
        </div>
      </div>

      <div style={estilos.acciones}>
        <button
          type="button"
          onClick={generarReporte}
          disabled={cargando}
          style={{
            ...estilos.boton,
            opacity: cargando ? 0.6 : 1,
            cursor: cargando ? 'not-allowed' : 'pointer',
          }}
        >
          {cargando ? 'Generando...' : 'Generar reporte'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      )}

      {reporte && tieneRegistros && (
        <>
          <h3 style={estilos.seccion}>
            Resultados del reporte
          </h3>

          <div style={estilos.acciones}>
            <button
              type="button"
              onClick={descargarExcel}
              className="secondary"
              disabled={exportandoExcel || exportandoPDF || cargando}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 600,
                opacity: exportandoExcel ? 0.6 : 1,
              }}
            >
              <IconoExportacion formato="excel" />
              {exportandoExcel ? 'Exportando Excel...' : 'Exportar Excel'}
            </button>
            <button
              type="button"
              onClick={descargarPDF}
              className="secondary"
              disabled={exportandoPDF || exportandoExcel || cargando}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 600,
                opacity: exportandoPDF ? 0.6 : 1,
              }}
            >
              <IconoExportacion formato="pdf" />
              {exportandoPDF ? 'Exportando PDF...' : 'Exportar PDF'}
            </button>
          </div>

          <hr style={estilos.separador} />

          <h3 style={estilos.seccion}>
            Resumen de asistencia
          </h3>

          <div style={estilos.tarjetas}>
            {indicadores.map((indicador) => (
              <div
                key={indicador.titulo}
                style={estilos.tarjeta}
              >
                <p style={estilos.tarjetaTitulo}>
                  {indicador.titulo}
                </p>

                <p
                  style={{
                    ...estilos.tarjetaValor,
                    color: indicador.color,
                  }}
                >
                  {indicador.valor}
                </p>
              </div>
            ))}
          </div>

          <hr style={estilos.separador} />

          <h3 style={estilos.seccion}>Gráficos de asistencia</h3>
          <GraficosAsistencia totales={totalesGrafico} porFecha={fechasGrafico} />
          <hr style={estilos.separador} />

          <h3 style={estilos.seccion}>
            Detalle de asistencia por fecha
          </h3>

          {asistenciasPorFecha.length === 0 ? (
            <p style={{ color: '#6b7280' }}>
              No hay registros de asistencia en este período.
            </p>
          ) : (
            <div style={estilos.tablaContenedor}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.encabezado}>Fecha</th>
                    <th style={estilos.encabezado}>Docente</th>
                    <th style={estilos.encabezado}>Estado</th>
                    <th style={estilos.encabezado}>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {asistenciasPorFecha.map((asistencia) => {
                    const estado = asistencia.condicion;
                    return (
                      <tr key={asistencia.id}>
                        <td style={estilos.celda}>
                          {formatearFecha(asistencia.fecha)}
                        </td>
                        <td style={estilos.celda}>
                          {obtenerDocente(asistencia.docenteId)}
                        </td>
                        <td style={estilos.celda}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '5px 10px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: coloresEstado[estado]?.background ?? '#f3f4f6',
                              color: coloresEstado[estado]?.color ?? '#374151',
                            }}
                          >
                            {nombresEstado[estado] ?? estado}
                          </span>
                        </td>
                        <td style={estilos.celda}>
                          {asistencia.observacion || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <hr style={estilos.separador} />

          <h3 style={estilos.seccion}>Resumen por docente</h3>
          {resumenDocentes.length === 0 ? (
            <p style={{ color: '#6b7280' }}>
              No hay registros de docentes para los filtros seleccionados.
            </p>
          ) : (
            <div style={estilos.tablaContenedor}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    {['Docente', 'Total', 'Presentes', 'Tardanzas', 'Ausencias', '% Presentes', '% Tardanzas', '% Inasistencias'].map((titulo) => (
                      <th key={titulo} style={estilos.encabezado}>{titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resumenDocentes.map((grupo) => (
                    <tr key={grupo.clave}>
                      <td style={estilos.celda}>{obtenerDocente(grupo.clave)}</td>
                      <td style={estilos.celda}>{grupo.total}</td>
                      <td style={estilos.celda}>{grupo.presentes}</td>
                      <td style={estilos.celda}>{grupo.tardanzas}</td>
                      <td style={estilos.celda}>{grupo.ausencias}</td>
                      <td style={estilos.celda}>{grupo.temprano.toFixed(2)}%</td>
                      <td style={estilos.celda}>{grupo.porcentajeTardanzas.toFixed(2)}%</td>
                      <td style={estilos.celda}>{grupo.porcentajeAusencias.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {reporte && !tieneRegistros && (
        <>
          <h3 style={estilos.seccion}>Resultados del reporte</h3>
          <div role="status" style={{
              marginTop: '20px',
              padding: '24px',
              border: '1px solid #ddd6fe',
              borderRadius: '10px',
              background: '#faf7ff',
            }}>
            <strong style={{ color: '#4c1d95', fontSize: '16px' }}>
              Sin asistencias registradas
            </strong>
            <p style={{ color: '#6b7280', margin: '8px 0 0' }}>
              No se encontraron registros para los filtros y fechas seleccionados.
              Puedes cambiar el rango de fechas o los filtros y generar el reporte nuevamente.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
