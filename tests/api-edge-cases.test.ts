import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as catchAllRoute from '@/app/api/[...path]/route';
import * as loginRoute from '@/app/api/auth/login/route';
import * as logoutRoute from '@/app/api/auth/logout/route';
import * as clientRoute from '@/app/api/clients/[id]/route';
import * as clientsRoute from '@/app/api/clients/route';
import * as healthRoute from '@/app/api/health/route';
import * as meRoute from '@/app/api/me/route';
import * as userRoleRoute from '@/app/api/users/[id]/role/route';
import * as userRoute from '@/app/api/users/[id]/route';
import * as userStatusRoute from '@/app/api/users/[id]/status/route';
import * as usersRoute from '@/app/api/users/route';
import { getStore, resetStore } from '@/server/db/store';
import { MAX_BODY_BYTES } from '@/server/http/api';

import { call, expectError, isRecord, login, readArray, readObject } from './support/route-call';

/**
 * Everything around the six scenarios: bad input, odd ids, sessions that expire or change
 * under the user, concurrent writes, and the role changes that move people between scopes.
 */

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
});

function patchProfile(cookie: string, id: string, body: unknown): Promise<Response> {
  return call(userRoute.PATCH, { method: 'PATCH', url: `/api/users/${id}`, cookie, body, params: { id } });
}

function patchRole(cookie: string, id: string, role: string): Promise<Response> {
  return call(userRoleRoute.PATCH, { method: 'PATCH', url: `/api/users/${id}/role`, cookie, body: { role }, params: { id } });
}

function patchStatus(cookie: string, id: string, status: string): Promise<Response> {
  return call(userStatusRoute.PATCH, { method: 'PATCH', url: `/api/users/${id}/status`, cookie, body: { status }, params: { id } });
}

function createUser(cookie: string, body: unknown): Promise<Response> {
  return call(usersRoute.POST, { method: 'POST', url: '/api/users', cookie, body });
}

function getUsers(cookie: string): Promise<Response> {
  return call(usersRoute.GET, { url: '/api/users', cookie });
}

function getClients(cookie: string, query = ''): Promise<Response> {
  return call(clientsRoute.GET, { url: `/api/clients${query}`, cookie });
}

const NEW_USER = {
  fullName: 'Petro Ivanenko',
  email: 'petro@example.com',
  role: 'user',
  managerId: 'usr_anna',
  password: 'petro123',
};

// ---------------------------------------------------------------------------------------------

