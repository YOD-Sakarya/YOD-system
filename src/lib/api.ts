import { getAuthHeaders } from './auth';
import { timeoutSignal } from './timeout';
/** Error carrying the HTTP status (0 when the server was unreachable). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/**
 * Typed fetch wrapper for the Express API: attaches the auth header, applies a 120s timeout,
 * turns failures into ApiError and announces expired sessions to the app.
 */
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    const authHeaders = await getAuthHeaders();
    for (const [name, value] of Object.entries(authHeaders)) headers.set(name, value);
    response = await fetch(`/api${url}`, {
      ...options,
      credentials: 'same-origin',
      headers,
      signal: options.signal || timeoutSignal(120000),
    });
  } catch (error) {
    // A caller-initiated abort is not a connectivity problem; let it propagate unchanged.
    if (options.signal?.aborted) throw error;
    throw new ApiError('تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجددًا.', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'تعذر الاتصال بالخادم. حاول مرة أخرى.' }));
    // Login/me are expected to 401 when signed out; any other 401 means the session expired.
    if (response.status === 401 && url !== '/auth/login' && url !== '/auth/me')
      window.dispatchEvent(new Event('yod-session-expired'));
    throw new ApiError(body?.message || 'تعذر إكمال الطلب.', response.status);
  }
  // 204 (e.g. logout/delete) has no body to parse.
  if (response.status === 204) return undefined as T;
  return response.json();
}
/** Serialises a request body for api(). */
export const json = (value: unknown) => JSON.stringify(value);
