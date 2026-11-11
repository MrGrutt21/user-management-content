import { NextRequest } from 'next/server';
import { expect } from 'vitest';

import * as loginRoute from '@/app/api/auth/login/route';

/**
 * Call route handlers the way Next does, with a real NextRequest, so the whole chain runs:
 * same-origin check -> params and body -> session -> capability -> zod schema -> service -> JSON.
 */

export type Params = Record<string, string>;
export type RouteHandler<P> = (req: NextRequest, context: { params: Promise<P> }) => Promise<Response>;

export type CallOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path and query, e.g. `/api/users/usr_dmytro`. */
  url: string;
  /** The `sid` cookie value from `login()`. */
  cookie?: string;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as is, for malformed JSON. */
  rawBody?: string;
  headers?: Record<string, string>;
};

/** Call a route handler the way Next does: one request, one `{ params }` promise. */
export function call(handler: RouteHandler<Params>, options: CallOptions): Promise<Response>;
export function call<P extends Record<string, string | string[]>>(handler: RouteHandler<P>, options: CallOptions & { params: P }): Promise<Response>;
export function call(handler: RouteHandler<Params>, options: CallOptions & { params?: Params }): Promise<Response> {
  const method = options.method ?? 'GET';
  // A real server always has a Host header; a bare NextRequest does not.
  const headers = new Headers({ host: 'localhost', ...options.headers });
  if (options.cookie !== undefined) headers.set('cookie', `sid=${options.cookie}`);
  let body: string | undefined = options.rawBody;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set('content-type', 'application/json');
  }
  const req = new NextRequest(`http://localhost${options.url}`, { method, headers, body });
  return handler(req, { params: Promise.resolve(options.params ?? {}) });
}

/** POST /api/auth/login and return the `sid` cookie value. */
export async function login(email: string, password: string): Promise<string> {
  const res = await call(loginRoute.POST, { method: 'POST', url: '/api/auth/login', body: { email, password } });
  expect(res.status).toBe(200);
  const sid = res.headers
    .getSetCookie()
    .map((cookie) => /^sid=([^;]*)/.exec(cookie)?.[1])
    .find((value) => value !== undefined && value !== '');
  if (!sid) throw new Error(`Login as ${email} set no session cookie`);
  return sid;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Assert the status, the code, and the error body shape `{ error: { code, message } }`. */
export async function expectError(res: Response, status: number, code: string): Promise<void> {
  expect(res.status).toBe(status);
  const body: unknown = await res.json();
  if (!isRecord(body) || !isRecord(body.error)) throw new Error(`Not an error body: ${JSON.stringify(body)}`);
  expect(Object.keys(body)).toEqual(['error']);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  expect(body.error.message).not.toBe('');
}

export async function readObject(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  if (!isRecord(body)) throw new Error(`Expected a JSON object, got ${JSON.stringify(body)}`);
  return body;
}

export async function readArray(res: Response): Promise<Record<string, unknown>[]> {
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error(`Expected a JSON array, got ${JSON.stringify(body)}`);
  return body.map((item: unknown) => {
    if (!isRecord(item)) throw new Error(`Expected an object, got ${JSON.stringify(item)}`);
    return item;
  });
}

