# User Management & Content

A small Next.js 16 (App Router, TypeScript `strict`) app with three non-hierarchical roles (IT, manager, user), users kept in memory, and 1,200 generated clients behind server-side pagination. The interesting part is **who may do what, and that the server enforces it**: every rule below holds when the API is called directly.

- Live demo, production: http://202.181.188.225:3000
- Live demo, development: http://202.181.188.225:3200

Each address has its own in-memory state. Use **Reset demo data** in the top bar to restore the seed; it signs everyone out of that instance.

## How to run

```bash
npm install
npm run dev            # http://localhost:3000 (the demo reset button is on in dev)
```

| Command | What it does |
|---|---|
| `npm run check` | typecheck + lint (incl. import boundaries) + unit/HTTP tests; also runs as a pre-commit hook |
| `npm test` | Vitest: permission matrix, rules, sessions, route handlers, architecture rules |
| `npm run build && npm start` | production build (one process; data resets on restart) |
| `docker compose up --build` | the production image on http://localhost:3000 with the demo reset on (`HOST_PORT=3200` for another port) |
| `npm run test:e2e` | Playwright against a running server (`BASE_URL`, default http://localhost:3000); needs `DEMO_RESET=true`. Run `npx playwright install chromium` once first. |

Node ≥ 20.9. No database and no environment variables are required. `DEMO_RESET=true` enables the reset button, and `COOKIE_SECURE` overrides the automatic `Secure` cookie flag.

## Seeded accounts

There is no signup. Passwords are plain text on purpose: the task asks for no hashing.

| Name | Role | Status | Manager | Email | Password |
|---|---|---|---|---|---|
| Ivan Petrenko | IT | active | — | ivan@example.com | ivan123 |
| Iryna Kovalenko | IT | active | — | iryna@example.com | iryna123 |
| Anna Shevchenko | manager | active | — | anna@example.com | anna123 |
| Bohdan Melnyk | manager | active | — | bohdan@example.com | bohdan123 |
| Marta Bondar | manager (no reports) | active | — | marta@example.com | marta123 |
| Serhii Tkachenko | manager | **deactivated** | — | serhii@example.com | serhii123 |
| Olena Kravchenko | user | active | Anna | olena@example.com | olena123 |
| Taras Boyko | user | active | Anna | taras@example.com | taras123 |
| Sofia Rudenko | user | active | Anna | sofia@example.com | sofia123 |
| Andriy Polishchuk | user | active | Anna | andriy@example.com | andriy123 |
| Dmytro Lysenko | user | active | Bohdan | dmytro@example.com | dmytro123 |
| Maksym Hnatiuk | user | **deactivated** | Bohdan | maksym@example.com | maksym123 |
| Yulia Moroz | user (manager deactivated) | active | Serhii | yulia@example.com | yulia123 |
| Kateryna Savchuk | user (no manager) | active | — | kateryna@example.com | kateryna123 |

Ids are fixed (`usr_<firstname>`, clients `cl_0001`…`cl_1200`), so the curl examples below work after every restart.

## Auth approach and rule 5

**Opaque server-side sessions.** Login creates a random 256-bit token, stored in an in-memory `Map<token, { userId, expiresAt }>` and sent as an `httpOnly`, `SameSite=Lax` cookie. `Secure` is set automatically over HTTPS, including behind a proxy.

The cookie carries no role and no status. On **every** request, `resolveSession()` (`src/server/auth/session.ts`) does three things:
1. looks up the session;
2. loads the user from the store;
3. rejects the request if the user is no longer `active`.

So when IT deactivates someone who is logged in, that person's next page load redirects to `/login` and their next API call gets a 401. They do not need to log in again for this to apply. A role change applies the same way, on the next request.

Deactivation also deletes all of that user's sessions, so reactivating them later does not revive an old cookie.

**One browser is one sign-in, shared by all its tabs** (they share the cookie). Three things keep a tab from acting as someone it does not show:
1. A browser that is signed in skips the login form: `/login` redirects it to its home page, and `POST /api/auth/login` answers 409 `ALREADY_SIGNED_IN`. To switch accounts, log out first.
2. Logging in or out and the demo reset make the other tabs of that browser reload at once (`BroadcastChannel`), so they show the account the browser is really signed in as.
3. If a tab still missed the switch, the server catches it. Each API call from a page sends the id of the user the page was rendered for (`x-tab-user-id`). If the cookie now belongs to someone else, the answer is 409 `SESSION_CHANGED`, nothing is written, and the tab reloads. Calls without that header, such as curl, are not affected.

To use two accounts at once, open a private window or another browser.

Why not JWT or NextAuth: a stateless token is valid until it expires, so rule 5 would need a store lookup per request anyway, and then the token adds nothing. A hand-written session is about 60 lines and easy to explain.

Why no proxy/middleware for auth: Next's proxy runs apart from the app and cannot see the in-memory store. A cookie-presence check there would be a second, weaker source of truth.

## Every place a permission decision is made

1. `src/domain/roles.ts` → `ROLE_POLICIES`: the data. Each role maps every action to `all` / `directReports` / `none`, plus `reportsTo` (who may be its manager) and the `keepAtLeastOneActive` flag (rule 4).
2. `src/server/auth/permissions.ts` → `hasCapability()` and `canActOn()`: the only code that turns a role into yes or no.
3. `src/server/users/user-rules.ts`: the rules that don't depend on the role. These are "not yourself" (rule 3) and "not the last active IT" (rule 4), plus manager and email validity.
4. `src/server/auth/session.ts` → `resolveSession()`: is there an active user at all (rule 5).

Pages call `requirePage(action)` and route handlers are wrapped in `withApi({ capability })`. Services call the rule checks for the specific target. All of them delegate to 1–4. The UI shows `allowed` flags that the server computes by dry-running the same checks; it never decides anything itself.

## API

All endpoints return JSON. Errors look like `{ "error": { "code", "message" } }`.

| Method & path | Who | Notes |
|---|---|---|
| `POST /api/auth/login` | anyone not signed in | `{ email, password }` → session cookie; 409 if this browser is already signed in |
| `POST /api/auth/logout` | anyone | clears the session |
| `GET /api/me` | logged in | the current user |
| `GET /api/clients?page=1&limit=25&sort=name&order=asc&status=churned&q=nova` | manager, user | one page + `total`, `totalPages`; `limit` ≤ 100 |
| `GET /api/clients/:id` | manager, user | one client |
| `GET /api/users` | IT (all), manager (direct reports) | rows include server-computed `allowed` |
| `POST /api/users` | IT | `{ fullName, email, role, managerId, password }` |
| `PATCH /api/users/:id` | IT, manager (direct reports) | `{ fullName?, email? }`. Any other key is a 400 |
| `PATCH /api/users/:id/role` | IT | `{ role }` |
| `PATCH /api/users/:id/status` | IT | `{ status: "active" \| "deactivated" }` |
| `POST /api/demo/reset` | anyone, only with `DEMO_RESET=true` | restore the seed, sign everyone out |
| `GET /api/health` | anyone | `{ ok: true }`, for the container health check |

There is one endpoint per column of the permission table, so a field cannot ride along in a request that was authorised for another field.

Status codes:
- 401: not logged in or the session has ended.
- 403: the role can't do this, the target is outside your scope, or you are acting on yourself.
- 409: the last active IT, the email is taken, the browser is already signed in, or the page was rendered for another account.
- 400: validation failed (unknown keys included).
- 404: not found, including an unknown `/api/*` path.
- 405: a method the route does not have. There is no `DELETE`: users are deactivated, never deleted.
- 413: a body over 16 KB. 415: a body not sent as `application/json`.

```bash
# Anna logs in and tries to edit Dmytro (not her report) -> 403
curl -c anna.txt -H 'Content-Type: application/json' -d '{"email":"anna@example.com","password":"anna123"}' localhost:3000/api/auth/login
curl -b anna.txt -X PATCH -H 'Content-Type: application/json' -d '{"fullName":"X"}' localhost:3000/api/users/usr_dmytro
# Anna tries to make herself IT -> 403
curl -b anna.txt -X PATCH -H 'Content-Type: application/json' -d '{"role":"it"}' localhost:3000/api/users/usr_anna/role
# One page of clients
curl -b anna.txt 'localhost:3000/api/clients?page=2&limit=25'

# Ivan: self -> 403 CANNOT_DEACTIVATE_SELF; Iryna -> 200; self again -> 409 LAST_ACTIVE_ROLE_MEMBER
curl -c ivan.txt -H 'Content-Type: application/json' -d '{"email":"ivan@example.com","password":"ivan123"}' localhost:3000/api/auth/login
curl -b ivan.txt -X PATCH -H 'Content-Type: application/json' -d '{"status":"deactivated"}' localhost:3000/api/users/usr_ivan/status
curl -b ivan.txt -X PATCH -H 'Content-Type: application/json' -d '{"status":"deactivated"}' localhost:3000/api/users/usr_iryna/status
curl -b ivan.txt -X PATCH -H 'Content-Type: application/json' -d '{"status":"deactivated"}' localhost:3000/api/users/usr_ivan/status
```

## Rules for contributors and AI agents

[AGENTS.md](AGENTS.md) holds the rules: where things live, what may import what, the rules an agent is likely to break, and how to add a role. `CLAUDE.md` and `.cursor/rules/project.mdc` point to it.

The rules are enforced, not only written down. The pre-commit hook runs `npm run check`, which fails on any of these:
- a role string compared outside `roles.ts`;
- an `any`, a cast or an `eslint-disable`;
- a route or page missing from the inventory in `tests/architecture.test.ts`, or one without its guard;
- an import across a boundary.

## Tests

- **Unit and HTTP (Vitest, `npm test`).**
  - `tests/permissions.test.ts`: the permission table written out literally. It is the spec.
  - `tests/user-rules.test.ts`, `tests/manager-links.test.ts`: rules 1–5 and who reports to whom, on the seeded store.
  - `tests/api.test.ts`, `tests/api-edge-cases.test.ts`: the six scenarios and the edge cases around them, through the real route handlers. The edge cases include bad bodies, races, session expiry, signing in twice, a stale tab, and role changes mid-session.
  - `tests/architecture.test.ts`: the route inventory with each method's guard, plus the structural rules in AGENTS.md.
- **End to end (Playwright, `npm run test:e2e`)** against the production server, normally the Docker container.
  - `e2e/http.spec.ts`: page statuses and redirects for each role, 405/404/413/415, cookie flags, payload size, a race between two IT.
  - `e2e/ui.spec.ts`: the six scenarios, the forms, and several tabs of one browser, clicked through in Chromium.

## The six scenarios

All six are covered twice: in `tests/api.test.ts` through the route handlers, and in `e2e/ui.spec.ts` in a real browser against the container.

1. **Anna sees only her four reports.** On `/manage-users` she sees four rows, and her only control is "Edit". `PATCH /api/users/usr_dmytro` → 403.
2. **Anna cannot make herself IT.** `PATCH /api/users/usr_anna/role` → 403.
3. **Anna pages through clients.** Each page sends one `GET /api/clients?page=N` with 25 items plus `total: 1200` (about 5 KB). The detail page is rendered on the server.
   - In `npm run dev`, React StrictMode runs effects twice, so the first page is requested twice. A production build requests it once.
4. **Ivan lands on `/manage-users`.** `/content` answers HTTP 403 with a 403 page.
5. **Ivan and the last active IT.** Each attempt shows a different reason, both in the API and as the text next to the disabled button:
   - deactivating himself → 403 `CANNOT_DEACTIVATE_SELF`;
   - deactivating Iryna → 200;
   - deactivating himself again → 409 `LAST_ACTIVE_ROLE_MEMBER`.
6. **Olena is cut off mid-browse.** Olena is browsing and Ivan deactivates her.
   - Her next pager click gets a 401 and the client goes to `/login?reason=session_ended`.
   - A link click is redirected by the server.
   - Logging in again returns 403 `ACCOUNT_DEACTIVATED`.

## Decisions worth knowing

- **Roles are read literally and are not ranked.**
  - IT gets a 403 on `/content`.
  - "Demote yourself" means any change of your own role.
  - IT may still edit its own name and email.
- **The last-active check runs before the self check.** That is why Ivan's second attempt fails with a different reason (`LAST_ACTIVE_ROLE_MEMBER`, 409) than the first (`CANNOT_DEACTIVATE_SELF`, 403).
- **A target outside your scope gets 403, not 404.** It is clearer for this exercise; 404 would hide which ids exist.
- **Who may report to whom is a list per role: `reportsTo`.** Today it is `user → [manager]`, and IT and managers report to nobody.
  - Creating an IT or manager account with a `managerId` is a 400 `INVALID_MANAGER`, and so is a user placed under anyone but an active manager.
  - Promoting a user to manager or IT clears their `managerId`, and the old manager loses them.
  - A new role attached to users or managers is one line, `reportsTo: [ROLE.USER, ROLE.MANAGER]`. The server checks it, the create form offers only those people, and the `directReports` scope reaches the new role.
- **A demoted or deactivated manager keeps their reports linked.** The reports keep their `managerId`, nobody except IT can edit them, and nobody new can be placed under that person. If the manager is restored, they manage the same people again.
- **Users are never deleted, only deactivated.** There is no DELETE endpoint (it answers 405), so a `managerId` never points to a missing user.
- **Mutations check and write with no `await` in between.**
  - `withApi` awaits the route params and the body first.
  - Only then does it resolve the session and call a handler that is synchronous by type.
  - Node is single-threaded, so two simultaneous "deactivate the other IT" requests cannot both pass the last-IT check.
- **Signed-in pages live in the `(app)` route group, which renders the top bar.** When a dead session is redirected to `/login` during client-side navigation, the bar goes away with the group instead of showing the previous user.
- **The data is in memory, so the app must run as a single process.** This rules out serverless and clustering.

## With another four hours

- An audit trail (who changed what, when) shown to IT.
- Reassigning `managerId` from the UI, with rules for what happens to a demoted manager's reports.
- Session expiry in the UI, rate limiting on login, and per-request logging with the actor id.
- Pagination and search on `/manage-users` for when there are more than a handful of users.
- A persistence adapter behind the same store interface (the services would not change).
