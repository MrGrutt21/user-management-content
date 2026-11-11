import 'server-only';

import { ROLE_POLICIES } from '@/domain/roles';
import type { DemoAccount } from '@/domain/types';
import { getConfig } from '@/server/config';
import { getStore, resetStore } from '@/server/db/store';

/**
 * Live-demo helpers, all behind DEMO_RESET=true. Reviewers share one in-memory
 * store, so anyone may put it back to the factory seed. This is a demo convenience
 * outside the permission model; with DEMO_RESET off none of it is reachable.
 */

export function isDemoResetEnabled(): boolean {
  return getConfig().demoResetEnabled;
}

/** Users, passwords and clients back to the seed. The new store has no sessions, so everyone is logged out. */
export function resetDemoData(): void {
  resetStore();
}

/**
 * Every login as it is now (seeded first, then any created since the last reset), shown on /login.
 * Read from the live store, so a changed email, role or status shows up at once.
 * Empty unless demo mode is on: passwords are never shown otherwise.
 */
export function listDemoAccounts(): DemoAccount[] {
  if (!isDemoResetEnabled()) return [];
  const { users, credentials } = getStore();
  return [...users.values()].map((user) => ({
    fullName: user.fullName,
    email: user.email,
    password: credentials.get(user.id) ?? '',
    roleLabel: ROLE_POLICIES[user.role].label,
    status: user.status,
  }));
}
