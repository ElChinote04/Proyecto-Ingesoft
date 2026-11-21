
import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../api/client';
import AppLayout from '../layouts/AppLayout';
import { Feedback, Loading } from '../components/Feedback';

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
  tarjeta: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px',
  },
  filtros: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '16px',
    marginTop: '20px',
  },
  campo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    fontWeight: 600,
    fontSize: '14px',
  },
  entrada: {
    width: '100%',
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    background: '#ffffff',
    color: '#111827',
    boxSizing: 'border-box',
  },
  acciones: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '20px',
  },
  boton: {
    background: '#551c9d',
    color: '#ffffff',
    padding: '11px 18px',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  resumen: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
    gap: '12px',
    margin: '20px 0',
  },
  indicador: {
    padding: '17px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
  },
  tabla: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  celda: {
    padding: '13px',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left',
  },
};

function porcentaje(valor, total) {
  return total > 0
    ? Number(((valor / total) * 100).toFixed(2))
    : 0;
}

function resumenEstudiante(alumno) {
  const presentes = alumno.resumen?.PRESENTE ?? 0;
  const tardanzas = alumno.resumen?.TARDANZA ?? 0;
  const ausencias = alumno.resumen?.AUSENTE ?? 0;
  const total = presentes + tardanzas + ausencias;

  return {
    presentes,
    tardanzas,
    ausencias,
    temprano: porcentaje(presentes, total),
    tardanza: porcentaje(tardanzas, total),
    ausencia: porcentaje(ausencias, total),
  };
}

function guardarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');

  enlace.href = url;
  enlace.download = nombre;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatearFecha(fecha) {
  if (!fecha || typeof fecha !== 'string') return '';

  const partes = fecha.slice(0, 10).split('-');

  return partes.length === 3
    ? `${partes[2]}/${partes[1]}/${partes[0]}`
    : fecha;
}

function nombreEstado(estado) {
  if (estado === 'PRESENTE') return 'Presente';
  if (estado === 'TARDANZA') return 'Tardanza';
  if (estado === 'AUSENTE') return 'Ausente';
  return estado ?? '';
}

function estadoColor(estado) {
  if (estado === 'PRESENTE') {
    return {
      color: '#166534',
      background: '#dcfce7',
    };
  }

  if (estado === 'TARDANZA') {
    return {
      color: '#92400e',
      background: '#fef3c7',
    };
  }

  return {
    color: '#991b1b',
    background: '#fee2e2',
  };
}

const encabezadosDetalle = [
  'Fecha',
  'Estudiante',
  'Código',
  'Curso',
  'Estado',
  'Observación',
];

const encabezadosResumen = [
  'Estudiante',
  'Código',
  'Presente',
  'Tardanza',
  'Ausente',
  '% Presentes',
  '% Tardanzas',
  '% Ausencias',
];

function filasDetalle(reporte) {
  return (reporte?.detalle ?? []).map((registro) => [
    formatearFecha(registro.fecha),
    registro.estudiante,
    registro.codigo ?? '',
    registro.curso ?? '',
    nombreEstado(registro.estado),
    registro.observacion ?? '',
  ]);
}

function filasResumen(reporte) {
  return (reporte?.alumnos ?? []).map((alumno) => {
    const r = resumenEstudiante(alumno);

    return [
      alumno.nombre,
      alumno.codigo,
      r.presentes,
      r.tardanzas,
      r.ausencias,
      `${r.temprano.toFixed(2)}%`,
      `${r.tardanza.toFixed(2)}%`,
      `${r.ausencia.toFixed(2)}%`,
    ];
  });
}

function aplicarEncabezadoExcel(fila) {
  fila.eachCell((celda) => {
    celda.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF551C9D' },
    };

    celda.alignment = {
      vertical: 'middle',
      wrapText: true,
    };
  });
}

