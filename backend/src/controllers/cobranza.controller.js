import * as service from '../services/cobranza.service.js';

export const obtenerMorosidad = async (req, res) =>
  res.json({ data: await service.obtenerMorosidad(req.validated.query) });

/** US-012: el mismo reporte en JSON (pantalla) o como PDF/Excel (descarga). */
export const obtenerReporte = async (req, res) => {
  const { formato, ...consulta } = req.validated.query;
  if (formato === 'json') return res.json({ data: await service.obtenerReporte(consulta) });
  const { archivo, tipo, nombreArchivo } = await service.exportarReporte(consulta, formato);
  return res
    .status(200)
    .set({
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': archivo.length,
      'Cache-Control': 'private, no-store',
    })
    .send(archivo);
};

export const obtenerAvisos = async (req, res) =>
  res.json({ data: await service.obtenerAvisos(req.user) });
