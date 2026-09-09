import { ApiError, delay, getStore } from './store';
export const API_MODE =
  import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
/** The only HTTP transport. Configure a same-origin FastAPI reverse proxy in production. */
export async function endpoint<T>(
  method: string,
  path: string,
  body: unknown,
  mock: () => T | Promise<T>,
  allowOffline = false,
): Promise<T> {
  if (API_MODE === 'mock') {
    await delay();
    if (getStore().settings.offline && !allowOffline)
      throw new ApiError(
        'OFFLINE',
        'The local backend is unavailable. Reconnect in System Status or Settings, then retry.',
      );
    return mock();
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers:
      body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  }).catch(() => {
    throw new ApiError(
      'OFFLINE',
      'The local backend is unavailable. Please retry.',
    );
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
    };
    throw new ApiError(
      data.code ?? String(response.status),
      data.detail ?? 'The local service could not complete this request.',
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
