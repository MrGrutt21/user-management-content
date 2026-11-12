import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

import { ERROR_CODE } from '@/domain/errors';
import type { Action } from '@/domain/roles';
import { TAB_USER_HEADER } from '@/domain/session';
import type { User } from '@/domain/types';
import { hasCapability } from '@/server/auth/permissions';
import { SESSION_COOKIE, resolveSession } from '@/server/auth/session';

import { AppError } from './errors';

/**
 * Every route handler is wrapped in `withApi` (or `withPublicApi` for login/logout/reset).
 *
 * The wrapper does ALL the awaiting first (route params, request body). From the moment
 * the session is resolved to the moment the handler has written to the store, everything
 * is synchronous, and the handler type does not allow `async`. Node runs one piece of
 * synchronous code at a time, so nobody can be deactivated or demoted between "this user
 * may do it" and "it is done" (e.g. two IT deactivating each other at the same moment).
 *
 * Order: same-origin check for writes -> params + raw body -> session -> same user as the tab
 * -> capability -> handler.
 * Target-specific checks (direct reports, yourself, last IT) are in the services.
 */

type RouteContext<P> = { params: Promise<P> };

type ApiInput<P> = { req: NextRequest; user: User; params: P; body: unknown };
type PublicInput<P> = { req: NextRequest; params: P; body: unknown };

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function withApi<P = Record<string, string>>(
  options: { capability?: Action },
  handler: (input: ApiInput<P>) => Response,
): (req: NextRequest, context: RouteContext<P>) => Promise<Response> {
  return async (req, context) => {
    try {
      assertSameOrigin(req);
      const params = await context.params;
      const body = await readBody(req);
      // No await below this line.
      const user = resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
      if (!user) {
        throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Not logged in or session has ended');
      }
      // A stale tab must not act as whoever signed in later in another tab (see src/domain/session.ts).
      const tabUser = req.headers.get(TAB_USER_HEADER);
      if (tabUser !== null && tabUser !== user.id) {
        throw new AppError(
          ERROR_CODE.SESSION_CHANGED,
          `This browser is now signed in as ${user.fullName}, not the account this page was opened for. Reloading.`,
        );
      }
      if (options.capability && !hasCapability(user, options.capability)) {
        throw new AppError(ERROR_CODE.FORBIDDEN, 'Your role is not allowed to do this');
      }
      return handler({ req, user, params, body });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function withPublicApi<P = Record<string, string>>(
  handler: (input: PublicInput<P>) => Response,
): (req: NextRequest, context: RouteContext<P>) => Promise<Response> {
  return async (req, context) => {
    try {
      assertSameOrigin(req);
      const params = await context.params;
      const body = await readBody(req);
      return handler({ req, params, body });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Validate a body or query with a zod schema; invalid input (or an unknown key in a strict schema) is a 400. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(ERROR_CODE.VALIDATION, 'Invalid input', result.error.issues);
  }
  return result.data;
}

/** True for HTTPS, including behind a reverse proxy that terminates TLS. */
export function isHttpsRequest(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  return req.nextUrl.protocol === 'https:';
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return json(error.toBody(), { status: error.status });
  }
  console.error(error);
  const internal = new AppError(ERROR_CODE.INTERNAL, 'Unexpected server error');
  return json(internal.toBody(), { status: internal.status });
}

/** Every request body here is a few short fields; anything bigger is refused before it is buffered. */
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * The JSON body as `unknown` (undefined when there is none). Handlers validate it with `parseOrThrow`.
 * A body must be JSON (415 otherwise) and at most MAX_BODY_BYTES (413), whatever Content-Length claims.
 */
async function readBody(req: NextRequest): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const text = await readLimitedText(req);
  if (text.trim() === '') return undefined;
  const contentType = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    throw new AppError(ERROR_CODE.UNSUPPORTED_MEDIA_TYPE, 'Send the body as JSON with Content-Type: application/json');
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw new AppError(ERROR_CODE.VALIDATION, 'Body must be valid JSON');
  }
}

async function readLimitedText(req: NextRequest): Promise<string> {
  const tooLarge = () => new AppError(ERROR_CODE.PAYLOAD_TOO_LARGE, `The body must be at most ${MAX_BODY_BYTES} bytes`);
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) throw tooLarge();
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Cheap CSRF guard for writes: a browser always sends Origin on cross-site
 * POST/PATCH, and it must match the host we are served on. Requests without
 * Origin (curl, server-to-server) are allowed; the cookie is also SameSite=Lax.
 */
function assertSameOrigin(req: NextRequest): void {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError(ERROR_CODE.FORBIDDEN, 'Bad Origin header');
  }
  if (host === null || originHost !== host) {
    throw new AppError(ERROR_CODE.FORBIDDEN, 'Cross-site request rejected');
  }
}
