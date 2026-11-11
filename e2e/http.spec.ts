import { expect, test } from '@playwright/test';

import { apiAs, baseURL, resetDemo, type SeedName } from './support';

/**
 * The real server over HTTP, the way a reviewer probes it with curl: page statuses and
 * redirects, methods that do not exist, cookie flags, payload sizes, races. These are the
 * things the in-process tests (tests/*.test.ts) cannot see, because Next itself answers them.
 */

test.beforeEach(async () => {
  await resetDemo();
});

const PAGE_CASES: readonly [who: SeedName | null, path: string, status: number, location?: string][] = [
  [null, '/', 307, '/login'],
  [null, '/content', 307, '/login'],
  [null, '/content/me', 307, '/login'],
  [null, '/content/client/cl_0001', 307, '/login'],
  [null, '/manage-users', 307, '/login'],
  [null, '/login', 200],
  ['ivan', '/', 307, '/manage-users'],
  ['ivan', '/login', 307, '/manage-users'],
  ['ivan', '/manage-users', 200],
  ['ivan', '/content', 403],
  ['ivan', '/content/me', 403],
  ['ivan', '/content/client/cl_0001', 403],
  ['anna', '/', 307, '/content'],
  ['anna', '/content', 200],
  ['anna', '/content/me', 200],
  ['anna', '/content/client/cl_0001', 200],
  ['anna', '/content/client/cl_9999', 404],
  ['anna', '/manage-users', 200],
  ['anna', '/no-such-page', 404],
  ['olena', '/content', 200],
  ['olena', '/manage-users', 403],
];

test.describe('every page answers with the right status', () => {
  for (const [who, path, status, location] of PAGE_CASES) {
    test(`${who ?? 'anonymous'}: GET ${path} -> ${status}${location ? ` ${location}` : ''}`, async () => {
      const api = await apiAs(who);
      const res = await api.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(status);
      if (location) expect(new URL(res.headers().location ?? '', baseURL()).pathname).toBe(location);
      if (status === 403) expect(await res.text()).toContain('403');
      await api.dispose();
    });
  }
});

test.describe('API over the wire', () => {
  test('methods a route does not have answer 405; users are never deleted', async () => {
    const ivan = await apiAs('ivan');
    expect((await ivan.delete('/api/users/usr_olena')).status()).toBe(405);
    expect((await ivan.put('/api/users/usr_olena', { data: { fullName: 'X' } })).status()).toBe(405);
    expect((await ivan.delete('/api/clients/cl_0001')).status()).toBe(405);
    expect((await ivan.get('/api/users/usr_olena')).status()).toBe(200);
    await ivan.dispose();
  });

  test('an unknown /api path is a JSON 404', async () => {
    const api = await apiAs(null);
    const res = await api.get('/api/nope');
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await api.dispose();
  });

  test('health answers without a session', async () => {
    const api = await apiAs(null);
    expect(await (await api.get('/api/health')).json()).toEqual({ ok: true });
    await api.dispose();
  });

  test('the session cookie: httpOnly, SameSite=Lax, no role, Secure only over HTTPS', async () => {
    const api = await apiAs(null);
    const plain = await api.post('/api/auth/login', { data: { email: 'anna@example.com', password: 'anna123' } });
    const cookie = plain.headers()['set-cookie'] ?? '';
    expect(cookie).toMatch(/^sid=[\w-]{40,};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).not.toMatch(/manager|anna/i);

    const proxied = await api.post('/api/auth/login', {
      data: { email: 'anna@example.com', password: 'anna123' },
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(proxied.headers()['set-cookie'] ?? '').toMatch(/Secure/i);
    await api.dispose();
  });

  test('one page of clients is about 5 KB, and /content itself carries no client rows', async () => {
    const anna = await apiAs('anna');
    const res = await anna.get('/api/clients?page=2&limit=25');
    const body: unknown = await res.json();
    expect(body).toMatchObject({ page: 2, limit: 25, total: 1200, totalPages: 48 });
    expect((await res.body()).length).toBeLessThan(10_000);
    const html = await (await anna.get('/content')).text();
    expect(html).not.toMatch(/cl_\d{4}/);
    await anna.dispose();
  });

  test('a page load after deactivation goes to /login?reason=session_ended', async () => {
    const olena = await apiAs('olena');
    const ivan = await apiAs('ivan');
    expect((await olena.get('/content', { maxRedirects: 0 })).status()).toBe(200);
    expect((await ivan.patch('/api/users/usr_olena/status', { data: { status: 'deactivated' } })).status()).toBe(200);
    const res = await olena.get('/content', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain('/login?reason=session_ended');
    expect((await olena.get('/api/clients')).status()).toBe(401);
    await Promise.all([olena.dispose(), ivan.dispose()]);
  });

  test('two IT deactivating each other at the same moment: exactly one succeeds', async () => {
    const ivan = await apiAs('ivan');
    const iryna = await apiAs('iryna');
    const [a, b] = await Promise.all([
      ivan.patch('/api/users/usr_iryna/status', { data: { status: 'deactivated' } }),
      iryna.patch('/api/users/usr_ivan/status', { data: { status: 'deactivated' } }),
    ]);
    const statuses = [a.status(), b.status()].sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);
    await Promise.all([ivan.dispose(), iryna.dispose()]);

    // Exactly one of them can still log in.
    const api = await apiAs(null);
    const logins = await Promise.all(
      ['ivan', 'iryna'].map((name) =>
        api.post('/api/auth/login', { data: { email: `${name}@example.com`, password: `${name}123` } }),
      ),
    );
    expect(logins.map((res) => res.status()).sort()).toEqual([200, 403]);
    await api.dispose();
  });

  test('a cross-site write is refused even with a valid session', async () => {
    const ivan = await apiAs('ivan');
    const res = await ivan.patch('/api/users/usr_olena/status', {
      data: { status: 'deactivated' },
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status()).toBe(403);
    const olena: unknown = await (await ivan.get('/api/users/usr_olena')).json();
    expect(olena).toMatchObject({ status: 'active' });
    await ivan.dispose();
  });

  test('a 20 KB body is 413 and a form-encoded body is 415', async () => {
    const ivan = await apiAs('ivan');
    const big = await ivan.patch('/api/users/usr_olena', { data: { fullName: 'x'.repeat(20_000) } });
    expect(big.status()).toBe(413);
    const form = await ivan.post('/api/auth/login', { form: { email: 'ivan@example.com', password: 'ivan123' } });
    expect(form.status()).toBe(415);
    await ivan.dispose();
  });

  test('the server does not advertise itself', async () => {
    const api = await apiAs(null);
    expect((await api.get('/login')).headers()['x-powered-by']).toBeUndefined();
    await api.dispose();
  });
});
