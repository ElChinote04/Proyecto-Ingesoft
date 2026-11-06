const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
export class ApiError extends Error {
  constructor(status, error) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}
async function solicitar(path, options) {
  try {
    return await fetch(`${baseUrl}${path}`, { ...options, credentials: 'include' });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, {
      message: 'No pudimos conectar con el servidor. Comprueba la conexión y vuelve a intentar.',
      code: 'NETWORK_ERROR',
    });
  }
}
const leerJson = (response) =>
  response.json().catch(() => ({
    error: { message: 'El servidor devolvió una respuesta no válida.', code: 'INVALID_RESPONSE' },
  }));
function rechazar(response, path, payload) {
  if (response.status === 401 && !['/auth/login', '/auth/me', '/auth/logout'].includes(path))
    window.dispatchEvent(new Event('sage:expired'));
  if (payload.error?.code === 'PASSWORD_CHANGE_REQUIRED')
    window.dispatchEvent(new Event('sage:password-required'));
  throw new ApiError(response.status, payload.error);
}
export async function api(path, { body, headers, ...options } = {}) {
  // Con FormData el navegador pone el Content-Type, porque incluye el separador de las partes.
  const esFormulario = body instanceof FormData;
  const response = await solicitar(path, {
    ...options,
    headers: { ...(body && !esFormulario && { 'Content-Type': 'application/json' }), ...headers },
    ...(body && { body: esFormulario ? body : JSON.stringify(body) }),
  });
  const payload = await leerJson(response);
  if (!response.ok) rechazar(response, path, payload);
  return payload.data ?? payload;
}
// Pasa por fetch y no por un enlace para que un 401 o 404 se muestre en la pantalla.
export async function descargar(path, nombre) {
  const response = await solicitar(path);
  if (!response.ok) rechazar(response, path, await leerJson(response));
  const url = URL.createObjectURL(await response.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
