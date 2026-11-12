# 0015: Authentication: our own server-side sessions behind the web server, Brevo for email

Status: proposed (2026-11-12, OTA-138). Accepted when the runtime proof (first acceptance criterion of OTA-139) passes.

## Context
Accounts land in W4 (OTA-139, OTA-140). PARITY.md lists as v1: sign-up and sign-in with email + password, sign-in by username, Google, email confirmation, forgot/reset password. The OTA-155 design fixes the behaviour: hard email verification, no account enumeration, username reserved 24 h after a sign-up submit, token links answered with a 303 to a clean URL.

What shapes the design:
- **The browser never calls the API** (ADR 0003): pages and Server Actions call it server-side through `apiClient()`. The ticket assumed a cookie shared by the web and `api` subdomains; nothing in the code needs one.
- Until the cutover (OTA-149) the web is `beta.otakuleague.com` and the API is `api-production-….up.railway.app`: two different sites, so a shared cookie cannot exist today.
- Vercel previews run unreviewed PR code against the production API (ADR 0009).
- EU data (ADR 0009), free tools, no Redis, one API instance, about a week to build, written by agents and reviewed by one person.
- Assumption (old user count unknown until OTA-149): under 10,000 accounts and 1,000 sign-ins a day in the first months.

**Functional.** Visitors should be able to (1) create an account (email, username, password) and confirm the email before any session exists; (2) sign in with email or username (then Google), stay signed in on that browser, and sign out; (3) reset a forgotten password from an emailed link, which signs out every device.

**Non-functional (quantified).**
1. Zero enumeration oracles: sign-up, resend and forgot-password answer with the same status and body whether or not the account exists; sign-in has one failure code; every sign-in attempt costs exactly one argon2 computation.
2. Revocation is immediate: after sign-out or a password reset, the next request with that session is refused (0 s of stale acceptance).
3. Guessing is bounded: at most 10 password attempts per account and 30 per IP per 15 min, and the counters survive a deploy.
4. Latency at the API: the session check adds ≤ 5 ms p95 (one indexed lookup); sign-in ≤ 300 ms p95 (argon2 dominates; measured in OTA-139).
5. €0 a month, no new runtime dependency in the API, up to 300 auth emails a day.

**Consistency vs availability:** consistency. A stale "this session is valid" is a security bug, so sessions are never cached or self-contained (no JWT, no cookie cache). The price: when Postgres is down nobody is signed in; public pages still render.

**Entities:** `User`, `Session`, `AuthToken` (purpose `EMAIL_VERIFICATION` or `PASSWORD_RESET`), `UsernameReservation`, `AuthRateLimit`, `OAuthAccount` (Google ticket); on the web, `Viewer`.

## Options
Auth engine. Versions and dates checked on 2026-11-12 (sources at the end).

| Option | Maintenance | Licence, cost, data | Fit with NestJS + Prisma + ADR 0002/0003 |
|---|---|---|---|
| **A. Own sessions in a Nest `auth` module** (Node `crypto`, Prisma), no auth library (chosen) | Node 24 LTS; `crypto.argon2` added in v24.7.0, no experimental marker in the v24.x docs | MIT; €0; our Railway Postgres (EU West) | Exact: our envelope, validation, `apiClient()`, `Clock`/`Random`, real-Postgres tests. We own every bug. |
| B. Better Auth 1.7.22 on our Postgres | Very active: 1.7.22 published 2026-11-12, 21 stable releases since 2026-09-12. Security release 2026-11-03 fixed 12 advisories (1 critical, 2 high), three in the core we would use (unverified OAuth email treated as verified, revoked sessions kept valid by the cookie cache, email-change links) | MIT; €0; our Postgres | Peers allow Prisma 7 and Next 16. The NestJS integration is community maintained (`@thallesp/nestjs-better-auth` 2.8.0, 2026-09-03): needs `bodyParser: false`, registers a global guard, ESM only. It owns its routes, error shapes and cookies, and its browser client calls `/api/auth/*` directly. |
| C. Passport + our own sessions | `passport` 0.7.0 is from 2023-11-27, `passport-local` 1.0.0 from 2014, `passport-google-oauth20` 2.0.0 from 2019; only the wrapper `@nestjs/passport` 12.0.1 (2026-11-06) is current | MIT; €0; our Postgres | Works, but Passport only supplies the strategy glue (about 40 lines). Sessions, tokens, email and rate limits are still ours. |
| D. Hosted: Clerk, or Supabase Auth (the old site) | Commercial services | Clerk Hobby: 50,000 monthly users free, Clerk branding stays, sessions fixed at 7 days, data region not stated. Supabase Free: 50,000 MAU, EU region, project paused after 1 week idle | Users live outside our Postgres: a second source of truth, webhooks to sync, and their outage is our sign-in outage. PARITY sections 6 and 7 list what Supabase Auth cost the old site (four client modules, username sign-in through an admin lookup). |

