import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as loginRoute from '@/app/api/auth/login/route';
import * as logoutRoute from '@/app/api/auth/logout/route';
import * as clientRoute from '@/app/api/clients/[id]/route';
import * as clientsRoute from '@/app/api/clients/route';
import * as demoResetRoute from '@/app/api/demo/reset/route';
import * as meRoute from '@/app/api/me/route';
import * as userRoleRoute from '@/app/api/users/[id]/role/route';
import * as userRoute from '@/app/api/users/[id]/route';
import * as userStatusRoute from '@/app/api/users/[id]/status/route';
import * as usersRoute from '@/app/api/users/route';
import { resetStore } from '@/server/db/store';

import { call, expectError, login, readArray, readObject } from './support/route-call';

/**
 * The scenarios from the task, as HTTP. Each test calls the exported route handlers with a
 * real NextRequest (tests/support/route-call.ts), so the whole chain runs, up to the JSON
 * answer or `{ error: { code, message } }`. Edge cases are in api-edge-cases.test.ts.
 */

// ---------------------------------------------------------------- helpers

function setStatus(cookie: string, id: string, status: string): Promise<Response> {
  return call(userStatusRoute.PATCH, {
    method: 'PATCH',
    url: `/api/users/${id}/status`,
    cookie,
    body: { status },
    params: { id },
  });
}

function getClients(cookie: string | undefined, query = ''): Promise<Response> {
  return call(clientsRoute.GET, { url: `/api/clients${query}`, cookie });
}

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------- scenarios

describe('Scenario: Anna, a manager', () => {
  it('lists exactly her four direct reports, without passwords', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(usersRoute.GET, { url: '/api/users', cookie: anna });
    expect(res.status).toBe(200);
    const rows = await readArray(res);
    expect(rows.map((row) => row.id).sort()).toEqual(['usr_andriy', 'usr_olena', 'usr_sofia', 'usr_taras']);
    for (const row of rows) expect(row).not.toHaveProperty('password');
  });

  it('cannot edit Dmytro, who reports to Bohdan: 403, not 404', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(userRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_dmytro',
      cookie: anna,
      body: { fullName: 'X' },
      params: { id: 'usr_dmytro' },
    });
    await expectError(res, 403, 'FORBIDDEN');

    const view = await call(userRoute.GET, { url: '/api/users/usr_dmytro', cookie: anna, params: { id: 'usr_dmytro' } });
    await expectError(view, 403, 'FORBIDDEN');
  });

  it('can edit Olena, her direct report', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(userRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena',
      cookie: anna,
      body: { fullName: 'Olena K.', email: 'OLENA.K@example.com' },
      params: { id: 'usr_olena' },
    });
    expect(res.status).toBe(200);
    expect(await readObject(res)).toMatchObject({ id: 'usr_olena', fullName: 'Olena K.', email: 'olena.k@example.com' });
  });

  it('cannot make herself IT', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(userRoleRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_anna/role',
      cookie: anna,
      body: { role: 'it' },
      params: { id: 'usr_anna' },
    });
    await expectError(res, 403, 'FORBIDDEN');

    const me = await readObject(await call(meRoute.GET, { url: '/api/me', cookie: anna }));
    expect(me.user).toMatchObject({ id: 'usr_anna', role: 'manager' });
  });

  it('gets one server-side page of clients', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await getClients(anna, '?page=2&limit=25');
    expect(res.status).toBe(200);
    const page = await readObject(res);
    expect(page).toMatchObject({ page: 2, limit: 25 });
    expect(page.items).toHaveLength(25);
    expect(page.total).toBeGreaterThanOrEqual(1000);
  });

  it('cannot ask for more than 100 clients at once', async () => {
    const anna = await login('anna@example.com', 'anna123');
    await expectError(await getClients(anna, '?limit=1000'), 400, 'VALIDATION');
    await expectError(await getClients(anna, '?page=0'), 400, 'VALIDATION');
  });

  it('opens one client by id, and an unknown id is 404', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(clientRoute.GET, { url: '/api/clients/cl_0001', cookie: anna, params: { id: 'cl_0001' } });
    expect(res.status).toBe(200);
    expect(await readObject(res)).toMatchObject({ id: 'cl_0001' });

    const missing = await call(clientRoute.GET, { url: '/api/clients/cl_9999', cookie: anna, params: { id: 'cl_9999' } });
    await expectError(missing, 404, 'NOT_FOUND');
  });
});