describe('request bodies', () => {
  it(`a body over ${MAX_BODY_BYTES} bytes is 413, with or without a Content-Length`, async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const huge = JSON.stringify({ fullName: 'x'.repeat(MAX_BODY_BYTES) });
    const id = 'usr_olena';
    const base = { method: 'PATCH' as const, url: `/api/users/${id}`, cookie: ivan, params: { id }, rawBody: huge };
    await expectError(await call(userRoute.PATCH, { ...base, headers: { 'content-type': 'application/json' } }), 413, 'PAYLOAD_TOO_LARGE');
    await expectError(
      await call(userRoute.PATCH, { ...base, headers: { 'content-type': 'application/json', 'content-length': String(huge.length) } }),
      413,
      'PAYLOAD_TOO_LARGE',
    );
    expect(getStore().users.get(id)?.fullName).toBe('Olena Kravchenko');
  });

  it('a body that is not declared as JSON is 415 (a cross-site HTML form cannot send JSON)', async () => {
    const res = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      rawBody: 'email=ivan%40example.com&password=ivan123',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    await expectError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('application/json with a charset is fine', async () => {
    const res = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      rawBody: JSON.stringify({ email: 'ivan@example.com', password: 'ivan123' }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    expect(res.status).toBe(200);
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"hello"'],
    ['null', 'null'],
    ['a number', '42'],
  ])('a JSON body that is %s is a 400', async (_label, rawBody) => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const res = await call(userRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena',
      cookie: ivan,
      rawBody,
      headers: { 'content-type': 'application/json' },
      params: { id: 'usr_olena' },
    });
    await expectError(res, 400, 'VALIDATION');
  });

  it('__proto__ and constructor keys are unknown keys: 400, and no role is changed', async () => {
    const anna = await login('anna@example.com', 'anna123');
    for (const rawBody of [
      '{"fullName":"Olena","__proto__":{"role":"it"}}',
      '{"fullName":"Olena","constructor":{"prototype":{"role":"it"}}}',
    ]) {
      const res = await call(userRoute.PATCH, {
        method: 'PATCH',
        url: '/api/users/usr_olena',
        cookie: anna,
        rawBody,
        headers: { 'content-type': 'application/json' },
        params: { id: 'usr_olena' },
      });
      await expectError(res, 400, 'VALIDATION');
    }
    expect(getStore().users.get('usr_olena')?.role).toBe('user');
    expect(Object.prototype).not.toHaveProperty('role');
  });

  it('a VALIDATION error lists the failing fields', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const res = await createUser(ivan, { ...NEW_USER, email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    const body = await readObject(res);
    const details = isRecord(body.error) ? body.error.details : undefined;
    expect(Array.isArray(details)).toBe(true);
    const paths = Array.isArray(details) ? details.map((issue: unknown) => (isRecord(issue) ? issue.path : null)) : [];
    expect(paths).toEqual(expect.arrayContaining([['email'], ['password']]));
  });
});

// ---------------------------------------------------------------------------------------------

describe('creating users', () => {
  it.each([
    ['an unknown role', { role: 'admin' }],
    ['no password', { password: undefined }],
    ['a 5-character password', { password: '12345' }],
    ['a blank name', { fullName: '   ' }],
    ['a 101-character name', { fullName: 'x'.repeat(101) }],
    ['an empty managerId (send null for none)', { managerId: '' }],
    ['an extra key', { status: 'deactivated' }],
  ])('%s is a 400 and nothing is created', async (_label, change) => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const before = getStore().users.size;
    await expectError(await createUser(ivan, { ...NEW_USER, ...change }), 400, 'VALIDATION');
    expect(getStore().users.size).toBe(before);
  });

  it('the email of a deactivated account is still taken', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await createUser(ivan, { ...NEW_USER, email: 'MAKSYM@example.com' }), 409, 'EMAIL_TAKEN');
  });

  it('an IT or manager account with a manager is INVALID_MANAGER', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await createUser(ivan, { ...NEW_USER, role: 'manager' }), 400, 'INVALID_MANAGER');
    await expectError(await createUser(ivan, { ...NEW_USER, role: 'it' }), 400, 'INVALID_MANAGER');
    expect((await createUser(ivan, { ...NEW_USER, role: 'manager', managerId: null })).status).toBe(201);
  });

  it('a name with HTML or any script is stored and returned as plain text', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const fullName = '<img src=x onerror=alert(1)> Олена 👩‍💻';
    const res = await createUser(ivan, { ...NEW_USER, fullName });
    expect(res.status).toBe(201);
    expect((await readObject(res)).fullName).toBe(fullName);
  });

  it('two identical creates at the same moment: one 201, one 409', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const statuses = (await Promise.all([createUser(ivan, NEW_USER), createUser(ivan, NEW_USER)])).map((res) => res.status);
    expect(statuses.sort()).toEqual([201, 409]);
    expect([...getStore().users.values()].filter((user) => user.email === NEW_USER.email)).toHaveLength(1);
  });

  it('the new user shows up in their manager’s list on the next request', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const anna = await login('anna@example.com', 'anna123');
    await createUser(ivan, NEW_USER);
    expect((await readArray(await getUsers(anna))).map((row) => row.email)).toContain('petro@example.com');
  });
});

// ---------------------------------------------------------------------------------------------

