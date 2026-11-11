<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# User Management & Content: rules for agents

A Next.js 16 (App Router) app with three roles (IT, manager, user), users kept in memory, and 1,200 generated clients. The point of the codebase is **who may do what, and that the server enforces it**. There is no database: everything lives in one in-memory store and resets on restart.

## Commands

| What | Command |
|---|---|
| Install | `npm install` (Node ≥ 20.9) |
| Dev server | `npm run dev` → http://localhost:3000 (`.env.development` turns on the demo reset button) |
| Production | `npm run build && npm start` |
| Types | `npm run typecheck` (runs `next typegen` first: `LayoutProps`/`PageProps` come from it) |
| Lint | `npm run lint` (also enforces the import boundaries below) |
| Tests | `npm test` (Vitest, `tests/**/*.test.ts`) |
| All checks | `npm run check`. Run it before every commit. |

## Where things live

```
src/domain/   framework-free TS: roles.ts (THE role policy), types.ts, schemas.ts (zod), errors.ts, paths.ts
src/server/   server only (each file starts with `import 'server-only'`)
  db/         store.ts (getStore/resetStore), seed-users.ts, seed-clients.ts (deterministic generator)
  auth/       session.ts (cookie + sessions), permissions.ts (hasCapability/canActOn),
              current-user.ts (requireUser/requirePage for pages), auth-service.ts (login)
  users/      user-service.ts (use cases), user-rules.ts (invariants: yourself, last active IT)
  clients/    client-service.ts (server pagination, sort, filter)
  demo/       demo-service.ts (reset to seed, behind DEMO_RESET)
  http/       api.ts (withApi/withPublicApi, readJson, errors → JSON), errors.ts (AppError, HTTP status per code)
src/app/      pages and app/api/** route handlers. Thin: guard, parse, call a service, return JSON.
src/components/  'use client' components. They talk to the server only through src/lib/api-client.ts.
tests/        Vitest. tests/support/server-only-stub.ts replaces `server-only` in tests.
```

Import rules (lint errors, see `eslint.config.mjs`):
- `src/domain` imports nothing from the app, no `next`, no `react`.
- `src/components` and `src/lib` never import `@/server/**`.
- `src/app` never imports `@/server/db/**`; go through a service.
- `src/server` never imports `@/app`, `@/components`, `@/lib`.

## Rules an agent is likely to break

1. **Permission checks happen on the server, every time.**
   - Pages call `requirePage(action)`: not logged in → redirect to `/login`; logged in without the capability → `forbidden()`, a real 403.
   - Route handlers are wrapped in `withApi({ capability })`. Target-specific checks are in the service.
   - Hiding or disabling a button is UX, not enforcement. Assume every endpoint is called directly with curl.
2. **Never write role strings inline and never branch on a role.**
   - `user.role === 'manager'`, `=== ROLE.MANAGER` and `case ROLE.IT:` are lint errors outside `src/domain/roles.ts`.
   - Ask `hasCapability(user, action)` or `canActOn(user, action, target)` from `src/server/auth/permissions.ts`.
   - Labels, home paths and the role list all come from `ROLE_POLICIES`.
3. **The client list is always paginated on the server.**
   - `GET /api/clients?page&limit` returns `Page<Client>` (`limit` ≤ 100).
   - Never add an endpoint, prop or server component that sends all clients to the browser.
   - Never render more than one page of rows.
4. **The API never trusts the client.**
   - Bodies are parsed with the `.strict()` zod schemas in `src/domain/schemas.ts`. An unknown key is a 400.
   - One endpoint per permission column (profile, role, status), so a field can't ride along in another request.
   - A new editable field needs its own action and check.
5. **Identity is looked up on every request.**
   - `resolveSession()` reads the user (role, status) from the store each time. That is how a deactivation applies on the next request.
   - Do not put role/status in the cookie or a JWT.
   - Do not cache the current user.
   - Do not enable `cacheComponents` / `'use cache'`.
6. **No auth in `proxy.ts` (ex-middleware).** Proxy runs apart from the app and cannot see the in-memory store.
7. **Mutations are check-then-write with no `await` in between.** Node is single-threaded, so this is what keeps two concurrent "deactivate the other IT" requests from both passing the last-IT check.
8. **Always call `getStore()` at the point of use.** Never keep it in a module-level variable: `resetStore()` swaps the object.
9. **No `any`, no `@ts-ignore`** (lint errors). The one cast at the trust boundary is in `src/lib/api-client.ts`, with a comment.
10. **Errors are `AppError(code, message)`.**
    - Codes are in `src/domain/errors.ts`, HTTP statuses in `src/server/http/errors.ts`.
    - The API answers `{ error: { code, message } }`, never a bare string.

## Counter-intuitive on first contact

- **Roles are not a hierarchy.** IT manages users but gets a 403 on `/content`. Managers see content but cannot create users or change roles or statuses.
- **A manager may edit only `fullName`/`email`, and only of users whose `managerId` is the manager's own id.**
  - Not themselves.
  - Not other managers (unless one reports to them).
  - Not users without a manager.
  - Not users of another manager, even a deactivated one.
- **IT may edit its own name/email,** but may not change its own role or status.
  - "Demote" means any change of your own role: roles are not ranked.
- **"Last active IT" is a role flag, not a role name.** `keepAtLeastOneActive: true` in `ROLE_POLICIES`. The check runs before the self-check, so:
  - Ivan deactivating himself while Iryna is active → 403 `CANNOT_DEACTIVATE_SELF`;
  - once he is the last active IT → 409 `LAST_ACTIVE_ROLE_MEMBER`.
- **A user outside your scope** (Anna → Dmytro) gets 403, not 404.
- **Deactivating a user deletes all their sessions.** Reactivating them does not revive old sessions.
- **Users and Clients are different entities.** Clients never log in and have their own `status` (`active`/`churned`).
- **`forbidden()` and `redirect()` work by throwing.** Never call them inside `try/catch` or behind a `Suspense` boundary, or the page answers 200.
- **Seeded passwords are plain text on purpose** (the task forbids hashing). They live in `store.credentials`, never on `User`.
- **Seed data is deterministic** (fixed ids like `usr_anna`, `cl_0001`). README curl examples depend on it.
- **`POST /api/demo/reset` exists only when `DEMO_RESET=true`.** It is a demo convenience outside the permission model and logs everyone out.

## Adding a fourth role

1. In `src/domain/roles.ts`, add a key to `ROLE` and an entry to `ROLE_POLICIES`. TypeScript will not compile until every action has a scope (`all` / `directReports` / `none`). Also set `homePath`, `canHaveReports` and `keepAtLeastOneActive`.
2. If the role needs something no existing action covers:
   - add the action to `ACTIONS` and decide it for every role;
   - guard the page with `requirePage(action)` and the route with `withApi({ capability })` or a `canActOn` check in the service.
3. Add the expected row to the permission matrix in `tests/permissions.test.ts`. It is written out literally on purpose: it is the spec.
4. Optionally seed an account in `src/server/db/seed-users.ts` and list it in the README.

Nothing else should need to change. If you are about to edit a component or route to mention the new role by name, stop: add a capability instead.
