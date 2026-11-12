# 0015: Authentication: our own server-side sessions behind the web server, Brevo for email

Status: proposed (2026-11-12, OTA-138; revised the same day after review). Accepted when the runtime proof (first acceptance criterion of OTA-139) passes.

## Context
Accounts are built in OTA-139 and OTA-140. PARITY.md lists as v1: sign-up and sign-in with email + password, sign-in by username, Google, email confirmation, forgot/reset password. The OTA-155 design fixes the behaviour: hard email verification, no account enumeration, username held 24 h after a sign-up submit, token links answered with a 303 to a clean URL.

What shapes the design:
- **The browser never calls the API** (ADR 0003): pages and Server Actions call it server-side through `apiClient()`. The ticket assumed a cookie shared by the web and `api` subdomains; nothing in the code needs one.
- Until the cutover (OTA-149) the web is `beta.otakuleague.com` and the API is `api-production-….up.railway.app`: two different sites, so a shared cookie cannot exist today.
- Vercel previews run unreviewed PR code against the production API (ADR 0009).
- EU data (ADR 0009), free tools, no Redis, one API instance, code written by agents and reviewed by one person.
- Assumption (old user count unknown until OTA-149): under 10,000 accounts and 1,000 sign-ins a day in the first months.
- **Schedule.** `docs/ROADMAP.md` plans accounts for 2026-11-22 and launch for 2026-11-30; CLAUDE.md says launch 2026-12-28. Not resolved here; the triggers in the Decision use the ROADMAP dates.

**Functional.** Visitors should be able to (1) create an account (email, username, password) and confirm the email before any session exists; (2) sign in with email or username (then Google), stay signed in on that browser, and sign out; (3) reset a forgotten password from an emailed link, which signs out every device.

**Non-functional (quantified).**
1. Zero enumeration oracles: sign-up, resend and forgot-password answer with the same status and body whether or not the email has an account; sign-in has one failure code. Sign-up always runs one argon2 hash, and every sign-in that passes the rate limit runs one argon2 verification (a rehash happens after the response).
2. Revocation is immediate: after sign-out or a password reset, the next request with that session is refused (0 s of stale acceptance).
3. Guessing is bounded: 5 attempts per (identifier, IP) and 30 per IP per 15 min, 30 per identifier per hour. An account has two identifiers (email, username), so the ceiling is 60 per account per hour. Counters survive a deploy.
4. Latency at the API: the session check adds ≤ 5 ms p95 (one indexed lookup); sign-in ≤ 300 ms p95 (argon2 dominates; measured in OTA-139).
5. €0 a month; no new runtime dependency in the API for email + password (Google may add `openid-client`); auth email stays under Brevo's 300 a day through a budget.

**Consistency vs availability:** consistency. A stale "this session is valid" is a security bug, so sessions are never cached or self-contained (no JWT, no cookie cache). The price: when Postgres is down nobody is signed in; public pages still render.

**Entities:** `User` (unverified = a pending sign-up), `Session`, `AuthToken` (purpose `EMAIL_VERIFICATION` or `PASSWORD_RESET`), `UsernameHold`, `AuthRateLimit`, `OAuthAccount` (Google ticket). On the web, `Viewer`, which replaces ADR 0014's `ShellViewer`.

## Options
Auth engine. Versions and dates checked on 2026-11-12 (sources at the end).

