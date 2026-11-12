import type { z } from 'zod';

import { ERROR_CODE, type ApiErrorBody, type ErrorCode } from '@/domain/errors';
import { LOGIN_REASON, loginPath } from '@/domain/paths';
import { apiErrorResponse } from '@/domain/responses';
import { TAB_USER_HEADER } from '@/domain/session';

import { tabUserId } from './session-tab';

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

/**
 * Fetch JSON from our API and validate it with `schema` (from src/domain/responses.ts).
 * Errors come back as ApiError with the server's code; a body of the wrong shape is an error too.
 */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: { method?: string; body?: unknown },
): Promise<z.output<S>> {
  const headers = new Headers();
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json');
  const userId = tabUserId();
  if (userId !== null) headers.set(TAB_USER_HEADER, userId);

  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const data: unknown = await response.json().catch(() => null);

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    window.location.assign(loginPath(LOGIN_REASON.SESSION_ENDED));
  }
  if (!response.ok) {
    const failure = apiErrorResponse.safeParse(data);
    // Another tab switched the account: show this tab as the account the browser is signed in as.
    if (failure.success && failure.data.error.code === ERROR_CODE.SESSION_CHANGED) window.location.reload();
    throw new ApiError(
      response.status,
      failure.success ? failure.data.error : { code: ERROR_CODE.INTERNAL, message: `Request failed (${response.status})` },
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(response.status, { code: ERROR_CODE.INTERNAL, message: 'Unexpected response from the server' });
  }
  return parsed.data;
}