export default function TeacherStudentAttendanceReport() {
  const [sesiones, setSesiones] = useState([]);
  const [alumnos, setAlumnos] = useState([]);

  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const [error, setError] = useState('');
  const [reporte, setReporte] = useState(null);
  const [filtrosReporte, setFiltrosReporte] = useState(null);

  const [seccionId, setSeccionId] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    api('/sesiones', {
      signal: controller.signal,
    })
      .then((resultado) => {
        if (!controller.signal.aborted) {
          setSesiones(
            Array.isArray(resultado) ? resultado : []
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCargandoDatos(false);
        }
      });

    return () => controller.abort();
  }, []);

  const secciones = Array.from(
    new Map(
      sesiones.map((sesion) => [
        sesion.seccion.id,
        sesion.seccion,
      ])
    ).values()
  ).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );

  const sesionesSeccion = sesiones.filter(
    (sesion) =>
      String(sesion.seccion.id) === seccionId
  );

  const cursos = Array.from(
    new Map(
      sesionesSeccion.map((sesion) => [
        sesion.curso.id,
        sesion.curso,
      ])
    ).values()
  ).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );

  useEffect(() => {
    if (!seccionId) {
      setAlumnos([]);
      setCargandoAlumnos(false);
      return;
    }

    const sesion = sesiones.find(
      (item) =>
        String(item.seccion.id) === seccionId
    );

    if (!sesion) {
      setAlumnos([]);
      setCargandoAlumnos(false);
      return;
    }

    const controller = new AbortController();

    setCargandoAlumnos(true);

    api(`/sesiones/${sesion.id}/alumnos`, {
      signal: controller.signal,
    })
      .then((resultado) => {
        if (!controller.signal.aborted) {
          setAlumnos(resultado.alumnos ?? []);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setAlumnos([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCargandoAlumnos(false);
        }
      });

    return () => controller.abort();
  }, [seccionId, sesiones]);

  function limpiarReporte() {
    setReporte(null);
    setFiltrosReporte(null);
    setError('');
  }

  async function consultar(e) {
    e.preventDefault();

    limpiarReporte();

    if (!seccionId || !fechaInicio || !fechaFin) {
      setError(
        'Selecciona una sección y un rango de fechas.'
      );
      return;
    }

    if (fechaInicio > fechaFin) {
      setError(
        'La fecha inicial no puede superar a la final.'
      );
      return;
    }

    setConsultando(true);

    try {
      const params = new URLSearchParams({
        seccionId,
        fechaInicio,
        fechaFin,
      });

      if (cursoId) {
        params.set('cursoId', cursoId);
      }

      if (alumnoId) {
        params.set('alumnoId', alumnoId);
      }

      const resultado = await api(
        `/reportes/asistencia/estudiantes?${params.toString()}`
      );

      setReporte(resultado);

      setFiltrosReporte({
        seccion:
          secciones.find(
            (s) => String(s.id) === seccionId
          )?.nombre ?? '',
        curso:
          cursos.find(
            (c) => String(c.id) === cursoId
          )?.nombre ?? 'Todos mis cursos',
        alumno:
          alumnos.find(
            (a) => String(a.alumnoId) === alumnoId
          )?.nombre ?? 'Todos los alumnos',
        fechaInicio,
        fechaFin,
      });
    } catch (e) {
      setError(
        e.message || 'No se pudo generar el reporte.'
      );
    } finally {
      setConsultando(false);
    }
  }

  const total = reporte?.total ?? 0;
  const presentes = reporte?.resumen?.PRESENTE ?? 0;
  const tardanzas = reporte?.resumen?.TARDANZA ?? 0;
  const ausencias = reporte?.resumen?.AUSENTE ?? 0;

  const indicadores = [
    ['Registros', total, '#111827'],
    ['Presentes', presentes, '#166534'],
    ['Tardanzas', tardanzas, '#92400e'],
    ['Ausencias', ausencias, '#991b1b'],
    [
      '% Presentes',
      `${porcentaje(presentes, total)}%`,
      '#2563eb',
    ],
    [
      '% Tardanzas',
      `${porcentaje(tardanzas, total)}%`,
      '#b45309',
    ],
    [
      '% Ausencias',
      `${porcentaje(ausencias, total)}%`,
      '#dc2626',
    ],
  ];

  const detalle = reporte?.detalle ?? [];
  const tieneRegistros = Number(reporte?.total ?? 0) > 0 || detalle.length > 0;
  const fechasGrafico = agruparAsistenciasPorFecha(detalle, 'estado');
  const totalesGrafico = {
    presentes: reporte?.resumen?.PRESENTE ?? 0,
    tardanzas: reporte?.resumen?.TARDANZA ?? 0,
    ausencias: reporte?.resumen?.AUSENTE ?? 0,
  };
  const filasPorFecha = filasDetalle(reporte);
  const filasPorAlumno = filasResumen(reporte);

  async function exportarExcel() {
    if (!reporte || !filtrosReporte || exportando) {
      return;
    }

    setExportando(true);
    setError('');

    try {
      const libro = new ExcelJS.Workbook();

      libro.creator = 'SAGE';
      libro.subject = 'Reporte de asistencia estudiantil';

      const hoja = libro.addWorksheet('Resumen');

      hoja.columns = [
        { width: 33 },
        { width: 20 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
      ];

      hoja.mergeCells('A1:H2');

      const titulo = hoja.getCell('A1');

      titulo.value =
        'SAGE - REPORTE DE ASISTENCIA ESTUDIANTIL';

      titulo.font = {
        size: 17,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };

      titulo.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF551C9D' },
      };

      titulo.alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };

      const filtros = [
        ['Sección', filtrosReporte.seccion],
        ['Curso', filtrosReporte.curso],
        ['Alumno', filtrosReporte.alumno],
        ['Desde', formatearFecha(filtrosReporte.fechaInicio)],
        ['Hasta', formatearFecha(filtrosReporte.fechaFin)],
      ];

      filtros.forEach(([nombre, valor]) => {
        const fila = hoja.addRow([nombre, valor]);
        fila.getCell(1).font = { bold: true };
      });

      hoja.addRow([]);

      const tituloResumen = hoja.addRow([
        'RESUMEN GENERAL',
      ]);

      tituloResumen.getCell(1).font = {
        bold: true,
        color: { argb: 'FF551C9D' },
        size: 12,
      };

      indicadores.forEach(([nombre, valor]) => {
        hoja.addRow([nombre, valor]);
      });

      hoja.addRow([]);

      const tituloAlumnos = hoja.addRow([
        'RESUMEN POR ESTUDIANTE',
      ]);

      tituloAlumnos.getCell(1).font = {
        bold: true,
        color: { argb: 'FF551C9D' },
        size: 12,
      };

      const encabezadoResumen = hoja.addRow(
        encabezadosResumen
      );

      aplicarEncabezadoExcel(encabezadoResumen);

      filasPorAlumno.forEach((fila) => {
        hoja.addRow(fila);
      });

      if (!filasPorAlumno.length) {
        hoja.addRow(['Sin registros']);
      }

      hoja.pageSetup.orientation = 'landscape';
      hoja.pageSetup.fitToPage = true;
      hoja.pageSetup.fitToWidth = 1;

      const hojaDetalle = libro.addWorksheet(
        'Detalle por fecha'
      );

      hojaDetalle.columns = [
        { header: 'Fecha', key: 'fecha', width: 17 },
        {
          header: 'Estudiante',
          key: 'estudiante',
          width: 32,
        },
        { header: 'Código', key: 'codigo', width: 22 },
        { header: 'Curso', key: 'curso', width: 37 },
        { header: 'Estado', key: 'estado', width: 17 },
        {
          header: 'Observación',
          key: 'observacion',
          width: 45,
        },
      ];

      aplicarEncabezadoExcel(hojaDetalle.getRow(1));

      filasPorFecha.forEach((fila) => {
        hojaDetalle.addRow(fila);
      });

      if (!filasPorFecha.length) {
        hojaDetalle.addRow(['Sin registros']);
      }

      hojaDetalle.views = [
        {
          state: 'frozen',
          ySplit: 1,
        },
      ];

      hojaDetalle.autoFilter = {
        from: 'A1',
        to: `F${Math.max(2, filasPorFecha.length + 1)}`,
      };

      hojaDetalle.pageSetup.orientation = 'landscape';
      hojaDetalle.pageSetup.fitToPage = true;
      hojaDetalle.pageSetup.fitToWidth = 1;

      agregarGraficosExcel(libro, totalesGrafico, fechasGrafico);

      const buffer = await libro.xlsx.writeBuffer();

      guardarBlob(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `Reporte_Docente_Estudiantes_${filtrosReporte.fechaInicio}_${filtrosReporte.fechaFin}.xlsx`
      );
    } catch (e) {
      setError(
        e.message || 'No se pudo exportar a Excel.'
      );
    } finally {
      setExportando(false);
    }
  }

  function exportarPDF() {
    if (!reporte || !filtrosReporte || exportando) {
      return;
    }

    setError('');

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      pdf.setFillColor(85, 28, 157);
      pdf.rect(0, 0, 297, 25, 'F');

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);

      pdf.text(
        'SAGE - Reporte de asistencia estudiantil',
        14,
        16
      );

      pdf.setTextColor(40, 40, 40);
      pdf.setFontSize(10);

      pdf.text(
        `Sección: ${filtrosReporte.seccion}`,
        14,
        36
      );

      pdf.text(
        `Curso: ${filtrosReporte.curso}`,
        14,
        43
      );

      pdf.text(
        `Alumno: ${filtrosReporte.alumno}`,
        14,
        50
      );

      pdf.text(
        `Periodo: ${formatearFecha(
          filtrosReporte.fechaInicio
        )} al ${formatearFecha(
          filtrosReporte.fechaFin
        )}`,
        14,
        57
      );

      autoTable(pdf, {
        startY: 64,
        head: [
          indicadores.map(([nombre]) => nombre),
        ],
        body: [
          indicadores.map(([, valor]) =>
            String(valor)
          ),
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
        },
        styles: {
          fontSize: 8,
          halign: 'center',
          cellPadding: 3,
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      // Gráficos vectoriales antes del detalle de registros.
      agregarGraficosPDF(pdf, totalesGrafico, fechasGrafico);
      pdf.addPage();
      const inicioDetalle = 20;

      if (inicioDetalle > 190) {
        pdf.addPage();
      }

      const posicionDetalle =
        inicioDetalle > 190 ? 20 : inicioDetalle;

      pdf.setTextColor(40, 40, 40);
      pdf.setFontSize(12);

      pdf.text(
        'Detalle de asistencia por fecha',
        14,
        posicionDetalle
      );

      autoTable(pdf, {
        startY: posicionDetalle + 4,
        head: [encabezadosDetalle],
        body: filasPorFecha.length
          ? filasPorFecha
          : [
              [
                'Sin registros',
                '',
                '',
                '',
                '',
                '',
              ],
            ],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      const inicioResumen =
        (pdf.lastAutoTable?.finalY ?? 90) + 12;

      if (inicioResumen > 190) {
        pdf.addPage();
      }

      const posicionResumen =
        inicioResumen > 190 ? 20 : inicioResumen;

      pdf.setFontSize(12);
      pdf.setTextColor(40, 40, 40);

      pdf.text(
        'Resumen por estudiante',
        14,
        posicionResumen
      );

      autoTable(pdf, {
        startY: posicionResumen + 4,
        head: [encabezadosResumen],
        body: filasPorAlumno.length
          ? filasPorAlumno
          : [
              [
                'Sin registros',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
              ],
            ],
        theme: 'grid',
        headStyles: {
          fillColor: [85, 28, 157],
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      pdf.save(
        `Reporte_Docente_Estudiantes_${filtrosReporte.fechaInicio}_${filtrosReporte.fechaFin}.pdf`
      );
    } catch (e) {
      setError(
        e.message || 'No se pudo exportar a PDF.'
      );
    }
  }

  return (
    <AppLayout
      section="Reporte de asistencia estudiantil"
      step="Consultar reporte"
    >
      <section style={estilos.tarjeta}>
        <h2>Reporte de asistencia estudiantil</h2>

        <p className="muted">
          Consulta las asistencias de tus cursos y
          secciones asignados.
        </p>

        {cargandoDatos ? (
          <Loading>
            Cargando sesiones...
          </Loading>
        ) : !sesiones.length ? (
          <Feedback
            intent="info"
            title="Sin sesiones"
          >
            No tienes sesiones disponibles para consultar
            reportes.
          </Feedback>
        ) : (
          <form onSubmit={consultar}>
            <div style={estilos.filtros}>
              <label style={estilos.campo}>
                Sección

                <select
                  required
                  value={seccionId}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setSeccionId(e.target.value);
                    setCursoId('');
                    setAlumnoId('');
                    setAlumnos([]);
                    limpiarReporte();
                  }}
                >
                  <option value="">
                    Seleccionar sección...
                  </option>

                  {secciones.map((seccion) => (
                    <option
                      key={seccion.id}
                      value={seccion.id}
                    >
                      {seccion.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={estilos.campo}>
                Curso

                <select
                  value={cursoId}
                  disabled={!seccionId}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setCursoId(e.target.value);
                    limpiarReporte();
                  }}
                >
                  <option value="">
                    Todos mis cursos
                  </option>

                  {cursos.map((curso) => (
                    <option
                      key={curso.id}
                      value={curso.id}
                    >
                      {curso.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={estilos.campo}>
                Alumno

                <select
                  value={alumnoId}
                  disabled={
                    !seccionId || cargandoAlumnos
                  }
                  style={estilos.entrada}
                  onChange={(e) => {
                    setAlumnoId(e.target.value);
                    limpiarReporte();
                  }}
                >
                  <option value="">
                    {cargandoAlumnos
                      ? 'Cargando alumnos...'
                      : 'Todos los alumnos'}
                  </option>

                  {alumnos.map((alumno) => (
                    <option
                      key={alumno.alumnoId}
                      value={alumno.alumnoId}
                    >
                      {alumno.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={estilos.campo}>
                Fecha inicial

                <input
                  type="date"
                  required
                  value={fechaInicio}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setFechaInicio(e.target.value);
                    limpiarReporte();
                  }}
                />
              </label>

              <label style={estilos.campo}>
                Fecha final

                <input
                  type="date"
                  required
                  min={fechaInicio || undefined}
                  value={fechaFin}
                  style={estilos.entrada}
                  onChange={(e) => {
                    setFechaFin(e.target.value);
                    limpiarReporte();
                  }}
                />
              </label>
            </div>

            <div style={estilos.acciones}>
              <button
                type="submit"
                disabled={consultando}
                style={estilos.boton}
              >
                {consultando
                  ? 'Consultando...'
                  : 'Generar reporte'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <Feedback
            title="No se pudo completar la operación"
          >
            {error}
          </Feedback>
        )}
      </section>

      {reporte && tieneRegistros && (
        <section style={estilos.tarjeta}>
          <h2>Resultados del reporte</h2>

          <div style={estilos.acciones}>
            <button
              type="button"
              disabled={exportando}
              onClick={exportarExcel}
              className="secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              <IconoExportacion formato="excel" />
              {exportando
                ? 'Exportando...'
                : 'Exportar Excel'}
            </button>

            <button
              type="button"
              disabled={exportando}
              onClick={exportarPDF}
              className="secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              <IconoExportacion formato="pdf" />
              Exportar PDF
            </button>
          </div>

          <h3>Resumen general</h3>

          <div style={estilos.resumen}>
            {indicadores.map(
              ([nombre, valor, color]) => (
                <div
                  key={nombre}
                  style={estilos.indicador}
                >
                  <p className="muted">
                    {nombre}
                  </p>

                  <strong
                    style={{
                      fontSize: '25px',
                      color,
                    }}
                  >
                    {valor}
                  </strong>
                </div>
              )
            )}
          </div>

          <h3>Gráficos de asistencia</h3>
          <GraficosAsistencia totales={totalesGrafico} porFecha={fechasGrafico} />

          <h3>
            Detalle de asistencia por fecha
          </h3>

          {!detalle.length ? (
            <p className="muted">
              No se encontraron asistencias en el
              periodo seleccionado.
            </p>
          ) : (
            <div
              style={{
                overflowX: 'auto',
                marginBottom: '24px',
              }}
            >
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    {encabezadosDetalle.map(
                      (titulo) => (
                        <th
                          key={titulo}
                          style={{
                            ...estilos.celda,
                            background: '#f3f4f6',
                          }}
                        >
                          {titulo}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {detalle.map(
                    (registro, indice) => (
                      <tr
                        key={
                          registro.id ??
                          `${registro.sesionId}-${registro.alumnoId}-${indice}`
                        }
                      >
                        <td style={estilos.celda}>
                          {formatearFecha(
                            registro.fecha
                          )}
                        </td>

                        <td style={estilos.celda}>
                          {registro.estudiante}
                        </td>

                        <td style={estilos.celda}>
                          {registro.codigo}
                        </td>

                        <td style={estilos.celda}>
                          {registro.curso}
                        </td>

                        <td style={estilos.celda}>
                          <span
                            style={{
                              ...estadoColor(
                                registro.estado
                              ),
                              borderRadius: '999px',
                              padding: '5px 10px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {nombreEstado(
                              registro.estado
                            )}
                          </span>
                        </td>

                        <td style={estilos.celda}>
                          {registro.observacion ||
                            '—'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          <h3>
            Resumen por estudiante
          </h3>

          {!filasPorAlumno.length ? (
            <Feedback
              intent="info"
              title="Sin registros"
            >
              No se encontraron asistencias para
              los filtros seleccionados.
            </Feedback>
          ) : (
            <div
              style={{
                overflowX: 'auto',
              }}
            >
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    {encabezadosResumen.map(
                      (columna) => (
                        <th
                          key={columna}
                          style={{
                            ...estilos.celda,
                            background: '#f3f4f6',
                          }}
                        >
                          {columna}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filasPorAlumno.map(
                    (fila, indice) => (
                      <tr
                        key={
                          reporte.alumnos[indice]
                            .alumnoId
                        }
                      >
                        {fila.map(
                          (valor, columna) => (
                            <td
                              key={columna}
                              style={estilos.celda}
                            >
                              {valor}
                            </td>
                          )
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {reporte && !tieneRegistros && (
        <section style={estilos.tarjeta}>
          <h2>Resultados del reporte</h2>
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
        </section>
      )}
    </AppLayout>
  );
}
