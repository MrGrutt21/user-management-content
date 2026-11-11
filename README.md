# User Management & Content

A small Next.js 16 (App Router, TypeScript `strict`) app with three non-hierarchical roles (IT, manager, user), users kept in memory, and 1,200 generated clients behind server-side pagination. The interesting part is **who may do what, and that the server enforces it**: every rule below holds when the API is called directly.

- Live demo: _added after deploy_. All visitors share one in-memory state. Use **Reset demo data** in the top bar to restore the seed; it signs everyone out.

## How to run

```bash
npm install
npm run dev            # http://localhost:3000 (the demo reset button is on in dev)
```

| Command | What it does |
|---|---|
| `npm run check` | typecheck + lint (incl. import boundaries) + tests |
| `npm test` | Vitest: permission matrix, rules, sessions, route handlers |
| `npm run build && npm start` | production build (one process; data resets on restart) |
| `docker build -t umc . && docker run -p 3000:3000 -e DEMO_RESET=true umc` | the same in Docker |

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

Why not JWT or NextAuth: a stateless token is valid until it expires, so rule 5 would need a store lookup per request anyway, and then the token adds nothing. A hand-written session is about 60 lines and easy to explain.

Why no proxy/middleware for auth: Next's proxy runs apart from the app and cannot see the in-memory store. A cookie-presence check there would be a second, weaker source of truth.

## Every place a permission decision is made

1. `src/domain/roles.ts` → `ROLE_POLICIES`: the data. Each role maps every action to `all` / `directReports` / `none`, plus the `keepAtLeastOneActive` flag (rule 4).
2. `src/server/auth/permissions.ts` → `hasCapability()` and `canActOn()`: the only code that turns a role into yes or no.
3. `src/server/users/user-rules.ts`: the rules that don't depend on the role. These are "not yourself" (rule 3) and "not the last active IT" (rule 4), plus manager and email validity.
4. `src/server/auth/session.ts` → `resolveSession()`: is there an active user at all (rule 5).

Pages call `requirePage(action)` and route handlers are wrapped in `withApi({ capability })`. Services call the rule checks for the specific target. All of them delegate to 1–4. The UI shows `allowed` flags that the server computes by dry-running the same checks; it never decides anything itself.

## API

All endpoints return JSON. Errors look like `{ "error": { "code", "message" } }`.

| Method & path | Who | Notes |
|---|---|---|
| `POST /api/auth/login` | anyone | `{ email, password }` → session cookie |
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

There is one endpoint per column of the permission table, so a field cannot ride along in a request that was authorised for another field.

Status codes:
- 401: not logged in or the session has ended.
- 403: the role can't do this, the target is outside your scope, or you are acting on yourself.
- 409: the last active IT, or the email is taken.
- 400: validation failed.
- 404: not found.

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

## The six scenarios

All six are covered by `tests/api.test.ts`, which calls the real route handlers with a session cookie. They were also walked through by hand in the browser.

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
- **A manager can edit a direct report only through `managerId`.** If an IT changes a manager's role, that person's reports keep their `managerId` but nobody except IT can edit them until they are reassigned.
- **Mutations check and write with no `await` in between.**
  - `withApi` awaits the route params and the body first.
  - Only then does it resolve the session and call a handler that is synchronous by type.
  - Node is single-threaded, so two simultaneous "deactivate the other IT" requests cannot both pass the last-IT check.
- **Signed-in pages live in the `(app)` route group, which renders the top bar.** When a dead session is redirected to `/login` during client-side navigation, the bar goes away with the group instead of showing the previous user.
- **The data is in memory, so the app must run as a single process.** This rules out serverless and clustering.

## With another four hours

- Playwright end-to-end tests for the six scenarios, including Olena being bounced to `/login` mid-browse.
- An audit trail (who changed what, when) shown to IT.
- Reassigning `managerId` from the UI, with rules for what happens to a demoted manager's reports.
- Session expiry and rotation in the UI, rate limiting on login, and per-request logging with the actor id.
- Pagination and search on `/manage-users` for when there are more than a handful of users.
- A persistence adapter behind the same store interface (the services would not change).
