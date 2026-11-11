import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

import { ERROR_CODE } from '@/domain/errors';
import type { Action } from '@/domain/roles';
import type { User } from '@/domain/types';
import { hasCapability } from '@/server/auth/permissions';
import { SESSION_COOKIE, resolveSession } from '@/server/auth/session';

import { AppError } from './errors';

/**
 * Every route handler is wrapped in `withApi` (or `withPublicApi` for login).
 * Order: same-origin check for writes -> session -> capability -> handler.
 * Target-specific checks (direct reports, yourself, last IT) happen in the services.
 */

type RouteContext<P> = { params: Promise<P> };

type ApiHandler<P> = (input: { req: NextRequest; user: User; params: P }) => Promise<Response> | Response;
type PublicHandler<P> = (input: { req: NextRequest; params: P }) => Promise<Response> | Response;

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function withApi<P = Record<string, string>>(
  options: { capability?: Action },
  handler: ApiHandler<P>,
): (req: NextRequest, context: RouteContext<P>) => Promise<Response> {
  return async (req, context) => {
    try {
      assertSameOrigin(req);
      const user = resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
      if (!user) {
        throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Not logged in or session has ended');
      }
      if (options.capability && !hasCapability(user, options.capability)) {
        throw new AppError(ERROR_CODE.FORBIDDEN, 'Your role is not allowed to do this');
      }
      return await handler({ req, user, params: await context.params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function withPublicApi<P = Record<string, string>>(
  handler: PublicHandler<P>,
): (req: NextRequest, context: RouteContext<P>) => Promise<Response> {
  return async (req, context) => {
    try {
      assertSameOrigin(req);
      return await handler({ req, params: await context.params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Parse a JSON body with a zod schema; anything invalid (or unknown keys) is a 400. */
export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(ERROR_CODE.VALIDATION, 'Body must be valid JSON');
  }
  return parseOrThrow(schema, body);
}

/** Parse query params (or any value) with a zod schema; invalid input is a 400. */
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
  if (host !== null && originHost !== host) {
    throw new AppError(ERROR_CODE.FORBIDDEN, 'Cross-site request rejected');
  }
}