describe('Scenario: Ivan, IT', () => {
  it('cannot see content', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await getClients(ivan), 403, 'FORBIDDEN');
    const one = await call(clientRoute.GET, { url: '/api/clients/cl_0001', cookie: ivan, params: { id: 'cl_0001' } });
    await expectError(one, 403, 'FORBIDDEN');
  });

  it('self -> 403 CANNOT_DEACTIVATE_SELF; Iryna -> 200; self again -> 409 LAST_ACTIVE_ROLE_MEMBER', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');

    await expectError(await setStatus(ivan, 'usr_ivan', 'deactivated'), 403, 'CANNOT_DEACTIVATE_SELF');

    const iryna = await setStatus(ivan, 'usr_iryna', 'deactivated');
    expect(iryna.status).toBe(200);
    expect(await readObject(iryna)).toMatchObject({ id: 'usr_iryna', status: 'deactivated' });

    await expectError(await setStatus(ivan, 'usr_ivan', 'deactivated'), 409, 'LAST_ACTIVE_ROLE_MEMBER');

    const demote = await call(userRoleRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_ivan/role',
      cookie: ivan,
      body: { role: 'manager' },
      params: { id: 'usr_ivan' },
    });
    await expectError(demote, 409, 'LAST_ACTIVE_ROLE_MEMBER');
  });

  it('two IT deactivating each other at the same moment: exactly one wins', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const iryna = await login('iryna@example.com', 'iryna123');

    const results = await Promise.all([setStatus(ivan, 'usr_iryna', 'deactivated'), setStatus(iryna, 'usr_ivan', 'deactivated')]);

    // The winner's write revokes the loser's session before the loser's request is resolved.
    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
    const all = await readArray(await call(usersRoute.GET, { url: '/api/users', cookie: results[0]?.status === 200 ? ivan : iryna }));
    const activeIt = all.filter((row) => row.role === 'it' && row.status === 'active');
    expect(activeIt).toHaveLength(1);
  });

  it('creates a user who can then log in', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const res = await call(usersRoute.POST, {
      method: 'POST',
      url: '/api/users',
      cookie: ivan,
      body: { fullName: 'Petro Ivanenko', email: 'Petro@Example.com', role: 'user', managerId: 'usr_anna', password: 'petro123' },
    });
    expect(res.status).toBe(201);
    const created = await readObject(res);
    expect(created).toMatchObject({ email: 'petro@example.com', status: 'active', managerId: 'usr_anna' });
    expect(created).not.toHaveProperty('password');
    await login('petro@example.com', 'petro123');
  });

  it('gets 404 for an unknown user id', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    await expectError(await setStatus(ivan, 'usr_nobody', 'deactivated'), 404, 'NOT_FOUND');
  });
});

describe('Scenario: Olena is deactivated while logged in', () => {
  it('her very next request is 401, and she cannot log in again', async () => {
    const olena = await login('olena@example.com', 'olena123');
    expect((await getClients(olena)).status).toBe(200);

    const ivan = await login('ivan@example.com', 'ivan123');
    expect((await setStatus(ivan, 'usr_olena', 'deactivated')).status).toBe(200);

    await expectError(await getClients(olena), 401, 'UNAUTHENTICATED');
    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: olena }), 401, 'UNAUTHENTICATED');

    const relogin = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'olena@example.com', password: 'olena123' },
    });
    await expectError(relogin, 403, 'ACCOUNT_DEACTIVATED');
  });

  it('after reactivation her old cookie stays dead; a fresh login works', async () => {
    const olena = await login('olena@example.com', 'olena123');
    const ivan = await login('ivan@example.com', 'ivan123');
    await setStatus(ivan, 'usr_olena', 'deactivated');
    expect((await setStatus(ivan, 'usr_olena', 'active')).status).toBe(200);

    await expectError(await getClients(olena), 401, 'UNAUTHENTICATED');
    const fresh = await login('olena@example.com', 'olena123');
    expect((await getClients(fresh)).status).toBe(200);
  });
});

describe('Scenario: not logged in', () => {
  it.each([
    ['GET /api/users', () => call(usersRoute.GET, { url: '/api/users' })],
    ['GET /api/clients', () => call(clientsRoute.GET, { url: '/api/clients' })],
    ['GET /api/me', () => call(meRoute.GET, { url: '/api/me' })],
    ['PATCH /api/users/usr_ivan/status', () => call(userStatusRoute.PATCH, { method: 'PATCH', url: '/api/users/usr_ivan/status', body: { status: 'deactivated' }, params: { id: 'usr_ivan' } })],
  ])('%s without a cookie is 401', async (_label, request) => {
    await expectError(await request(), 401, 'UNAUTHENTICATED');
  });

  it('a made-up cookie is 401', async () => {
    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: 'garbage' }), 401, 'UNAUTHENTICATED');
    await expectError(await getClients('garbage'), 401, 'UNAUTHENTICATED');
  });

  it('a wrong password is 401 INVALID_CREDENTIALS and sets no cookie', async () => {
    const res = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'anna@example.com', password: 'wrong' },
    });
    await expectError(res, 401, 'INVALID_CREDENTIALS');
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('the session cookie is httpOnly and SameSite=Lax, and carries no role', async () => {
    const res = await call(loginRoute.POST, {
      method: 'POST',
      url: '/api/auth/login',
      body: { email: ' Anna@Example.com ', password: 'anna123' },
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((value) => value.startsWith('sid='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/manager/);
  });

  it('logout ends the session', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(logoutRoute.POST, { method: 'POST', url: '/api/auth/logout', cookie: anna });
    expect(res.status).toBe(200);
    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: anna }), 401, 'UNAUTHENTICATED');
  });
});

