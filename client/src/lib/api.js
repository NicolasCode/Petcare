export class ApiError extends Error {
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(method, url, body, contentType) {
  let res;
  const raw = body instanceof Blob;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': raw ? contentType : 'application/json' } : undefined,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No hay conexión. Revisa tu internet e inténtalo de nuevo.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('kaimi:unauthorized'));
    throw new ApiError(res.status, data.error || 'Ocurrió un error inesperado', data.fields);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  // Sube un archivo tal cual (fotos)
  upload: (url, blob) => request('PUT', url, blob, blob.type),
};
