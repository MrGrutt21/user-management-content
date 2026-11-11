import { beforeEach, describe, expect, it } from 'vitest';

import { USER_STATUS } from '@/domain/types';
import { createSession, resolveSession, revokeUserSessions } from '@/server/auth/session';
import { getStore, resetStore } from '@/server/db/store';

describe('sessions are resolved against the store on every request (rule 5)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('resolves an active user', () => {
    const { token } = createSession('usr_olena');
    expect(resolveSession(token)?.id).toBe('usr_olena');
  });

  it('a deactivated user is rejected on the very next request, without logging in again', () => {
    const { token } = createSession('usr_olena');
    const store = getStore();
    const olena = store.users.get('usr_olena');
    expect(olena).toBeDefined();
    if (!olena) return;

    store.users.set(olena.id, { ...olena, status: USER_STATUS.DEACTIVATED });

    expect(resolveSession(token)).toBeNull();
    // The dead session is dropped, so reactivation does not bring it back.
    store.users.set(olena.id, { ...olena, status: USER_STATUS.ACTIVE });
    expect(resolveSession(token)).toBeNull();
  });

  it('revokeUserSessions removes every session of that user only', () => {
    const a = createSession('usr_olena');
    const b = createSession('usr_olena');
    const other = createSession('usr_taras');
    revokeUserSessions('usr_olena');
    expect(resolveSession(a.token)).toBeNull();
    expect(resolveSession(b.token)).toBeNull();
    expect(resolveSession(other.token)?.id).toBe('usr_taras');
  });

  it('unknown and missing tokens resolve to nobody', () => {
    expect(resolveSession(undefined)).toBeNull();
    expect(resolveSession('not-a-session')).toBeNull();
  });

  it('a role change applies immediately because the role is read from the store', () => {
    const { token } = createSession('usr_anna');
    const store = getStore();
    const anna = store.users.get('usr_anna');
    if (!anna) throw new Error('seed changed');
    store.users.set(anna.id, { ...anna, role: 'user' });
    expect(resolveSession(token)?.role).toBe('user');
  });
});

describe('seed', () => {
  beforeEach(() => {
    resetStore();
  });

  it('has 1,000+ clients with a meaningful share churned, deterministically', () => {
    const { clients } = getStore();
    expect(clients.length).toBeGreaterThanOrEqual(1000);
    const churned = clients.filter((client) => client.status === 'churned').length;
    expect(churned / clients.length).toBeGreaterThan(0.2);
    const firstRun = clients.slice(0, 5);
    resetStore();
    expect(getStore().clients.slice(0, 5)).toEqual(firstRun);
  });

  it('covers the scenarios: two IT, a manager without reports, deactivated user and manager', () => {
    const users = [...getStore().users.values()];
    const active = users.filter((user) => user.status === USER_STATUS.ACTIVE);
    expect(active.filter((user) => user.role === 'it')).toHaveLength(2);
    expect(users.filter((user) => user.managerId === 'usr_anna')).toHaveLength(4);
    expect(users.filter((user) => user.managerId === 'usr_marta')).toHaveLength(0);
    expect(getStore().users.get('usr_maksym')?.status).toBe(USER_STATUS.DEACTIVATED);
    expect(getStore().users.get('usr_yulia')?.managerId).toBe('usr_serhii');
    expect(getStore().users.get('usr_serhii')?.status).toBe(USER_STATUS.DEACTIVATED);
  });
});