| Option | Maintenance | Licence, cost, data | Fit with NestJS + Prisma + ADR 0002/0003 |
|---|---|---|---|
| **A. Own sessions in a Nest `auth` module** (Node `crypto`, Prisma), no auth library (chosen) | Node 24 LTS; `crypto.argon2` added in v24.7.0, no experimental marker in the v24.x docs | MIT; €0; our Railway Postgres (EU West) | Close: our envelope, validation, `Clock`/`Random`, real-Postgres tests. `apiClient()` needs an ADR 0003 addendum (follow-ups). We own every bug. |
| B. Better Auth 1.7.22 on our Postgres | Very active: 1.7.22 published 2026-11-12, 21 stable releases since 2026-09-12. Security release 2026-11-03 fixed 12 advisories (1 critical, 2 high), three in the core we would use (unverified OAuth email treated as verified, revoked sessions kept valid by the cookie cache, email-change links) | MIT; €0; our Postgres | Peers allow Prisma 7 and Next 16. The NestJS integration is community maintained (`@thallesp/nestjs-better-auth` 2.8.0, 2026-09-03): needs `bodyParser: false`, registers a global guard, ESM only. It owns its routes, error shapes and cookies, and its browser client calls `/api/auth/*` directly. |
| C. Passport + our own sessions | `passport` 0.7.0 is from 2023-11-27, `passport-local` 1.0.0 from 2014, `passport-google-oauth20` 2.0.0 from 2019; only the wrapper `@nestjs/passport` 12.0.1 (2026-11-06) is current | MIT; €0; our Postgres | Works, but Passport only supplies the strategy glue (about 40 lines). Sessions, tokens, email and rate limits are still ours. |
| D. Hosted: Clerk, or Supabase Auth (the old site) | Commercial services | Clerk Hobby: 50,000 monthly users free, Clerk branding stays, sessions fixed at 7 days, data region not stated. Supabase Free: 50,000 MAU, EU region, project paused after 1 week idle | Users live outside our Postgres: a second source of truth, webhooks to sync, and their outage is our sign-in outage. PARITY sections 6 and 7 list what Supabase Auth cost the old site (four client modules, username sign-in through an admin lookup). |

Rejected, and why:
- **B (runner-up).** Right for a Next-only app. Here it breaks two accepted decisions (the ADR 0002 envelope, the ADR 0003 "one network entry, server-side only"), half of the OTA-155 rules still need custom hooks (username hold, limits per identifier, one failure message), and its release pace (a patch every 3 days, 12 advisories in one release) is a weekly upgrade duty. It is the fallback (see Decision).
- **C.** Three unmaintained packages for code we can read in one screen.
- **D.** Fails "users in our EU Postgres" and brings back the old site's split.
- Lucia is deprecated on npm (3.2.2); not considered.

Transactional email (free tiers checked 2026-11-12): **Brevo** 300/day, API included, servers in France, Germany and Belgium (chosen); **Resend** 3,000/month but 100/day, sends from `eu-west-1` yet stores account data and logs in the United States; **Scaleway TEM** 300/month free, then pay as you go. With hard verification the daily cap is the limit that matters: at the cap, new members cannot sign in.

