import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ACTIONS, ROLES, ROLE_POLICIES, type Action } from '@/domain/roles';
import * as requestSchemas from '@/domain/schemas';

/**
 * The structural rules of AGENTS.md, checked on the source files. These are the rules a type
 * checker or linter cannot see. If one of these fails, read the message and AGENTS.md before
 * changing the test. A new route or page is meant to fail here until it is added to the
 * inventory below on purpose.
 */

const ROOT = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8');
}

/** Repo-relative paths with forward slashes, e.g. `src/app/api/me/route.ts`. */
function filesUnder(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .map((file) => `${dir}/${file.split(path.sep).join('/')}`)
    .filter((file) => /\.(ts|tsx|mts)$/.test(file));
}

const SRC = filesUnder('src');

// ---------------------------------------------------------------------------------------------
// API routes

/** `public` = withPublicApi, `signed-in` = withApi({}), otherwise the capability withApi checks. */
type Guard = 'public' | 'signed-in' | Action;

/**
 * Every API route, every method it answers, and the guard in front of it.
 * Methods not listed answer 405. Users are never deleted, so there is no DELETE.
 */
const ROUTES: Record<string, Partial<Record<string, Guard>>> = {
  'auth/login': { POST: 'public' },
  'auth/logout': { POST: 'public' },
  'demo/reset': { POST: 'public' },
  health: { GET: 'public' },
  me: { GET: 'signed-in' },
  clients: { GET: 'content.view' },
  'clients/[id]': { GET: 'content.view' },
  users: { GET: 'users.view', POST: 'users.create' },
  'users/[id]': { GET: 'users.view', PATCH: 'users.editProfile' },
  'users/[id]/role': { PATCH: 'users.changeRole' },
  'users/[id]/status': { PATCH: 'users.changeStatus' },
  // Unknown /api/* paths answer a JSON 404 instead of the HTML not-found page.
  '[...path]': { GET: 'public', POST: 'public', PATCH: 'public', PUT: 'public', DELETE: 'public' },
};