Rejected, and why:
- **B (runner-up).** It would be the right call for a Next-only app. Here it breaks two accepted decisions (the ADR 0002 envelope, the ADR 0003 "one network entry, server-side only"), half of the OTA-155 rules still need custom hooks (username reservation, limits per identifier, one failure message), and its release pace (a patch every 3 days, 12 advisories in one release) is a weekly upgrade duty. It stays the fallback: see Consequences.
- **C.** Three unmaintained packages for code we can read in one screen.
- **D.** Fails "users in our EU Postgres" and brings back the old site's split.
- Lucia is deprecated on npm (3.2.2); not considered.

Transactional email (free tiers checked 2026-11-12): **Brevo** 300/day, API included, servers in France, Germany and Belgium (chosen); **Resend** 3,000/month but 100/day, sends from `eu-west-1` yet stores account data and logs in the United States; **Scaleway TEM** 300/month free, then pay as you go. With hard verification the daily cap is the limit that matters: at the cap, new members cannot sign in.

## Decision
1. **Sessions are opaque random tokens stored hashed in Postgres**, created and checked by a new `auth` module in the API. No JWT (charter §9 suggests one): a JWT cannot be revoked at once, which requirement 2 needs.
2. **The session cookie belongs to the web origin only** (host-only, `__Host-` prefix). The web server reads it and sends the token to the API as `Authorization: Bearer`. No cookie on `api.otakuleague.com`, no CORS, no shared `Domain=` cookie.
3. **Credential routes require `X-Internal-Key`** (a secret shared by the web server and the API), so the API can trust the client IP the web server forwards and nobody can guess passwords against the API directly.
4. **argon2id** from Node's built-in `crypto`; **rate limits in Postgres**; **Brevo** behind an `EmailSender` interface, called only from its adapter.
5. **Google** uses the same sessions and ships as its own ticket after OTA-139 (it needs Farouk's Google Cloud steps).

The runtime proof (sign-up → cookie → `GET /me`) could not run in the cloud environment (Node 22, Prisma engines blocked). It is the first acceptance criterion of OTA-139, on Node 24 with real Postgres.

**API sketch** (no `/v1` prefix, like the existing routes; K = needs `X-Internal-Key`, B = needs the Bearer session; auth routes are commands, so they are verbs under `/auth`). Every route can answer 429 `TOO_MANY_REQUESTS` with `Retry-After`.

| Route | Body | Answer |
|---|---|---|
| `POST /auth/sign-up` K | `username, email, password` | 202 `{ browserBinding }`, identical for a new and an existing email |
| `POST /auth/sign-in` K | `identifier, password` | 200 `{ sessionToken, expiresAt }` or 401 `INVALID_CREDENTIALS` |
| `POST /auth/sign-out` B | none | 204 |
| `POST /auth/email-verification/resend` K | `email` | 202 always |
| `POST /auth/email-verification/confirm` K | `token, browserBinding?` | 200 `{ outcome: 'verified' or 'already_verified', sessionToken? }` or 400 `AUTH_TOKEN_INVALID` |
| `POST /auth/password-reset/request` K | `email` | 202 always |
| `POST /auth/password-reset/check` K | `token` | 204 or 400 `AUTH_TOKEN_INVALID` |
| `POST /auth/password-reset/confirm` K | `token, newPassword` | 204 (every session of the user deleted) or 400 |
| `GET /me` B | none | 200 current user or 401 `UNAUTHORIZED` |
| `GET /users/availability?username=` K | none | 200 `{ available }` |

**Data flow.**
```mermaid
sequenceDiagram
  participant B as Browser
  participant W as Web server (Next)
  participant A as API (auth module)
  participant D as Postgres
  B->>W: Server Action signIn (POST; Next rejects a foreign Origin)
  W->>A: POST /auth/sign-in + X-Internal-Key + X-Client-Ip
  A->>D: count the attempt (IP, identifier), load user, argon2 verify, insert Session
  A-->>W: sessionToken
  W-->>B: Set-Cookie __Host-ol_session, redirect to next
  B->>W: GET /my-list
  W->>A: GET /me, Authorization: Bearer token (no-store)
  A->>D: Session by sha256(token), with its User
  A-->>W: current user
```

**Settings.**

| Area | Setting |
|---|---|
| Session cookie | `__Host-ol_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`, `Max-Age` 180 days. In development (`http://localhost`) the name is `ol_session` without `Secure`. |
| Session row | Token: 32 random bytes (base64url) from `Random`; only its SHA-256 is stored (unique index). Valid 30 days idle: the API extends `expiresAt` to now + 30 days when under 15 days remain (at most one write per session per 15 days). Hard stop 180 days after creation. |
| Other web cookies | All `__Host-`, `HttpOnly`, `Lax`: `ol_flash` (address for "Check your email", 10 min), `ol_signup` (`browserBinding`, 24 h), `ol_reset` (reset token taken out of the URL, 10 min), `ol_oauth` (Google state and PKCE verifier, 10 min). |
| CSRF | Every state change is a Server Action: POST only, and Next aborts it when `Origin` does not match `Host`. `SameSite=Lax` is the second layer. A mutating route handler must call one `assertSameOrigin()` helper (403 otherwise). No CSRF token: no other origin may call us, and the API reads no cookie. |
| Password hashing | `crypto.argon2('argon2id')`, memory 19,456 KiB, 2 passes, parallelism 1, 16-byte salt, 32-byte tag (OWASP minimum). Stored as a PHC string (`$argon2id$v=19$m=19456,t=2,p=1$salt$hash`), compared with `timingSafeEqual`, rehashed at sign-in when the constants rise. Password: 8 to 128 characters with a digit or symbol (parity). |
| Rate limits | Table `auth_rate_limit` (`key`, `windowStart`, `count`), one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` per key. Keys are SHA-256 of the route plus the IP, or plus the normalised identifier, counted whether or not the account exists. Sign-in 10 per identifier and 30 per IP per 15 min; sign-up 3 per email and 5 per IP per hour; resend and reset request 3 per email and 10 per IP per hour; token confirm/check 10 per IP per 15 min; availability 60 per IP per minute. |
| Auth tokens | 32 random bytes, SHA-256 at rest, single use through one atomic `UPDATE … WHERE usedAt IS NULL AND expiresAt > now() RETURNING`. Verification 24 h, reset 1 h. A new token cancels the older ones of that purpose. |
| Email | Brevo API (`POST /v3/smtp/email`), 5 s timeout, no automatic retry (a send is not idempotent; the member has "Resend"). HTML + text templates live in the API. Sent after the response, so timing does not reveal the branch. Click and open tracking off. From `no-reply@otakuleague.com`. |
| Cleanup | Daily job: expired sessions, tokens, reservations and rate-limit rows; accounts still unverified after 7 days. |

**Why Postgres for rate limits, not memory.** Railway restarts the API on every merge, so in-memory counters hand an attacker a fresh budget at each deploy (the old site's `Map` had this bug, PARITY section 7), and they would be wrong with a second instance. The cost is two small upserts per auth request: even an attack at 100 requests/s is 200 writes/s against a database that takes thousands, and the IP limit refuses before argon2 runs. A general per-IP throttle for the whole API can be in-memory (W7 hardening); it is not this table.

**Domains and environments.**
- **Beta today:** works with no DNS change. The cookie is host-only on `beta.otakuleague.com`; the API stays on its Railway domain.
- **Cutover (OTA-149):** the cookie host changes, so members sign in once more. `www` answers 308 to the apex (one host owns the cookie). `beta` keeps a 308 that preserves path and query for at least 24 h so emailed links still work. `WEB_PUBLIC_URL` flips to `https://otakuleague.com`. `api.otakuleague.com` needs neither cookie nor CORS.
- **Vercel previews are signed-out only.** `INTERNAL_API_KEY` is set in Vercel's Production environment only, so preview code cannot reach a credential route and never sees a real password; the auth pages show "Sign-in is off on preview deployments". In production a missing key throws on the first auth call instead. Auth is exercised locally, in CI (integration tests, PR screenshots, both on a local API) and on beta after merge. Revisit if a Railway PR environment is added.
- **Later clients** (mobile app, extension) send the same Bearer token; a browser calling the API directly would need a new decision (CORS, CSRF).

**Security notes.**
- **Session fixation:** a session id is only ever created by the API at sign-in, verification or Google callback, never taken from the client; signing in always issues a new one and deletes the one the cookie held; a password reset deletes them all. Guests have no session.
- **Enumeration:** as in requirement 1. Unknown user: verify against a fixed dummy hash. Sign-up with a known email mails its owner instead. An unconfirmed account gets the same sign-in failure, with the resend link always shown (OTA-155 question 1, decided: stay generic). Auth logs carry `userId` only: no email, username, IP or token.
- **Tokens in URLs (the one exception to "no secret in a URL"):** an emailed link must carry its token. It only ever appears in the web URL, never in an API URL (the web posts it in a body). The web answers 303 to a clean URL with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **Mail scanners open links.** So the reset link's GET never uses the token up: it moves it into `ol_reset`, and only the POST of the new password consumes it. The verification GET does consume its token (confirming twice is harmless).
- **Account pre-hijacking and login CSRF:** a verification link signs the visitor in only when the browser also holds the `browserBinding` from that sign-up; elsewhere it confirms the email and asks to sign in. Linking Google to an existing account deletes its password and sessions.
- **`next`** is a same-origin path only (OTA-155).
- **Secrets** live in env vars only. To add to `.env.example` with the build tickets: `INTERNAL_API_KEY` (API and web; dev placeholder), `WEB_PUBLIC_URL`, `EMAIL_PROVIDER` (`brevo`, or `console` which the API refuses in production), `BREVO_API_KEY`, `EMAIL_FROM`, later `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Consequences
- **We own the security of this code**, against charter §8 ("prefer a proven provider"). Accepted because the surface is small (no MFA, no email change, no JWT, no cookie cache) and every property above is an integration test. OTA-139 goes through `secure-builder` and `security-reviewer`. **Fallback:** if the proof or the security review finds a structural flaw, switch to Better Auth mounted in the API; the tables (`User`, `Session`, `OAuthAccount`, `AuthToken`) map onto its four.
- Each signed-in page costs one extra API call (`GET /me`), and viewer-dependent UI must sit outside the static shell (ADR 0014). `apiClient()` calls that carry a session are always `no-store`, which closes the open point of ADR 0003.
- An API or database outage must not sign people out: `Viewer` is `signed_in`, `signed_out` or `unavailable`, and the cookie is cleared only on a 401.
- Email is a single point for sign-up: above 300 a day, or when Brevo is down, new members wait and use "Resend". Failed sends go to Sentry. Brevo Starter ($9/month) or the Resend adapter is the way out.
- Old Supabase members (OTA-149): the PHC format is self-describing, so bcrypt hashes could be imported (that needs a bcrypt dependency), or members get a "set your password" email, 300 a day.
- Not verified by running, to check in OTA-139 and the email ticket: argon2 time on Railway's CPU, `crypto.argon2` on its Node (24.7 or later), whether Brevo's free plan adds a footer to API emails, and that tracking can be turned off.

**Too simple?** Known gaps, accepted for v1: no CAPTCHA (a botnet can spend the email quota: per-IP limits only; add Turnstile if Sentry shows it), no email outbox or retry, no breached-password check, no list of active sessions. **Too complicated?** Three parts look optional and are not: the internal key (without it every request comes from Vercel's IPs and per-IP limits mean nothing), the Postgres counters (see above), `browserBinding` (about 15 lines against a known takeover). Left out on purpose: Redis, JWT plus refresh tokens, Passport, a queue.

## Learnings
(Filled in after OTA-139 and OTA-140.) So far: the ticket asked how to share a cookie across subdomains; reading ADR 0003 first showed the simpler answer is not to share one.

## Follow-up tickets
- **OTA-139:** first criterion = runtime proof; hard verification; routes, cookies, limits and tests from this ADR.
- **OTA-140:** reset flow as above; avatar storage and Settings are not decided here and should be split out.
- **New, Farouk:** Brevo account, domain DNS (DKIM, DMARC), env vars on Railway and Vercel.
- **New:** Build: Google sign-in (plus Farouk's Google Cloud OAuth client).
- **OTA-149, OTA-148, OTA-152:** cutover steps above; privacy page (Brevo as processor, the session cookie, hashed IPs kept under 24 h); `Viewer` in the header.

## Sources (checked 2026-11-12)
- npm registry (`registry.npmjs.org`): `better-auth`, `@thallesp/nestjs-better-auth`, `passport`, `passport-local`, `passport-google-oauth20`, `@nestjs/passport`, `lucia`: versions, dates, licences, peers.
- Better Auth: [security release 2026-11-03](https://better-auth.com/blog/security-release-2026-11-03), [NestJS](https://better-auth.com/docs/integrations/nestjs), [Prisma](https://better-auth.com/docs/adapters/prisma), [email and password](https://better-auth.com/docs/authentication/email-password), [security](https://better-auth.com/docs/reference/security).
- Hosted: [Clerk pricing](https://clerk.com/pricing), [Supabase pricing](https://supabase.com/pricing).
- Email: [Brevo transactional](https://www.brevo.com/products/transactional-email/), [Brevo data location](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location), [Resend pricing](https://resend.com/pricing), [Resend regions](https://resend.com/docs/dashboard/domains/regions), [Scaleway TEM plans](https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans).
- Platform: [Node 24 `crypto.argon2`](https://github.com/nodejs/node/blob/v24.x/doc/api/crypto.md), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Next.js data security](https://nextjs.org/docs/app/guides/data-security) (Server Action origin check, updated 2026-10-06), [Vercel request headers](https://vercel.com/docs/headers/request-headers) (`x-forwarded-for` is overwritten), [Railway specs](https://docs.railway.com/networking/public-networking/specs-and-limits) (`X-Real-IP`).
