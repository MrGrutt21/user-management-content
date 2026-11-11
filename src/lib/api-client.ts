import { ERROR_CODE, type ApiErrorBody, type ErrorCode } from '@/domain/errors';
import { LOGIN_REASON, loginPath } from '@/domain/paths';

/**
 * The only way client components talk to the server. It decides nothing about
 * permissions; it just reports what the API said. On 401 (not logged in, or
 * deactivated since the last request) it sends the browser to /login.
 */

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error: unknown = value.error;
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

export async function apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const data: unknown = await response.json().catch(() => null);

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    window.location.assign(loginPath(LOGIN_REASON.SESSION_ENDED));
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      isApiErrorBody(data) ? data.error : { code: ERROR_CODE.INTERNAL, message: `Request failed (${response.status})` },
    );
  }
  // The server is the source of these types (src/domain/types.ts); this is the one trusted boundary cast.
  return data as T;
}