## Decision
1. **Sessions are opaque random tokens stored hashed in Postgres**, created and checked by a new `auth` module in the API.
2. **The session cookie belongs to the web origin only** (host-only, `__Host-` prefix). The web server reads it and sends the token to the API as `Authorization: Bearer`. No cookie on `api.otakuleague.com`, no CORS, no shared `Domain=` cookie.
3. **Credential routes require `X-Internal-Api-Key`** (a secret shared by the web server and the API), so the API can trust the client IP the web server forwards and nobody can guess passwords against the API directly.
4. **argon2id** from Node's built-in `crypto`; **rate limits and an email budget in Postgres**; **Brevo** behind an `EmailSender` interface, called only from its adapter.
5. **Google** uses the same sessions and ships as its own ticket after OTA-139 (it needs Farouk's Google Cloud steps).

**Charter deviations** (the charter now points here): §8 "prefer a proven provider" (we build it: options B and D above); §9 "JWT for user sessions" (a JWT cannot be revoked at once, which requirement 2 needs); §9 "resources are plural nouns" and `/v1` (auth routes are commands, so verbs under `/auth`; no `/v1` because no existing route has one).

**Proof, triggers, fallback.** The runtime proof (sign-up → cookie → `GET /me`) could not run in the cloud environment (Node 22, Prisma engines blocked); it is the first acceptance criterion of OTA-139, on Node 24 with real Postgres. If it is not green by **2026-11-16**, Farouk chooses that day between the Better Auth switch and a later accounts date. If email + password is not merged by **2026-11-20**, Google sign-in leaves v1. The fallback is a migration, not a switch: its tables, routes and cookies, password hashes moved to where it keeps them (from memory its `account` table; not verified), our argon2id plugged into its `password.hash`/`verify` options (documented; its default is scrypt), and exceptions to ADR 0002 and 0003. Estimate: 2 to 3 days.

**API sketch** (K = needs `X-Internal-Api-Key` and a valid `X-Client-Ip`; B = needs the Bearer session). Every route can answer 429 `TOO_MANY_REQUESTS` with `Retry-After`.

| Route | Body | Answer |
|---|---|---|
| `POST /auth/sign-up` K | `username, email, password` | 202 `{ bindingToken }`, identical for a new and an existing email; 409 `USERNAME_TAKEN` |
| `POST /auth/sign-in` K | `identifier, password` | 200 `{ sessionToken, expiresAt }` or 401 `INVALID_CREDENTIALS` |
| `POST /auth/sign-out` B | none | 204 |
| `POST /auth/email-verification/resend` K | `email` | 202 always |
| `POST /auth/email-verification/confirm` K | `token, bindingToken?` | 200 `{ outcome }`: `verified` (with `sessionToken` only when the binding matched), `already_verified`, `confirmation_required`; or 400 `AUTH_TOKEN_INVALID` |
| `POST /auth/password-reset/request` K | `email` | 202 always |
| `POST /auth/password-reset/check` K | `token` | 204 or 400 `AUTH_TOKEN_INVALID` |
| `POST /auth/password-reset/confirm` K | `token, newPassword` | 204 or 400 |
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
  W->>A: POST /auth/sign-in + X-Internal-Api-Key + X-Client-Ip
  A->>D: count the attempt, load user, argon2 verify, insert Session
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
| Session cookie | `__Host-ol_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`, `Max-Age` 180 days. The `__Host-` prefix and `Secure` apply when `WEB_PUBLIC_URL` is HTTPS (not derived from `NODE_ENV`); on `http://localhost` the name is `ol_session`. |
| Session row | Token: 32 bytes from `Random.bytes(n)` (new method), base64url; only its SHA-256 is stored (unique index). Valid 30 days idle: the API extends `expiresAt` to now + 30 days when under 15 days remain (one write per session per 15 days at most). Hard stop 180 days after creation. A session stores the `User.sessionEpoch` it was created under and is valid only while the two are equal. |
| Other web cookies | Same attributes, short-lived: `ol_flash` (address for "Check your email", 10 min), `ol_signup` (`bindingToken`, 24 h), `ol_verify` and `ol_reset` (a link's token taken out of the URL, 10 min), `ol_oauth` (Google `state`, PKCE verifier, 10 min). |
| CSRF | Every state change is a Server Action: POST only, and Next aborts it when `Origin` does not match `Host`; `serverActions.allowedOrigins` is never set. `SameSite=Lax` is the second layer. A non-GET route handler must call `assertSameOrigin()`: `Origin` equal to the `WEB_PUBLIC_URL` origin, absent or `null` refused. A test walks `app/**/route.ts` and fails on a handler without it (allowlist with a reason: the `/hikari` tunnel, ADR 0003). No CSRF token: no other origin may call us and the API reads no cookie. |
| State-changing GETs | Three, each with its own guard. Verification link: the token plus a matching `ol_signup` binding (otherwise it only sets `ol_verify`). Reset link: only sets `ol_reset`, no server state. Google callback: `state` equal to the one in `ol_oauth`, plus PKCE. |
| Sign-up | A username that is taken or held answers 409, decided before and independently of the email lookup. Then always one argon2 hash. New email: an unverified `User`. Unverified email again: the pending username and hash are overwritten and older tokens cancelled. Verified email: nothing changes and its owner gets a notice. Every submit holds the username for 24 h (`PENDING_SIGN_UP_TTL`), the same constant that expires unverified accounts and verification tokens; after it "Resend" answers 202 and sends nothing. |
| Password | `crypto.argon2('argon2id')`: memory 19,456 KiB, 2 passes, parallelism 1, 16-byte salt, 32-byte tag (OWASP minimum). Stored as a PHC string, compared with `timingSafeEqual`, rehashed after a successful sign-in when the constants rise. At most 2 hashes run at once (the libuv pool has 4 threads, shared with DNS and file I/O); the others queue briefly, then 503. `engines.node` moves to `>=24.7`. Password: NFC-normalised, 8 to 128 characters with a digit or symbol (parity), refused when in a static list of the 10,000 most common passwords (a data file in the API; check its licence). |
| Rate limits | Table `auth_rate_limit` (`key`, `windowStart`, `count`), one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` per key, counted whether or not the account exists. Keys are HMAC-SHA256 (`AUTH_HMAC_KEY`) of the route with the IP (IPv6 cut to its /64), the normalised identifier, or both. Sign-in: 5 per (identifier, IP) and 30 per IP per 15 min, 30 per identifier per hour. Sign-up: 5 per IP per hour. Resend and reset request: 10 per IP per hour. Token confirm/check: 10 per IP per 15 min. Availability: 60 per IP per minute. |
| Lockout trade-off | The identifier ceiling lets an attacker with two or more IPs block password sign-in for one member for up to an hour (reset and Google still work). Without it, guessing from many IPs is unbounded. One IP alone stays under the ceiling (20 an hour). |
| Email budget | Per address: 5 emails per 24 h across all purposes. Per IP: 20 triggered emails per 24 h. Global: 250 a day for sign-up mail and 50 kept for password resets; Sentry alert at 240 (80 % of Brevo's 300). Over budget: the same 202, nothing sent, a Sentry event. |
| Auth tokens | 32 random bytes, SHA-256 at rest, single use through one atomic `UPDATE … WHERE usedAt IS NULL AND expiresAt > now() RETURNING`. Verification 24 h, reset 1 h. A new token cancels the older ones of that purpose. `bindingToken`: 32 bytes, its SHA-256 on the verification token row. A password reset is one transaction: consume the token, store the hash, raise `sessionEpoch`, delete the sessions; a sign-in racing it creates a session that is already invalid. |
| Internal key | `INTERNAL_API_KEY`: 32 random bytes, required by the API's production env validation (ADR 0002), the dev placeholder refused in production, compared with `timingSafeEqual`; `INTERNAL_API_KEY_PREVIOUS` is accepted too, for rotation. The web copies `X-Client-Ip` from Vercel's `x-forwarded-for` (Vercel overwrites it); a K route without a valid IP is refused, never counted in a shared bucket. `apiClient()` refuses to send the key, a Bearer token or a password to an `API_BASE_URL` that is neither HTTPS nor loopback. |
| Email | Brevo API (`POST /v3/smtp/email`), 5 s timeout, no automatic retry (a send is not idempotent; the member has "Resend"). HTML + text templates live in the API. Sent after the response, so timing does not reveal the branch. From `no-reply@otakuleague.com`. |
| Cleanup | In-process timer like `AnimePurgeScheduler` (a minute after boot, then every 24 h), not a Railway cron: expired sessions, tokens, holds and rate-limit rows; unverified accounts past the 24 h TTL. |

**Why Postgres for rate limits, not memory.** Railway restarts the API on every merge, so in-memory counters hand an attacker a fresh budget at each deploy (the old site's `Map` had this bug, PARITY section 7), and they would be wrong with a second instance. The cost is a few small upserts per auth request: an attack at 100 requests/s is a few hundred writes/s against a database that takes thousands, and the IP limit refuses before argon2 runs. A general per-IP throttle for the whole API can be in-memory (W7 hardening); it is not this table.

**Domains and environments.**
- **Beta today:** works with no DNS change. The cookie is host-only on `beta.otakuleague.com`; the API stays on its Railway domain.
- **Cutover (OTA-149):** delete every session (the cookie host changes, members sign in once more). `www` answers 308 to the apex (one host owns the cookie). `beta` keeps a 308 that preserves path and query for 24 h so emailed links still work, then its DNS record is deleted. `WEB_PUBLIC_URL` flips to `https://otakuleague.com`. `api.otakuleague.com` needs neither cookie nor CORS. Launch gates: Brevo click and open tracking off, 2FA on the Brevo account.
- **Vercel previews are signed-out only.** `INTERNAL_API_KEY` is set in Vercel's Production environment only, so preview code cannot reach a credential route and never sees a real password; the auth pages show "Sign-in is off on preview deployments". In production a missing key throws on the first auth call. Checklist: `vercel env ls` shows the key in Production only and marked Sensitive; Deployment Protection is on for previews; the `otakuleague-core.vercel.app` production alias redirects to the canonical host. Auth is exercised locally, in CI (integration tests, PR screenshots, both on a local API) and on beta after merge.
- **Later clients** (mobile app, extension) send the same Bearer token; a browser calling the API directly would need a new decision (CORS, CSRF).

**Security notes.**
- **Session fixation:** a session id is only ever created by the API (sign-in, the verifying transition, Google callback), never taken from the client; signing in always issues a new one and deletes the one the cookie held. Guests have no session.
- **Enumeration:** as in requirement 1. Unknown user: verify against a fixed dummy hash. An unconfirmed account gets the same sign-in failure, with the resend link always shown (OTA-155 question 1, decided: stay generic). Auth logs carry `userId` only: no email, username, IP or token.
- **Tokens in URLs (the one exception to "no secret in a URL"):** an emailed link must carry its token. It is always in the query string (`?token=`), never a path segment, because logs keep the path and drop the query (ADR 0004); it never appears in an API URL (the web posts it in a body). The web answers 303 to a clean URL with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **Mail scanners open links, and account pre-hijacking.** A GET never spends a token on its own. Verification: when the browser holds `ol_signup`, the web posts the token with the `bindingToken`, and the API consumes the token only if the binding matches; that verifying transition is the only one that returns a session. Without a match nothing is consumed: the token moves into `ol_verify`, the web answers 303 to a "Confirm my email" page, and its Server Action confirms without a session ("Email confirmed, sign in"). `already_verified` never returns a session. Reset: the GET moves the token into `ol_reset`; only the POST of the new password consumes it.
- **Google:** the identity is Google's `sub`, never the email. A new `sub` creates an account, or links to the account with that email only when Google reports `email_verified` and the account has no Google link (a different `sub` is refused). A link deletes the account's password and sessions and emails the owner. `state` and the PKCE verifier (and a nonce when the ID token is validated) live in `ol_oauth`; the redirect URI is built from `WEB_PUBLIC_URL`. Code flow plus the userinfo endpoint, or `openid-client`; never parse an ID token by hand.
- **`next`:** resolved with `new URL(next, WEB_PUBLIC_URL)`, kept only when its origin is ours, and the redirect goes to its `pathname + search`. Test payloads: `//evil.com`, `/\evil.com`, `/%09/evil.com`, a tab or newline inside the scheme, `https:evil.com`, `javascript:`.
- **Redaction (ADR 0004):** the names `X-Internal-Api-Key`, `sessionToken`, `bindingToken`, `token` and `password` all match the pattern in `packages/shared-types/src/redaction.ts`; a test asserts it.
- **Secrets** live in env vars only. To add to `.env.example` with the build tickets: `INTERNAL_API_KEY` and `INTERNAL_API_KEY_PREVIOUS` (API and web), `AUTH_HMAC_KEY`, `WEB_PUBLIC_URL` (API and web), `EMAIL_PROVIDER` (`brevo`, or `console` which the API refuses in production), `BREVO_API_KEY`, `EMAIL_FROM`, later `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Consequences
- **We own the security of this code.** Accepted because the surface is small (no MFA, no email change, no JWT, no cookie cache) and every property above is an integration test. OTA-139 goes through `secure-builder` and `security-reviewer`.
- Each signed-in page costs one extra API call (`GET /me`), and viewer-dependent UI must sit outside the static shell (ADR 0014). `apiClient()` calls that carry a session are always `no-store`, which closes the open point of ADR 0003.
- `Viewer` is `signed_out`, `signed_in { username }` or `unavailable`. For `unavailable` (API or database down) the header shows an empty slot the size of the guest actions: no "Sign in", no account menu. A Server Component cannot delete a cookie, so a 401 renders `signed_out` and the next Server Action, route handler or `proxy.ts` pass deletes the stale cookie; nothing else ever clears it.
- Email is a single point for sign-up: over the budget, or when Brevo is down, new members wait and use "Resend". Brevo Starter ($9/month) or a Resend adapter is the way out.
- Old Supabase members (OTA-149): the PHC format is self-describing, so bcrypt hashes could be imported (that needs a bcrypt dependency), or members get a "set your password" email, within the daily budget.
- Not verified by running, to check in OTA-139 and the email ticket: argon2 time on Railway's CPU, Railway's Node version, whether Brevo's free plan adds a footer to API emails, and that tracking can be turned off.

**Too simple?** Known gaps, accepted for v1: no CAPTCHA (a botnet can spend the sign-up email budget; the reset reserve and the alert limit the damage; add Turnstile if it happens), no email outbox or retry, no breached-password API, no list of active sessions. **Too complicated?** Three parts look optional and are not: the internal key (without it every request comes from Vercel's IPs and per-IP limits mean nothing), the Postgres counters, the binding (a known takeover otherwise). Left out on purpose: Redis, JWT plus refresh tokens, Passport, a queue.

## Learnings
(Filled in after OTA-139 and OTA-140.) So far: the ticket asked how to share a cookie across subdomains; reading ADR 0003 first showed the simpler answer is not to share one.

## Follow-up tickets
- **OTA-139:** first criterion = runtime proof; hard verification; routes, cookies, limits and tests from this ADR; `engines.node >=24.7`; `Random.bytes(n)`. It also writes the **ADR 0003 addendum**: typed `session` and `clientIp` options on `apiClient()` (the client adds the key itself; no free-form headers), `retryAfterSeconds` on the rate-limited failure, and the new error codes `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `AUTH_TOKEN_INVALID`, `TOO_MANY_REQUESTS`, `USERNAME_TAKEN`.
- **OTA-140:** reset flow as above; avatar storage and Settings are not decided here and should be split out.
- **New, Farouk:** Brevo account (2FA, tracking off), domain DNS (DKIM, DMARC), env vars on Railway and Vercel, the Vercel checklist.
- **New:** Build: Google sign-in (plus Farouk's Google Cloud OAuth client).
- **OTA-149, OTA-148, OTA-152:** cutover steps above; privacy page (Brevo as processor, the session cookie, keyed hashes of IPs and identifiers kept under about 48 h: the longest window plus the daily cleanup); `Viewer` in the header.

## Sources (checked 2026-11-12)
- npm registry (`registry.npmjs.org`): `better-auth`, `@thallesp/nestjs-better-auth`, `passport`, `passport-local`, `passport-google-oauth20`, `@nestjs/passport`, `lucia`: versions, dates, licences, peers.
- Better Auth: [security release 2026-11-03](https://better-auth.com/blog/security-release-2026-11-03), [NestJS](https://better-auth.com/docs/integrations/nestjs), [Prisma](https://better-auth.com/docs/adapters/prisma), [email and password](https://better-auth.com/docs/authentication/email-password), [security](https://better-auth.com/docs/reference/security).
- Hosted: [Clerk pricing](https://clerk.com/pricing), [Supabase pricing](https://supabase.com/pricing).
- Email: [Brevo transactional](https://www.brevo.com/products/transactional-email/), [Brevo data location](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location), [Resend pricing](https://resend.com/pricing), [Resend regions](https://resend.com/docs/dashboard/domains/regions), [Scaleway TEM plans](https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans).
- Platform: [Node 24 `crypto.argon2`](https://github.com/nodejs/node/blob/v24.x/doc/api/crypto.md), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Next.js data security](https://nextjs.org/docs/app/guides/data-security) (Server Action origin check, updated 2026-10-06), [Vercel request headers](https://vercel.com/docs/headers/request-headers) (`x-forwarded-for` is overwritten), [Railway specs](https://docs.railway.com/networking/public-networking/specs-and-limits) (`X-Real-IP`).