describe('editing profiles', () => {
  it('a manager cannot edit their own profile (only direct reports)', async () => {
    const anna = await login('anna@example.com', 'anna123');
    await expectError(await patchProfile(anna, 'usr_anna', { fullName: 'Anna S.' }), 403, 'FORBIDDEN');
  });

  it('outside her scope Anna gets 403 before any email check, so she learns nothing about other emails', async () => {
    const anna = await login('anna@example.com', 'anna123');
    await expectError(await patchProfile(anna, 'usr_dmytro', { email: 'ivan@example.com' }), 403, 'FORBIDDEN');
    await expectError(await patchProfile(anna, 'usr_olena', { email: 'ivan@example.com' }), 409, 'EMAIL_TAKEN');
  });

  it('changing your email changes your login at once', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    expect((await patchProfile(ivan, 'usr_ivan', { email: 'Ivan.P@Example.com' })).status).toBe(200);
    const old = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'ivan@example.com', password: 'ivan123' },
    });
    await expectError(old, 401, 'INVALID_CREDENTIALS');
    await login('ivan.p@example.com', 'ivan123');
  });

  it('saving your own email in another case is not EMAIL_TAKEN', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    expect((await patchProfile(ivan, 'usr_ivan', { email: 'IVAN@example.com' })).status).toBe(200);
  });

  it.each([
    ['an empty name', { fullName: '' }],
    ['a bad email', { email: 'olena' }],
    ['a null name', { fullName: null }],
  ])('%s is a 400', async (_label, body) => {
    const anna = await login('anna@example.com', 'anna123');
    await expectError(await patchProfile(anna, 'usr_olena', body), 400, 'VALIDATION');
  });
});

// ---------------------------------------------------------------------------------------------

describe('roles and statuses through HTTP', () => {
  it('an unknown role or status is a 400', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await patchRole(ivan, 'usr_olena', 'admin'), 400, 'VALIDATION');
    await expectError(await patchStatus(ivan, 'usr_olena', 'banned'), 400, 'VALIDATION');
  });

  it('an unknown id is 404 for IT', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await patchRole(ivan, 'usr_nobody', 'manager'), 404, 'NOT_FOUND');
    await expectError(await patchStatus(ivan, 'usr_nobody', 'active'), 404, 'NOT_FOUND');
  });

  it('setting the same role or status again is a harmless 200', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    expect((await patchRole(ivan, 'usr_ivan', 'it')).status).toBe(200);
    expect((await patchStatus(ivan, 'usr_ivan', 'active')).status).toBe(200);
  });

  it('Ivan cannot leave IT through the role endpoint either: self, then last', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await patchRole(ivan, 'usr_ivan', 'manager'), 403, 'CANNOT_CHANGE_OWN_ROLE');
    expect((await patchRole(ivan, 'usr_iryna', 'manager')).status).toBe(200);
    await expectError(await patchRole(ivan, 'usr_ivan', 'manager'), 409, 'LAST_ACTIVE_ROLE_MEMBER');
  });

  it('a reactivated IT counts again: Ivan may then hand over and be deactivated by Iryna', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    expect((await patchStatus(ivan, 'usr_iryna', 'deactivated')).status).toBe(200);
    expect((await patchStatus(ivan, 'usr_iryna', 'active')).status).toBe(200);
    const iryna = await login('iryna@example.com', 'iryna123');
    expect((await patchStatus(iryna, 'usr_ivan', 'deactivated')).status).toBe(200);
    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: ivan }), 401, 'UNAUTHENTICATED');
  });

  it('Olena promoted to manager: the next request already uses the new role', async () => {
    const olena = await login('olena@example.com', 'olena123');
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await getUsers(olena), 403, 'FORBIDDEN');
    await patchRole(ivan, 'usr_olena', 'manager');
    expect(await readArray(await getUsers(olena))).toEqual([]);
    expect((await readObject(await call(meRoute.GET, { url: '/api/me', cookie: olena }))).roleLabel).toBe('Manager');
  });

  it('Anna demoted to user: on her next request she loses /api/users but keeps content', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const ivan = await login('ivan@example.com', 'ivan123');
    await patchRole(ivan, 'usr_anna', 'user');
    await expectError(await getUsers(anna), 403, 'FORBIDDEN');
    await expectError(await patchProfile(anna, 'usr_olena', { fullName: 'X' }), 403, 'FORBIDDEN');
    expect((await getClients(anna)).status).toBe(200);
  });

  it('Anna promoted to IT: on her next request content is 403 and every user is visible', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const ivan = await login('ivan@example.com', 'ivan123');
    await patchRole(ivan, 'usr_anna', 'it');
    await expectError(await getClients(anna), 403, 'FORBIDDEN');
    expect(await readArray(await getUsers(anna))).toHaveLength(getStore().users.size);
  });
});

