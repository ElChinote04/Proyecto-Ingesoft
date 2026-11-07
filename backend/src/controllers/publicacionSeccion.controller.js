import * as service from '../services/publicacionSeccion.service.js';

export const consultar = async (req, res) =>
  res.json({
    data: await service.obtenerEstadoPublicacion(req.validated.params.id, req.validated.query),
  });

export async function publicar(req, res) {
  const { id, seccionId } = req.validated.params;
  const resultado = await service.publicarSeccion(id, seccionId, req.user, req.requestId);
  res.status(resultado.yaPublicado ? 200 : 201).json({ data: resultado });
}

export const publicarVarias = async (req, res) =>
  res.json({
    data: await service.publicarSecciones(
      req.validated.params.id,
      req.validated.body.seccionIds,
      req.user,
      req.requestId,
    ),
  });