describe('Scenario: strict request bodies', () => {
  it('a role riding along with a profile edit is a 400, and nothing is written', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(userRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena',
      cookie: anna,
      body: { fullName: 'X', role: 'it' },
      params: { id: 'usr_olena' },
    });
    await expectError(res, 400, 'VALIDATION');

    const olena = await readObject(await call(userRoute.GET, { url: '/api/users/usr_olena', cookie: anna, params: { id: 'usr_olena' } }));
    expect(olena).toMatchObject({ role: 'user', fullName: 'Olena Kravchenko' });
  });

  it('extra keys on the status and role endpoints are a 400 too', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const status = await call(userStatusRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena/status',
      cookie: ivan,
      body: { status: 'deactivated', role: 'it' },
      params: { id: 'usr_olena' },
    });
    await expectError(status, 400, 'VALIDATION');

    const role = await call(userRoleRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena/role',
      cookie: ivan,
      body: { role: 'admin' },
      params: { id: 'usr_olena' },
    });
    await expectError(role, 400, 'VALIDATION');
  });

  it('invalid JSON is a 400', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(userRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena',
      cookie: anna,
      rawBody: '{"fullName":',
      headers: { 'content-type': 'application/json' },
      params: { id: 'usr_olena' },
    });
    await expectError(res, 400, 'VALIDATION');
  });

  it('an empty profile edit is a 400', async () => {
    const anna = await login('anna@example.com', 'anna123');
    const res = await call(userRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_olena',
      cookie: anna,
      body: {},
      params: { id: 'usr_olena' },
    });
    await expectError(res, 400, 'VALIDATION');
  });
});

describe('Scenario: cross-site writes', () => {
  it('a PATCH from another origin is 403, even with a valid session', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const res = await call(userStatusRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_iryna/status',
      cookie: ivan,
      body: { status: 'deactivated' },
      headers: { origin: 'https://evil.example', host: 'localhost' },
      params: { id: 'usr_iryna' },
    });
    await expectError(res, 403, 'FORBIDDEN');

    const iryna = await readObject(await call(userRoute.GET, { url: '/api/users/usr_iryna', cookie: ivan, params: { id: 'usr_iryna' } }));
    expect(iryna.status).toBe('active');
  });

  it('the same PATCH from our own origin goes through', async () => {
    const ivan = await login('ivan@example.com', 'ivan123');
    const res = await call(userStatusRoute.PATCH, {
      method: 'PATCH',
      url: '/api/users/usr_iryna/status',
      cookie: ivan,
      body: { status: 'deactivated' },
      headers: { origin: 'http://localhost', host: 'localhost' },
      params: { id: 'usr_iryna' },
    });
    expect(res.status).toBe(200);
  });
});

describe('Scenario: demo reset', () => {
  const original = process.env.DEMO_RESET;

  afterEach(() => {
    if (original === undefined) delete process.env.DEMO_RESET;
    else process.env.DEMO_RESET = original;
  });

  it('does not exist without DEMO_RESET=true', async () => {
    delete process.env.DEMO_RESET;
    const anna = await login('anna@example.com', 'anna123');
    await expectError(await call(demoResetRoute.POST, { method: 'POST', url: '/api/demo/reset' }), 404, 'NOT_FOUND');
    expect((await call(meRoute.GET, { url: '/api/me', cookie: anna })).status).toBe(200);
  });

  it('with DEMO_RESET=true restores the seed and signs everyone out', async () => {
    process.env.DEMO_RESET = 'true';
    const ivan = await login('ivan@example.com', 'ivan123');
    expect((await setStatus(ivan, 'usr_iryna', 'deactivated')).status).toBe(200);

    const res = await call(demoResetRoute.POST, { method: 'POST', url: '/api/demo/reset' });
    expect(res.status).toBe(200);

    await expectError(await call(meRoute.GET, { url: '/api/me', cookie: ivan }), 401, 'UNAUTHENTICATED');
    await login('iryna@example.com', 'iryna123');
  });
});
