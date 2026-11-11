import 'server-only';

import { randomBytes } from 'node:crypto';

import { USER_STATUS, type User } from '@/domain/types';
import { getConfig } from '@/server/config';
import { getStore } from '@/server/db/store';

/**
 * Sessions are opaque random tokens kept in memory, not JWTs. The cookie only
 * says "which session"; who the user is, their role and their status are read
 * from the store on EVERY request. That is what makes rule 5 work: once a user is
 * deactivated, their very next request resolves to no user.
 */

export const SESSION_COOKIE = 'sid';

export type CookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  expires: Date;
};

export function createSession(userId: string): { token: string; expiresAt: number } {
  const now = Date.now();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + getConfig().sessionTtlMs;
  getStore().sessions.set(token, { userId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

/** Token -> active user, or null. Deletes sessions that are expired or belong to a non-active user. */
export function resolveSession(token: string | undefined): User | null {
  if (!token) return null;
  const store = getStore();
  const session = store.sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    store.sessions.delete(token);
    return null;
  }
  const user = store.users.get(session.userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    store.sessions.delete(token);
    return null;
  }
  return user;
}

export function deleteSession(token: string | undefined): void {
  if (token) getStore().sessions.delete(token);
}

/** Called when a user is deactivated, so a later reactivation does not bring old sessions back. */
export function revokeUserSessions(userId: string): void {
  const { sessions } = getStore();
  for (const [token, session] of sessions) {
    if (session.userId === userId) sessions.delete(token);
  }
}

export function sessionCookieOptions(expiresAt: number, requestIsHttps: boolean): CookieOptions {
  const { cookieSecure } = getConfig();
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure === 'auto' ? requestIsHttps : cookieSecure,
    path: '/',
    expires: new Date(expiresAt),
  };
}

export function expiredCookieOptions(requestIsHttps: boolean): CookieOptions {
  return sessionCookieOptions(0, requestIsHttps);
}
