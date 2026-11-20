import * as service from '../services/evaluaciones.service.js';

export const listar = async (req, res) =>
  res.json({ data: await service.listarEvaluaciones(req.validated.query, req.user) });

export const crear = async (req, res) =>
  res
    .status(201)
    .json({ data: await service.crearEvaluacion(req.validated.body, req.user, req.requestId) });

export const modificar = async (req, res) =>
  res.json({
    data: await service.modificarEvaluacion(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req.requestId,
    ),
  });

export async function eliminar(req, res) {
  await service.eliminarEvaluacion(req.validated.params.id, req.user, req.requestId);
  res.status(204).end();
}

export const pendientes = async (req, res) =>
  res.json({ data: await service.listarPendientes(req.validated.params.id, req.user) });

export const registrarResultado = async (req, res) =>
  res.json({
    data: await service.registrarResultado(
      req.validated.params.id,
      req.validated.params.matriculaId,
      req.validated.body,
      req.files ?? [],
      req.user,
      req.requestId,
    ),
  });

export async function quitarResultado(req, res) {
  await service.quitarResultado(
    req.validated.params.id,
    req.validated.params.matriculaId,
    req.user,
    req.requestId,
  );
  res.status(204).end();
}

export async function descargarArchivo(req, res) {
  const { contenido, nombre, tipoMime } = await service.descargarArchivo(
    req.validated.params,
    req.user,
  );
  res.attachment(nombre).set('Content-Type', tipoMime).send(contenido);
}