const HANDLER_EXPORT =
  /^export const (GET|POST|PATCH|PUT|DELETE) = (?:withApi(?:<[^>]*>)?\(\{ capability: '([\w.]+)' \}|withApi(?:<[^>]*>)?\(\{\}|(withPublicApi)(?:<[^>]*>)?\()/;

function guardsOf(file: string): Record<string, Guard> {
  const guards: Record<string, Guard> = {};
  for (const line of read(file).split('\n').filter((text) => text.startsWith('export'))) {
    const match = HANDLER_EXPORT.exec(line);
    if (!match) {
      throw new Error(`${file}: every export of a route file must be a handler wrapped in withApi/withPublicApi:\n  ${line}`);
    }
    const [, method = '', capability, isPublic] = match;
    guards[method] = isPublic ? 'public' : capability ? toAction(capability) : 'signed-in';
  }
  return guards;
}

function toAction(value: string): Action {
  const action = ACTIONS.find((known) => known === value);
  if (!action) throw new Error(`Unknown capability '${value}'`);
  return action;
}

describe('API routes', () => {
  const routeFiles = SRC.filter((file) => file.startsWith('src/app/api/') && file.endsWith('/route.ts'));
  const routeOf = (file: string) => file.slice('src/app/api/'.length, -'/route.ts'.length);

  it('the inventory lists exactly the routes on disk', () => {
    expect(routeFiles.map(routeOf).sort()).toEqual(Object.keys(ROUTES).sort());
  });

  it.each(routeFiles.map((file) => [routeOf(file), file]))(
    '/api/%s: each method has the expected guard',
    (route, file) => {
      expect(guardsOf(file)).toEqual(ROUTES[route]);
    },
  );

  it('only the catch-all answers DELETE: users are deactivated, never deleted', () => {
    const withDelete = Object.entries(ROUTES).filter(([, methods]) => methods.DELETE !== undefined);
    expect(withDelete.map(([route]) => route)).toEqual(['[...path]']);
  });
});

// ---------------------------------------------------------------------------------------------
// Pages

/** The action a signed-in page checks first, or an error if it does not start with requirePage. */
function pageAction(file: string): Action {
  const match =
    /export default async function \w+\([^)]*\)[^{]*\{\s*(?:\/\/[^\n]*\n\s*)*(?:const \w+ = )?await requirePage\('([\w.]+)'\);/.exec(
      read(file),
    );
  if (!match?.[1]) throw new Error(`${file}: the first statement must be \`await requirePage(action)\`, outside try/catch`);
  return toAction(match[1]);
}

describe('pages', () => {
  const pages = SRC.filter((file) => file.endsWith('/page.tsx'));
  const signedIn = pages.filter((file) => file.startsWith('src/app/(app)/'));

  it('every page outside the (app) group is one of the known public ones', () => {
    expect(pages.filter((file) => !signedIn.includes(file)).sort()).toEqual([
      'src/app/login/page.tsx',
      'src/app/page.tsx',
    ]);
  });

  it.each(signedIn)('%s starts with requirePage(action)', (file) => {
    expect(() => pageAction(file)).not.toThrow();
  });

  it.each(ROLES)('the home page of %s is a page that role may open', (role) => {
    const home = ROLE_POLICIES[role].homePath;
    const file = `src/app/(app)${home}/page.tsx`;
    expect(existsSync(path.join(ROOT, file)), `${role} lands on ${home}, which has no page under (app)`).toBe(true);
    const action = pageAction(file);
    expect(ROLE_POLICIES[role].can[action], `${role} lands on ${home}, which needs '${action}'`).not.toBe('none');
  });
});

// ---------------------------------------------------------------------------------------------
// Server code and the store

describe('server code and the store', () => {
  const serverFiles = SRC.filter((file) => file.startsWith('src/server/'));

  it.each(serverFiles)('%s starts with `import \'server-only\'`', (file) => {
    expect(read(file).startsWith("import 'server-only';")).toBe(true);
  });

  it('only the services, sessions and the demo reset import the store', () => {
    const importers = SRC.filter((file) => /from '(@\/server\/db\/store|\.\/store)'/.test(read(file)));
    expect(importers.sort()).toEqual([
      'src/server/auth/auth-service.ts',
      'src/server/auth/session.ts',
      'src/server/clients/client-service.ts',
      'src/server/demo/demo-service.ts',
      'src/server/users/user-service.ts',
    ]);
  });

  it('nobody keeps the store in a module-level variable (resetStore swaps it)', () => {
    const offenders = SRC.flatMap((file) =>
      read(file)
        .split('\n')
        .filter((line) => /^\S/.test(line) && line.includes('getStore()') && !line.startsWith('export function getStore'))
        .map((line) => `${file}: ${line}`),
    );
    expect(offenders).toEqual([]);
  });

  it('role strings are written only in src/domain/roles.ts', () => {
    const offenders = SRC.filter((file) => file !== 'src/domain/roles.ts').filter((file) =>
      /(['"])(it|manager|user)\1/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('no eslint-disable or @ts- directives anywhere', () => {
    const offenders = [...SRC, ...filesUnder('tests')]
      .filter((file) => file !== 'tests/architecture.test.ts')
      .filter((file) => /eslint-disable|@ts-(ignore|expect-error|nocheck)/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Requests, caching and auth placement

describe('requests, caching and auth placement', () => {
  it('every request body schema rejects unknown keys (.strict())', () => {
    const checked = Object.entries(requestSchemas).flatMap(([name, value]) =>
      value instanceof z.ZodObject ? [{ name, strict: value.def.catchall instanceof z.ZodNever }] : [],
    );
    expect(checked.length).toBeGreaterThanOrEqual(5);
    expect(checked.filter((schema) => !schema.strict).map((schema) => schema.name)).toEqual([]);
  });

  it('Cache Components and "use cache" stay off (the current user must never be cached)', () => {
    expect(read('next.config.ts')).not.toMatch(/cacheComponents:\s*true/);
    expect(SRC.filter((file) => /['"]use cache/.test(read(file)))).toEqual([]);
  });

  it('there is no proxy/middleware: it cannot see the in-memory store', () => {
    for (const file of ['proxy.ts', 'middleware.ts', 'src/proxy.ts', 'src/middleware.ts']) {
      expect(existsSync(path.join(ROOT, file)), file).toBe(false);
    }
  });
});
