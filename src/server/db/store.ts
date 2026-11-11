import 'server-only';

import type { Client, User } from '@/domain/types';

import { generateClients } from './seed-clients';
import { seedUsers } from './seed-users';

export type Session = {
  userId: string;
  createdAt: number;
  expiresAt: number;
};

/** The whole "database". It lives in memory and resets when the process restarts. */
export type Store = {
  users: Map<string, User>;
  /** userId -> plain-text password. Kept apart from User so it can never leak into a response. */
  credentials: Map<string, string>;
  /** Kept in id order; services sort/filter a copy per request. */
  clients: readonly Client[];
  clientsById: ReadonlyMap<string, Client>;
  /** session token -> session. */
  sessions: Map<string, Session>;
};

export function createStore(): Store {
  const { users, credentials } = seedUsers();
  const clients = generateClients();
  return {
    users: new Map(users.map((user) => [user.id, user])),
    credentials,
    clients,
    clientsById: new Map(clients.map((client) => [client.id, client])),
    sessions: new Map(),
  };
}

/*
 * One store per process. Next.js can evaluate a module more than once (dev HMR,
 * separate bundles for route handlers and server components), and a plain
 * module-level `const` would then give each copy its own users and sessions.
 * globalThis is shared by all of them. The cast only adds our own property.
 */
const globalForStore = globalThis as typeof globalThis & { __appStore?: Store };

/** Always call this; never keep the result in a module-level variable (reset swaps the object). */
export function getStore(): Store {
  globalForStore.__appStore ??= createStore();
  return globalForStore.__appStore;
}

/** Back to the factory seed: users, passwords, clients and all sessions. Used by tests and the demo reset. */
export function resetStore(): Store {
  globalForStore.__appStore = createStore();
  return globalForStore.__appStore;
}
