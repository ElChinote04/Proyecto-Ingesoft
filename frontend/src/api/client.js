const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
export class ApiError extends Error {
  constructor(status, error) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}
export async function api(path, { body, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: { ...(body && { 'Content-Type': 'application/json' }) },
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
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
      window.dispatchEvent(new Event('sage:expired'));
    throw new ApiError(response.status, payload.error);
  }
  return payload.data ?? payload;
}
