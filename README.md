# auth-service

Authentication and role-based authorization on Cloudflare: one Worker (Hono), one D1 database, [Better Auth](https://better-auth.com) for email/password accounts and sessions.

## What is verified

| Item | Status |
|---|---|
| `npx tsc --noEmit` | passes |
| `npm test` (21 tests, real Workers runtime + D1 via `@cloudflare/vitest-plugin`) | passes |
| `npm run build` (`wrangler deploy --dry-run`) | passes (~422 KiB gzip) |
| `wrangler dev` manual run: sign-up, session cookie, `/api/me`, `/api/admin/users`, bootstrap admin | works locally |
| Remote deploy to Cloudflare | **not tested** (needs your account) |

The HTML pages (`/`, `/login`, `/register`, `/dashboard`, `/admin`) are minimal server-checked shells. There is no login form UI yet; use the API.

## Routes

| Route | Access |
|---|---|
| `GET /` , `/login`, `/register` | public (`/register` is 404 when sign-up is disabled) |
| `GET /dashboard` | signed-in users |
| `GET /admin` | role `admin` |
| `GET /api/me` | signed-in; returns id, name, email, role, permissions |
| `GET /api/admin/users` | permission `users:read` |
| `PUT /api/admin/users/:id/role` body `{"role":"admin"\|"member"}` | permission `roles:manage` |
| `DELETE /api/admin/users/:id` | permission `users:manage` |
| `/api/auth/*` | Better Auth (`sign-up/email`, `sign-in/email`, `sign-out`, `get-session`, ...) |
| `GET /api/auth/token` | signed-in; returns a 15-minute EdDSA JWT for use by other services |
| `GET /api/auth/jwks` | public; public keys for verifying those JWTs |

There are no content routes; the app only manages users and roles.

Status codes: 401 not authenticated, 403 authenticated but not permitted, 400 invalid input, 404 unknown user.

## Local development

```powershell
npm install
# secret for local dev (git-ignored)
Set-Content .dev.vars "BETTER_AUTH_SECRET=$([Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }) -as [byte[]]))"
npm run db:migrate:local
npm run dev        # http://localhost:8787
```

`wrangler.toml` ships with a placeholder `database_id`; local mode ignores it.

Try it:

```powershell
'{"email":"me@example.com","password":"a long passphrase","name":"Me"}' | Set-Content body.json
curl.exe -i -c jar.txt -X POST http://localhost:8787/api/auth/sign-up/email -H "Origin: http://localhost:8787" -H "Content-Type: application/json" --data-binary "@body.json"
curl.exe -b jar.txt http://localhost:8787/api/me
```

## Creating the first admin

Option A (recommended, any environment): register normally, then promote with SQL.

```powershell
# local
npx wrangler d1 execute auth-service-db --local --command "UPDATE user_roles SET role_id='admin' WHERE user_id=(SELECT id FROM user WHERE email='you@example.com')"
# remote
npx wrangler d1 execute auth-service-db --remote --command "UPDATE user_roles SET role_id='admin' WHERE user_id=(SELECT id FROM user WHERE email='you@example.com')"
```

Option B: set `BOOTSTRAP_ADMIN_EMAIL` (var in `wrangler.toml`, or in `.dev.vars` locally). The first registration with that email becomes admin, only while no admin exists. Because email is not verified, register that account immediately and then clear the variable.

Afterwards, admins manage roles through `PUT /api/admin/users/:id/role`. Nobody can change their own role.

## Tests

```powershell
npm test
npm run typecheck
npm run build
```

Tests cover: registration, login, logout, weak passwords, cookie flags, 401 without credentials, forged bearer/cookie tokens, client-supplied identity headers, expired and revoked sessions, member vs admin access, privilege escalation (self and others), mass assignment of `role` at sign-up, bootstrap admin, validation (bad role, unknown user), CSRF (foreign/missing Origin), security headers.

## Deploy to Cloudflare

```powershell
npx wrangler login
npx wrangler d1 create auth-service-db
# copy the printed database_id into wrangler.toml (replace REPLACE_WITH_YOUR_D1_DATABASE_ID)
# set PUBLIC_URL in wrangler.toml to your https origin (e.g. https://auth-service.<subdomain>.workers.dev)
npx wrangler secret put BETTER_AUTH_SECRET      # paste a random 32+ char value, e.g. `openssl rand -base64 32`
npm run db:migrate:remote
npm run deploy
```

Set `DISABLE_SIGNUP = "true"` for invite-only mode (then create users some other way, e.g. temporarily re-enable, or insert via Better Auth server APIs).

## Architecture and security

- One Worker. `src/auth.ts` builds the single Better Auth configuration from `env` per request (bindings exist only at request time) on the D1 binding. No second auth instance exists anywhere.
- `src/middleware/auth.ts`: `requireAuth` calls `auth.api.getSession({ headers })`; any missing, invalid, expired, revoked session or any thrown error yields 401. Transport is Better Auth's signed session cookie only; the Bearer plugin is not enabled, so `Authorization` headers are ignored.
- Roles and permissions are read from D1 (`user_roles`, `role_permissions`) using the verified session user id; nothing client-supplied is trusted. One role per user (`user_roles.user_id` is the primary key). New users get `member`.
- Seeded permissions: `users:read`, `users:manage`, `roles:manage` (admin has all; member has none).
- Cookies: HttpOnly, SameSite=Lax, Secure when `PUBLIC_URL` is https. Sessions last 7 days.
- CSRF: Better Auth validates Origin for its endpoints; our own state-changing `/api/*` routes require `Origin` to equal `PUBLIC_URL`.
- Headers: restrictive CSP, nosniff, frame denial, HSTS, no-referrer, `Cache-Control: no-store` on responses.
- Passwords are hashed by Better Auth (minimum length 12).
- JWTs: the Better Auth `jwt` plugin issues short-lived (15 min) EdDSA tokens (`iss`/`aud` = `PUBLIC_URL`, `sub` = user id) at `GET /api/auth/token`, and publishes public keys at `/api/auth/jwks` (table `jwks`, in `0001_init.sql`). They are meant for other services to verify. This Worker does not accept them as authentication (cookie only), and they cannot be revoked before expiry. Verify with e.g. `jose`: `jwtVerify(token, createRemoteJWKSet(new URL(PUBLIC_URL + '/api/auth/jwks')), { issuer, audience })`.
- Queries use prepared statements with bound parameters; input validated with zod.
- Schema: `migrations/0001_init.sql` (Better Auth `user`, `session`, `account`, `verification`, `rateLimit`, `jwks` plus RBAC tables with foreign keys and seed data).

## Rate limiting

Better Auth's limiter is enabled and stored in D1: 5 requests/min per IP for sign-in and sign-up, 60/min otherwise, keyed on `CF-Connecting-IP`. Limitations: it is per-IP only (no per-account lockout), D1 writes make it consume free-tier write quota, and it is best-effort under concurrency. Add Cloudflare WAF rate-limiting rules on `/api/auth/*` for stronger protection (availability depends on your plan).

## Known gaps

- No login/register/admin UI forms yet.
- No email verification or password reset (needs an email provider).
- Role assignment removes no existing sessions; a demoted user keeps their session but loses permissions immediately because permissions are checked per request.
- Last-admin protection: you cannot change/delete yourself, so an admin cannot remove the last admin by self-action; another admin could still demote you.

## Free-tier notes (check current Cloudflare pricing)

Workers Free: 100k requests/day, 10 ms CPU per request (password hashing is the main CPU cost; if sign-ups hit CPU limits, a paid plan may be needed). D1 Free: 5M rows read/day, 100k rows written/day, 5 GB total. Bundle limit 3 MiB gzip on Free (current ~422 KiB). Nothing here uses paid-only features.
