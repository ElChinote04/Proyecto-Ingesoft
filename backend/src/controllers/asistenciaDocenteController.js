
import * as service from '../services/asistenciaDocenteService.js';

// 1. Registrar o actualizar asistencia de un docente
export const registrar = async (req, res) => {
  const { docenteId, fecha } = req.validated.params;

  const resultado = await service.registrarAsistencia(
    docenteId,
    {
      ...req.validated.body,
      fecha,
    },
    req.user,
    req.requestId
  );

  return res.json({
    data: resultado
  });
};

// 2. Obtener el historial de asistencia de un docente
export const historial = async (req, res) => {
  const { docenteId } = req.validated.params;

  const resultado = await service.obtenerHistorial(
    docenteId,
    req.user
  );

  return res.json({
    data: resultado
  });
};

// 3. Obtener el reporte de asistencia de docentes
export const reporte = async (req, res) => {
  const filtros = req.validated.query;

  const resultado = await service.obtenerReporte(
    filtros,
    req.user
  );

  return res.json({
    data: resultado
  });
};
