import 'server-only';

import { ERROR_CODE } from '@/domain/errors';
import type { LoginInput } from '@/domain/schemas';
import { USER_STATUS, type User } from '@/domain/types';
import { getStore } from '@/server/db/store';
import { AppError } from '@/server/http/errors';

import { createSession, resolveSession } from './session';

export function findUserByEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  for (const user of getStore().users.values()) {
    if (user.email === normalized) return user;
  }
  return undefined;
}

/**
 * Check the password and start a new session.
 *
 * A browser has one session cookie for all its tabs, so signing in while it already holds a live
 * session would silently switch every open tab to the new account. That is refused: log out first
 * (or use a private window for a second account). A dead or expired cookie does not count.
 */
export function login(input: LoginInput, currentToken?: string): { user: User; token: string; expiresAt: number } {
  const current = resolveSession(currentToken);
  if (current) {
    throw new AppError(
      ERROR_CODE.ALREADY_SIGNED_IN,
      `You are already signed in as ${current.fullName}. Log out first to use another account, or use a private window.`,
    );
  }
  const user = findUserByEmail(input.email);
  const password = user ? getStore().credentials.get(user.id) : undefined;
  if (!user || password !== input.password) {
    throw new AppError(ERROR_CODE.INVALID_CREDENTIALS, 'Invalid email or password');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw new AppError(ERROR_CODE.ACCOUNT_DEACTIVATED, 'This account is deactivated');
  }
  const { token, expiresAt } = createSession(user.id);
  return { user, token, expiresAt };
}
