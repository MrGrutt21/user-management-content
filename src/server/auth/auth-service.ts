import 'server-only';

import { ERROR_CODE } from '@/domain/errors';
import type { LoginInput } from '@/domain/schemas';
import { USER_STATUS, type User } from '@/domain/types';
import { getStore } from '@/server/db/store';
import { AppError } from '@/server/http/errors';

import { createSession } from './session';

export function findUserByEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  for (const user of getStore().users.values()) {
    if (user.email === normalized) return user;
  }
  return undefined;
}

export function login(input: LoginInput): { user: User; token: string; expiresAt: number } {
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