// ---------------------------------------------------------------------------------------------

describe('who may read what', () => {
  it('a user: /api/me yes, users no (not even their own row), clients yes', async () => {
    const olena = await login('olena@example.com', 'olena123');
    expect((await call(meRoute.GET, { url: '/api/me', cookie: olena })).status).toBe(200);
    await expectError(await getUsers(olena), 403, 'FORBIDDEN');
    await expectError(await call(userRoute.GET, { url: '/api/users/usr_olena', cookie: olena, params: { id: 'usr_olena' } }), 403, 'FORBIDDEN');
    expect((await getClients(olena)).status).toBe(200);
  });

  it('IT: no clients, not even one by id', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await call(clientRoute.GET, { url: '/api/clients/cl_0001', cookie: ivan, params: { id: 'cl_0001' } }), 403, 'FORBIDDEN');
  });

  it('a manager reads a direct report with the allowed flags, and nobody else', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const own = await readObject(await call(userRoute.GET, { url: '/api/users/usr_olena', cookie: anna, params: { id: 'usr_olena' } }));
    expect(own.allowed).toMatchObject({ editProfile: { allowed: true }, changeRole: { allowed: false, code: 'FORBIDDEN' } });
    await expectError(await call(userRoute.GET, { url: '/api/users/usr_dmytro', cookie: anna, params: { id: 'usr_dmytro' } }), 403, 'FORBIDDEN');
  });

  it('unknown client ids are 404, including odd ones', async () => {
    const anna = await login('anna@example.com', 'anna123');
    for (const id of ['cl_9999', 'cl_0000', '', '../users', '%00', 'cl_0001 ']) {
      await expectError(await call(clientRoute.GET, { url: `/api/clients/${encodeURIComponent(id)}`, cookie: anna, params: { id } }), 404, 'NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------------------------

describe('client list paging', () => {
  it.each([
    ['page=0', '?page=0'],
    ['page=-1', '?page=-1'],
    ['page=1.5', '?page=1.5'],
    ['page=abc', '?page=abc'],
    ['limit=0', '?limit=0'],
    ['limit=101', '?limit=101'],
    ['sort=password', '?sort=password'],
    ['order=up', '?order=up'],
    ['status=lost', '?status=lost'],
    ['a 101-character search', `?q=${'a'.repeat(101)}`],
  ])('%s is a 400', async (_label, query) => {
    const anna = await login('anna@example.com', 'anna123');
    await expectError(await getClients(anna, query), 400, 'VALIDATION');
  });

  it('an unknown query parameter is ignored', async () => {
    const anna = await login('anna@example.com', 'anna123');
    expect((await readObject(await getClients(anna, '?foo=bar&limit=10'))).limit).toBe(10);
  });

  it('a page past the end is empty but still reports the total', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const body = await readObject(await getClients(anna, '?page=999'));
    expect(body).toMatchObject({ items: [], page: 999, total: 1200, totalPages: 48 });
  });

  it.each(['name', 'company', 'country', 'status', 'createdAt'])(
    'walking every page sorted by %s returns each client exactly once',
    async (sort) => {
      const anna = await login('anna@example.com', 'anna123');
      const ids: unknown[] = [];
      for (let page = 1; page <= 12; page += 1) {
        const body = await readObject(await getClients(anna, `?sort=${sort}&order=asc&limit=100&page=${page}`));
        expect(body.totalPages).toBe(12);
        if (Array.isArray(body.items)) ids.push(...body.items.map((item: unknown) => (isRecord(item) ? item.id : null)));
      }
      expect(ids).toHaveLength(1200);
      expect(new Set(ids).size).toBe(1200);
    },
  );

  it('search treats regex characters as text and never fails', async () => {
    const anna = await login('anna@example.com', 'anna123');
    for (const q of ['(', '.*', '[a-z]+', '\\', '%', '"; DROP TABLE clients; --']) {
      const res = await getClients(anna, `?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
    }
  });

  it('filters combine: churned clients matching a search', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const all = await readObject(await getClients(anna, '?status=churned&limit=100'));
    expect(all.total).toBeGreaterThan(200);
    const items = Array.isArray(all.items) ? all.items : [];
    expect(items.every((item: unknown) => isRecord(item) && item.status === 'churned')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

describe('sessions', () => {
  it('a session ends after 8 hours, and the expired one is gone from the store', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const olena = await login('olena@example.com', 'olena123');
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 - 1000);
    expect((await call(meRoute.GET, { url: '/api/me', cookie: olena })).status).toBe(200);
    vi.setSystemTime(Date.now() + 2000);
    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: olena }), 401, 'UNAUTHENTICATED');
    expect(getStore().sessions.has(olena)).toBe(false);
  });

  it('expired sessions of others are cleaned up at the next login', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const olena = await login('olena@example.com', 'olena123');
    vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000);
    await login('anna@example.com', 'anna123');
    expect(getStore().sessions.has(olena)).toBe(false);
    expect(getStore().sessions.size).toBe(1);
  });

  it('logging in again replaces the cookie the browser had; the old token is dead', async () => {
    const first = await login('olena@example.com', 'olena123');
    const res = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      cookie: first,
      body: { email: 'anna@example.com', password: 'anna123' },
    });
    expect(res.status).toBe(200);
    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: first }), 401, 'UNAUTHENTICATED');
  });

  it('a failed login keeps the session the browser already had', async () => {
    const olena = await login('olena@example.com', 'olena123');
    const res = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      cookie: olena,
      body: { email: 'anna@example.com', password: 'wrong' },
    });
    await expectError(res, 401, 'INVALID_CREDENTIALS');
    expect((await call(meRoute.GET, { url: '/api/me', cookie: olena })).status).toBe(200);
  });

  it('two browsers of the same user are independent; deactivation ends both', async () => {
    const phone = await login('olena@example.com', 'olena123');
    const laptop = await login('olena@example.com', 'olena123');
    expect(phone).not.toBe(laptop);
    await call(logoutRoute.POST, { method: 'POST', url: '/api/auth/logout', cookie: phone });
    expect((await call(meRoute.GET, { url: '/api/me', cookie: laptop })).status).toBe(200);
    const ivan = await login('ivan@example.com', 'ivan123');
    await patchStatus(ivan, 'usr_olena', 'deactivated');
    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: laptop }), 401, 'UNAUTHENTICATED');
  });

  it('a wrong password for a deactivated account says only "invalid credentials"', async () => {
    const res = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'maksym@example.com', password: 'wrong' },
    });
    await expectError(res, 401, 'INVALID_CREDENTIALS');
  });

  it('logout without a session is fine and clears the cookie', async () => {
    const res = await call(logoutRoute.POST, { method: 'POST', url: '/api/auth/logout' });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join(';')).toMatch(/sid=;/);
  });

  it('an Origin of "null" (sandboxed page) is refused for writes', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const res = await call(userStatusRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena/status',
      cookie: ivan,
      body: { status: 'deactivated' },
      headers: { origin: 'null' },
      params: { id: 'usr_olena' },
    });
    await expectError(res, 403, 'FORBIDDEN');
    expect(getStore().users.get('usr_olena')?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------------------------

describe('service endpoints', () => {
  it('/api/health answers without a session', async () => {
    const res = await call(healthRoute.GET, { url: '/api/health' });
    expect(await readObject(res)).toEqual({ ok: true });
  });

  it.each(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const)('an unknown /api path answers %s with a JSON 404', async (method) => {
    const handler = catchAllRoute[method];
    const res = await call(handler, { method, url: '/api/nope', params: { path: ['nope'] } });
    await expectError(res, 404, 'NOT_FOUND');
  });
});
