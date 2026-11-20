import * as service from '../services/evidenciasPedagogicas.service.js';

export const listar = async (req, res) =>
  res.json({ data: await service.listarEvidencias(req.validated.query, req.user) });

export const detalle = async (req, res) =>
  res.json({ data: await service.obtenerEvidencia(req.validated.params.id, req.user) });

export const crear = async (req, res) =>
  res.status(201).json({
    data: await service.crearEvidencia(
      req.validated.body,
      req.files ?? [],
      req.user,
      req.requestId,
    ),
  });

export const modificar = async (req, res) =>
  res.json({
    data: await service.modificarEvidencia(
      req.validated.params.id,
      req.validated.body,
      req.files ?? [],
      req.user,
      req.requestId,
    ),
  });

export const revisar = async (req, res) =>
  res.json({
    data: await service.revisarEvidencia(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req.requestId,
    ),
  });

export const darDeBaja = async (req, res) =>
  res.json({
    data: await service.darDeBajaEvidencia(
      req.validated.params.id,
      req.validated.body?.motivo,
      req.user,
      req.requestId,
    ),
  });

export const quitarArchivo = async (req, res) =>
  res.json({
    data: await service.quitarArchivo(
      req.validated.params.id,
      req.validated.params.archivoId,
      req.validated.body?.motivo,
      req.user,
      req.requestId,
    ),
  });

export async function descargarArchivo(req, res) {
  const { contenido, nombre, tipoMime } = await service.descargarArchivo(
    req.validated.params.id,
    req.validated.params.archivoId,
    req.user,
  );
  res.attachment(nombre).set('Content-Type', tipoMime).send(contenido);
}
