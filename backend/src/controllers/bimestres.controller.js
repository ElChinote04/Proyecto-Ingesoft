import * as service from '../services/bimestres.service.js';

export const listar = async (_req, res) => res.json({ data: await service.listarBimestres() });

export const modificarFechas = async (req, res) =>
  res.json({
    data: await service.modificarFechas(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req.requestId,
    ),
  });
