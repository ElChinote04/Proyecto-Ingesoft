const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
export class ApiError extends Error {
  constructor(status, error) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}
export async function api(path, { body, headers, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...headers },
      ...(body && { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, {
      message: 'No pudimos conectar con el servidor. Comprueba la conexión y vuelve a intentar.',
      code: 'NETWORK_ERROR',
    });
  }
  const payload = await response.json().catch(() => ({
    error: { message: 'El servidor devolvió una respuesta no válida.', code: 'INVALID_RESPONSE' },
  }));
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/me', '/auth/logout'].includes(path))
      window.dispatchEvent(new Event('sage:expired'));
    if (payload.error?.code === 'PASSWORD_CHANGE_REQUIRED')
      window.dispatchEvent(new Event('sage:password-required'));
    throw new ApiError(response.status, payload.error);
  }
  return payload.data ?? payload;
}

/**
 * Descarga un archivo del API (por ejemplo, un PDF) y lo guarda en el equipo.
 * Usa la misma cookie de sesión que api(); los errores llegan como ApiError.
 */
export async function descargarArchivo(path, nombrePorDefecto = 'archivo') {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(0, {
      message: 'No pudimos conectar con el servidor. Comprueba la conexión y vuelve a intentar.',
      code: 'NETWORK_ERROR',
    });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) window.dispatchEvent(new Event('sage:expired'));
    throw new ApiError(
      response.status,
      payload.error ?? { message: 'No pudimos descargar el archivo.', code: 'DOWNLOAD_FAILED' },
    );
  }
  const nombre =
    /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
    nombrePorDefecto;
  const url = URL.createObjectURL(await response.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
