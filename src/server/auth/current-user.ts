import 'server-only';

import { cookies } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';

import { LOGIN_REASON, loginPath } from '@/domain/paths';
import type { Action } from '@/domain/roles';
import type { User } from '@/domain/types';

import { hasCapability } from './permissions';
import { SESSION_COOKIE, resolveSession } from './session';

/**
 * Guards for pages (server components). Route handlers use `withApi` instead.
 * Never wrap these in try/catch: `redirect()` and `forbidden()` work by throwing.
 */

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
}

/** Not logged in (or deactivated since the last request) -> /login. */
export async function requireUser(): Promise<User> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = resolveSession(token);
  if (!user) {
    redirect(token ? loginPath(LOGIN_REASON.SESSION_ENDED) : loginPath());
  }
  return user;
}

/** Logged in but the role lacks the capability -> real HTTP 403 page (app/forbidden.tsx). */
export async function requirePage(action: Action): Promise<User> {
  const user = await requireUser();
  if (!hasCapability(user, action)) {
    forbidden();
  }
  return user;
}
