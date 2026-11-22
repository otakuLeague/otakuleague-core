# 0015: Authentication: our own server-side sessions behind the web server, Brevo for email

Status: proposed (2026-11-12, OTA-138; revised the same day after review). Accepted when the runtime proof (first acceptance criterion of OTA-139) passes.

Built so far: slice 1a (OTA-139), the `app_user` and `auth_session` tables, the session check (`apps/api/src/auth/`: `SessionGuard`, `SessionService`, pure `session-rules.ts`) and `GET /me`, for `web` callers only; sessions are seeded by tests until sign-in lands. Slice 1b: `PasswordHasher` (argon2id, `HashSlots`). Slice 1c-i: the `auth_rate_limit` table and `AuthRateLimiter` (one upsert per key, stops at the first refusal), pure `auth-rate-limit-rules.ts` (`SIGN_IN_LIMITS`, `rateLimitKey`, `decide`) and `credential-rules.ts`, `AUTH_HMAC_KEY` behind `AuthSecrets`, error codes `INVALID_CREDENTIALS` and `TOO_MANY_REQUESTS`. Slice 1c-ii: `POST /auth/sign-in` (`CredentialGuard`: `web` callers with a valid `X-Client-Ip` only; `SignInService`: count, look up, one verification, `SessionService.create`) and `POST /auth/sign-out` (deletes the Bearer session's row). After a successful sign-in, the web calls sign-out with the previous token; a failure there is ignored and left to the cleanup timer (a failed sign-in must never destroy the current session). Server-side alternative, an option for 1c-iii or 1f: sign-in takes an optional Bearer token and deletes that session in the same transaction as the insert. Slice 1c-iii: `PasswordRehasher`, after a successful sign-in and not awaited, rehashes a weaker cost with a compare-and-set on the hash read at sign-in (one per user at a time, only in a free hash slot, epoch untouched; a database error is one warning with the user id). Slice 1d: the `auth_token` and `auth_username_hold` tables (used from 1e) and the cleanup timer (`AuthCleanupScheduler`, `AuthCleanupService`: five deletes, each at the cutoff its rule already treats as ended, `now` from `Clock`). Next: 1e, sign-up and verification; 1f, the web side.

## Context
Accounts are built in OTA-139 and OTA-140. PARITY.md lists as v1: sign-up and sign-in with email + password, sign-in by username, Google, email confirmation, forgot/reset password. The OTA-155 design fixes the behaviour: hard email verification, no account enumeration, username held 24 h after a sign-up submit, token links answered with a 303 to a clean URL.

What shapes the design:
- **The browser never calls the API** (ADR 0003): pages and Server Actions call it server-side through `apiClient()`. The ticket assumed a cookie shared by the web and `api` subdomains; nothing in the code needs one.
- Until the cutover (OTA-149) the web is `beta.otakuleague.com` and the API is `api-production-….up.railway.app`: two different sites, so a shared cookie cannot exist today.
- Vercel previews run unreviewed PR code against the production API (ADR 0009).
- EU data (ADR 0009), free tools, no Redis, one API instance, code written by agents and reviewed by one person.
- Assumption (old user count unknown until OTA-149): under 10,000 accounts and 1,000 sign-ins a day in the first months.
- **Schedule.** `docs/ROADMAP.md` plans accounts for 2026-11-22 and launch for 2026-11-30; CLAUDE.md said launch 2026-12-28. Resolved 2026-11-13 (Farouk, OTA-193): launch is 2026-11-30.

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

**Proof, triggers, fallback.** The runtime proof (sign-up → cookie → `GET /me`) could not run in the cloud environment (Node 22, Prisma engines blocked); it is the first acceptance criterion of OTA-139, on Node 24 with real Postgres. If it is not green by **2026-11-23**, Farouk chooses that day between the Better Auth switch and a later accounts date. If email + password is not merged by **2026-11-27**, Google sign-in leaves v1. The fallback is a migration, not a switch: its tables, routes and cookies, password hashes moved to where it keeps them (from memory its `account` table; not verified), our argon2id plugged into its `password.hash`/`verify` options (documented; its default is scrypt), and exceptions to ADR 0002 and 0003. Estimate: 2 to 3 days. Updated 2026-11-15 (Farouk): both dates moved (from 2026-11-16 and 2026-11-20), same plan, no Better Auth switch.

**API sketch** (K = needs `X-Internal-Api-Key` and a valid `X-Client-Ip`; B = needs the Bearer session). Every route can answer 429 `TOO_MANY_REQUESTS` with `Retry-After`.

| Route | Body | Answer |
|---|---|---|
| `POST /auth/sign-up` K | `username, email, password` | 202 `{ bindingToken }`, identical for a new and an existing email; 409 `USERNAME_TAKEN` |
| `POST /auth/sign-in` K | `identifier, password` | 200 `{ sessionToken, expiresAt }` or 401 `INVALID_CREDENTIALS` |
| `POST /auth/sign-out` B | none | 204 |
| `POST /auth/email-verification/resend` K | `email` | 202 always |
| `POST /auth/email-verification/confirm` K | `token, bindingToken?, password?` | 200 `{ outcome }`: `verified` (with `session` only when the binding matched), `already_verified`, `confirmation_required`; or 400 `AUTH_TOKEN_INVALID`, 401 `INVALID_CREDENTIALS` (ADR 0020 Addendum 1e-ii) |
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
| CSRF | Every state change is a Server Action: POST only, and Next aborts it when `Origin` does not match `Host`; `serverActions.allowedOrigins` is never set. `SameSite=Lax` is the second layer. A non-GET route handler must call `assertSameOrigin()`: `Origin` equal to the `WEB_PUBLIC_URL` origin, absent or `null` refused. A test walks `app/**/route.ts` and fails on a handler without it (allowlist with a reason: the `/hikari` tunnel, ADR 0003). No CSRF token: no other origin may call us and the API reads no cookie. Since ADR 0017, browser data writes are such non-GET route handlers under `app/api/`, not Server Actions. |
| State-changing GETs | Three, each with its own guard. Verification link: the token plus a matching `ol_signup` binding (otherwise it only sets `ol_verify`). Reset link: only sets `ol_reset`, no server state. Google callback: `state` equal to the one in `ol_oauth`, plus PKCE. |
| Sign-up | A username that is taken or held answers 409, decided before and independently of the email lookup. Then always one argon2 hash. New email: an unverified `User`. Unverified email again: the pending username and hash are overwritten and older tokens cancelled. Verified email: nothing changes and its owner gets a notice. Every submit holds the username for 24 h (`PENDING_SIGN_UP_TTL`), the same constant that expires unverified accounts and verification tokens; after it "Resend" answers 202 and sends nothing. |
| Password | `crypto.argon2('argon2id')`: memory 19,456 KiB, 2 passes, parallelism 1, 16-byte salt, 32-byte tag (OWASP minimum). Stored as a PHC string, compared with `timingSafeEqual`, rehashed after a successful sign-in when the constants rise (only a stored cost below them, so a rollback never downgrades; never queued for a hash slot, skipped when none is free). At most 2 hashes run at once (the libuv pool has 4 threads, shared with DNS and file I/O); the others queue briefly (up to 8), then 429 `AUTH_BUSY` with `Retry-After: 1` (not 503: the filter logs every 5xx with a stack, ADR 0019). `engines.node` moves to `>=24.7`. Password: NFC-normalised, 8 to 128 characters with a digit or symbol (parity), refused when in a static list of the 10,000 most common passwords (a data file in the API; check its licence). |
| Rate limits | Table `auth_rate_limit` (`key`, `windowStart`, `count`), one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` per key, counted whether or not the account exists. Keys are HMAC-SHA256 (`AUTH_HMAC_KEY`) of the route with the IP (IPv6 cut to its /64), the normalised identifier, or both. Sign-in: 5 per (identifier, IP) and 30 per IP per 15 min, 30 per identifier per hour. Sign-up: 5 per IP per hour. Resend and reset request: 10 per IP per hour. Token confirm/check: 10 per IP per 15 min. Availability: 60 per IP per minute. Windows are fixed and start at a key's first attempt, so a burst straddling a boundary can reach 2 × limit − 1 (accepted: still bounded, one row per key, no sliding log). |
| Lockout trade-off | The identifier ceiling lets an attacker with two or more IPs block password sign-in for one member for up to an hour (reset and Google still work). Without it, guessing from many IPs is unbounded. One IP alone stays under the ceiling (20 an hour). The ceiling counts per spelling: email and username are separate keys, so up to 2 × 30 per account (accepted: one counter per account would let a caller link a username to its email). |
| Email budget | Per address: 5 emails per 24 h across all purposes. Per IP: 20 triggered emails per 24 h. Global: 250 a day for sign-up mail and 50 kept for password resets; Sentry alert at 240 (80 % of Brevo's 300). Over budget: the same 202, nothing sent, a Sentry event. |
| Auth tokens | 32 random bytes, SHA-256 at rest, single use through one atomic `UPDATE … WHERE usedAt IS NULL AND expiresAt > now() RETURNING`. Verification 24 h, reset 1 h. A new token cancels the older ones of that purpose. `bindingToken`: 32 bytes, its SHA-256 on the verification token row. A password reset is one transaction: consume the token, store the hash, raise `sessionEpoch`, delete the sessions; a sign-in racing it creates a session that is already invalid. |
| Internal key | `INTERNAL_API_KEY`: 32 random bytes, required by the API's production env validation (ADR 0002), the dev placeholder refused in production, compared with `timingSafeEqual`; `INTERNAL_API_KEY_PREVIOUS` is accepted too, for rotation. Built earlier and for every route by [ADR 0019](0019-internal-api-key-and-visitor-import-limit.md) (OTA-182), optional in production until OTA-139. The web copies `X-Client-Ip` from Vercel's `x-forwarded-for` (Vercel overwrites it); a K route without a valid IP is refused, never counted in a shared bucket. `apiClient()` refuses to send the key, a Bearer token or a password to an `API_BASE_URL` that is neither HTTPS nor loopback. |
| Email | Brevo API (`POST /v3/smtp/email`), 5 s timeout, no automatic retry (a send is not idempotent; the member has "Resend"). HTML + text templates live in the API. Sent after the response, so timing does not reveal the branch. From `no-reply@otakuleague.com`. |
| Cleanup | In-process timer like `AnimePurgeScheduler` (a minute after boot, then every 24 h), not a Railway cron: expired sessions, tokens, holds and rate-limit rows (a counter is deleted 24 h after its window started, the longest window any rule may use); unverified accounts past their `pending_expires_at` (set to now + the 24 h TTL by every submit and resend (resend no longer moves it, ADR 0020 Addendum 1e-ii), cleared on verification, null for older accounts, which are never deleted; a column of the deleted row, so a racing re-submit keeps the account). The nightly backup leaves out the data of `auth_rate_limit`, `auth_token` and `auth_username_hold`. Each step is independent: one failing never stops the others. |

**Why Postgres for rate limits, not memory.** Railway restarts the API on every merge, so in-memory counters hand an attacker a fresh budget at each deploy (the old site's `Map` had this bug, PARITY section 7), and they would be wrong with a second instance. The cost is a few small upserts per auth request: an attack at 100 requests/s is a few hundred writes/s against a database that takes thousands, and the IP limit refuses before argon2 runs. A general per-IP throttle for the whole API can be in-memory (W7 hardening); it is not this table.

**Domains and environments.**
- **Beta today:** works with no DNS change. The cookie is host-only on `beta.otakuleague.com`; the API stays on its Railway domain.
- **Cutover (OTA-149):** delete every session (the cookie host changes, members sign in once more). `www` answers 308 to the apex (one host owns the cookie). `beta` keeps a 308 that preserves path and query for 24 h so emailed links still work, then its DNS record is deleted. `WEB_PUBLIC_URL` flips to `https://otakuleague.com`. `api.otakuleague.com` needs neither cookie nor CORS. Launch gates: Brevo click and open tracking off, 2FA on the Brevo account.
- **Vercel previews are signed-out only.** The production `INTERNAL_API_KEY` is set in Vercel's Production environment only, so preview code cannot reach a credential route and never sees a real password; the auth pages show "Sign-in is off on preview deployments". Update (ADR 0019, OTA-182): Vercel's Preview environment holds a different value under the same name (the API's `INTERNAL_API_KEY_PREVIEW`, a `preview` caller that credential routes refuse), so the web must detect a preview by `VERCEL_ENV`, never by the key being absent. In production a missing key throws on the first auth call. Checklist: `vercel env ls` shows `INTERNAL_API_KEY` with Production holding the production key and Preview holding the preview key, both Sensitive, never the same value; Deployment Protection is on for previews; the `otakuleague-core.vercel.app` production alias redirects to the canonical host. Auth is exercised locally, in CI (integration tests, PR screenshots, both on a local API) and on beta after merge.
- **Later clients** (mobile app, extension) send the same Bearer token; a browser calling the API directly would need a new decision (CORS, CSRF).

**Security notes.**
- **Session fixation:** a session id is only ever created by the API (sign-in, the verifying transition, Google callback), never taken from the client; signing in always issues a new one and, from 1f-iv, deletes the one the cookie held (see [Addendum (1f-iii-a)](#addendum-1f-iii-a)). Guests have no session.
- **Enumeration:** as in requirement 1. Unknown user: verify against a fixed dummy hash. An unconfirmed account gets the same sign-in failure, with the resend link always shown (OTA-155 question 1, decided: stay generic). Auth logs carry `userId` only: no email, username, IP or token.
- **Tokens in URLs (the one exception to "no secret in a URL"):** an emailed link must carry its token. It is always in the query string (`?token=`), never a path segment, because logs keep the path and drop the query (ADR 0004); it never appears in an API URL (the web posts it in a body). The web answers 303 to a clean URL with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **Mail scanners open links, and account pre-hijacking.** A GET never spends a token on its own. Verification: when the browser holds `ol_signup`, the web posts the token with the `bindingToken`, and the API consumes the token only if the binding matches; that verifying transition is the only one that returns a session. Without a match nothing is consumed: the token moves into `ol_verify`, the web answers 303 to a "Confirm my email" page, and its Server Action confirms without a session ("Email confirmed, sign in"). `already_verified` never returns a session. Superseded in part by [ADR 0020 Addendum (1e-ii)](0020-sign-up-and-email-verification.md#addendum-1e-ii): without a matching binding, that confirmation needs the sign-up password, and resend no longer moves the account's deadline. Reset: the GET moves the token into `ol_reset`; only the POST of the new password consumes it.
- **Google:** the identity is Google's `sub`, never the email. A new `sub` creates an account, or links to the account with that email only when Google reports `email_verified` and the account has no Google link (a different `sub` is refused). A link deletes the account's password and sessions and emails the owner. `state` and the PKCE verifier (and a nonce when the ID token is validated) live in `ol_oauth`; the redirect URI is built from `WEB_PUBLIC_URL`. Code flow plus the userinfo endpoint, or `openid-client`; never parse an ID token by hand.
- **`next`:** resolved with `new URL(next, WEB_PUBLIC_URL)`, kept only when its origin is ours, and the redirect goes to its `pathname + search`. Test payloads: `//evil.com`, `/\evil.com`, `/%09/evil.com`, a tab or newline inside the scheme, `https:evil.com`, `javascript:`. The origin check alone lets `/.//evil.com` through as `//evil.com`; a single leading `/` is required before and after resolving (`safeNextPath`, slice 1f-ii).
- **Redaction (ADR 0004):** the names `X-Internal-Api-Key`, `sessionToken`, `bindingToken`, `token` and `password` all match the pattern in `packages/shared-types/src/redaction.ts`; a test asserts it.
- **Secrets** live in env vars only. To add to `.env.example` with the build tickets: `INTERNAL_API_KEY` and `INTERNAL_API_KEY_PREVIOUS` (API and web), `AUTH_HMAC_KEY`, `WEB_PUBLIC_URL` (API and web), `EMAIL_PROVIDER` (`brevo`, or `console` which the API refuses in production), `BREVO_API_KEY`, `EMAIL_FROM`, later `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Addendum (1f-iii-a)
Added 2026-11-20 with the sign-in action (OTA-139 slice 1f-iii-a). `POST /auth/sign-in` takes no Bearer, so the API cannot delete the session the cookie held. The web does it: after a successful sign-in, a best-effort `POST /auth/sign-out` with the old token through `sessionCall` (1f-iv). Until then the cookie is replaced and the old session idles out (30 days). Fixation is unaffected: a token is only ever issued by the API. Rejected: the API accepting the old Bearer on sign-in (a second, optional credential on a route that must stay simple); revisit in 1f-iv.

## Addendum (1f-iii-c)
Added 2026-11-20 (OTA-139 slice 1f-iii-c). An open redirect needs only one `redirect(next)` that skips `safeNextPath`, so lint makes the three existing callers the only ones: `no-restricted-syntax` in `apps/web/eslint.config.mjs` bans value imports of `redirect`/`permanentRedirect` from `next/navigation` (any import form, re-exports, `next/navigation.js`, a path ending in `/next/navigation`) and anything from `next/dist/`, everywhere except a named import in `src/auth/redirect-to.ts` (`SafeNextPath` only) and the anime slug helpers `resolve-tab.ts` and `season-redirect.ts` (targets from `tabHref()` on a canonical slug that must match `CANONICAL_SLUG_PATTERN`, else the outage path; never request input). Type-only imports stay allowed. Dynamic import gate, those three files included: `import()` takes a string literal and never `next/navigation`, `next/dist/`, `…api/client` or an ADR 0003 network module (`http`, `https`, `node:http`, `node:https`, `undici`), so a dynamic import with a normal literal specifier cannot step around this gate or the ADR 0003 network and auth gates; `require()` is already an error (`@typescript-eslint/no-require-imports`). `linterOptions.noInlineConfig` on every non-test file makes an `eslint-disable` comment inert outside tests. The signed-out redirect of 1f-iv is a second helper in `redirect-to.ts`, never a fourth allowlisted file. `IDENTIFIER_MAX` (254) and `PASSWORD_RAW_MAX` (1024) move to `@otakuleague/shared-types`, so the web form and the API DTOs check one value. Lint is a guard against mistakes, not against intent; not covered: `NextResponse.redirect`/`Response.redirect` (route handlers and `proxy.ts`; decide at 1f-vi, the first auth route handler); client-side navigation (`useRouter().push`, `window.location`); `createRequire`; an `eslint-disable` in a test file; path variants (`next/./navigation`, `../api/./client`); an `apiClient` aliased or wrapped after a legal import. Rejected: a custom ESLint plugin (a dependency for what selectors already do) and banning `next/navigation` wholesale (`notFound`, `usePathname`, `unstable_rethrow` are needed everywhere).

## Addendum (1f-iv)
Added 2026-11-20 (OTA-139 slice 1f-iv), written before the code. The slice does not fit one PR of about 400 lines, so it ships as three: **iv-a** session core (`sessionCall`, `Viewer`, `loadViewer`, fault reports; nothing reachable), **iv-b** sign-out (`signOutAction`, `redirectToSignedOut`, old-session delete after sign-in, sign-in fault reports, loopback host check), **iv-c** header (viewer slot, sign-out button). No API change, no new variable, dependency or error code.

| # | Requirement |
|---|---|
| F1–F3 | A member sees their username in the header on every page; a member can sign out; signing in over an old cookie deletes the session it held. |
| N1 | Cost: a visitor without a cookie costs 0 API calls; a cookie costs exactly 1 `GET /me` per render, `no-store`, 2,000 ms timeout (the default is 5,000). |
| N2 | The header never breaks a page: `loadViewer` throws 0 times apart from Next's control-flow signals; a configuration error is `unavailable`. |
| N3 | Sign-out makes at most 1 API call (2,000 ms, never retried) and clears the cookie on 100 % of same-origin submits, whatever the API answers. |
| N4 | At most 1 Sentry event per fault kind per server instance per 10 minutes, carrying the route and the fault only. |
| N5 | With JavaScript off, 100 % of the guest header links stay reachable (ADR 0014 requirement 1). |

**Consistency vs availability.** Availability for the read: a page never waits for or fails on the viewer, and an unknown viewer is the empty slot. Sign-out is consistent where it is cheap (this browser's cookie always goes) and best-effort for the session row.

**Entities:** `Viewer`, `SessionCallResult`, `AuthCallFault`. **API:** none new: `GET /me` (200, 401, 403 `INTERNAL_KEY_REQUIRED`) and `POST /auth/sign-out` (204; 401 means already gone).

**Decisions.**
1. **`sessionCall`** (`src/auth/session-call.ts`) is the second and last auth file allowed to import `apiClient()` (lint `ignores` plus rows in `network-lint-rule.test.ts`). It takes a `SessionToken` (never a raw string), sends the Bearer with the key, no `X-Client-Ip`, GET or POST only, one attempt. On a preview (`credentialRoutesOff`) it refuses before any request: preview code never sends a Bearer. `readSessionToken(webPublicUrl)` beside it is the only reader of the session cookie.
2. **`loadViewer` is total.** Preview → `signed_out` before `WEB_PUBLIC_URL` is read (previews have none). No cookie or a malformed one → `signed_out`, no call. 200 with a body that passes `isMeResponse` (`username` matches `USERNAME_PATTERN`) → `signed_in`; 401 → `signed_out`; everything else → `unavailable`. A thrown configuration error (missing key or `WEB_PUBLIC_URL`) is caught after `unstable_rethrow`, reported, and is `unavailable`: in an action a throw breaks one submit, in the root layout it would replace every page with `global-error`. Rendering never writes or deletes a cookie. *Amended by [Addendum (1f-iv-c)](#addendum-1f-iv-c), decision 5: no cookie under either name is `signed_out` before `WEB_PUBLIC_URL` is read.*
3. **Reports.** `reportAuthCallFault(route, fault)` with `fault` = `internal_key_refused` (403 `INTERNAL_KEY_REQUIRED`), `invalid_response` or `configuration`, one throttle per fault kind (a `Map` with three keys) so one fault cannot hide another; routes `sign-in`, `sign-out`, `me`. Network, timeout, 429 and 5xx are not reported (the API reports its own 5xx). *Amended by [Addendum (1f-iv-b2)](#addendum-1f-iv-b2) for sign-out only: an unconfirmed revocation is reported as `revocation_unconfirmed`, a fourth key.*
4. **Sign-out.** `isSameOrigin` first: otherwise nothing changes. Then at most one `POST /auth/sign-out` when the cookie holds a well-formed token, then `clearedSessionCookie` whatever the answer (never `cookies().delete()`), then `redirectToSignedOut()`: a second helper in `redirect-to.ts` that takes no argument and goes to the constant `/` with `RedirectType.replace`. A failed delete (anything but 204 or 401) is reported under decision 3 where it is a fault, and the row idles out.
5. **Old session after sign-in.** The old token is read before the credential call and deleted only after a successful sign-in, awaited with the 2,000 ms timeout, result ignored, before the new cookie is set. Not in `after()`: one more moving part for a rare path.
6. *Withdrawn by [Addendum (1f-iv-b2)](#addendum-1f-iv-b2), decision 4: never built.* **Loopback host check** (security L2 of slice 1f-iii-a, as understood from its one-line note): off Vercel, `readCredentialClientIp` sends 127.0.0.1 only when the request's `Host` equals the host of `WEB_PUBLIC_URL`, else refuses (`host_mismatch`, shown as `unavailable`, not reported). It reads `host` only, never `x-forwarded-for`; the test "never reads a header off Vercel" changes to match. A guard against a dev server reachable beyond loopback, not against a forged header.
7. **Header.** `SiteHeader` stays synchronous; the actions become `<Suspense fallback={<ViewerSlot />}><ViewerActions /></Suspense>`. `ViewerSlot` is the empty slot the size of the guest actions, with the guest links inside `<noscript>` (N5). `signed_in` shows the username and a `<form action={signOutAction}>` button; the account menu of ADR 0014 slice 2b stays its own ticket. *Replaced by [Addendum (1f-iv-c)](#addendum-1f-iv-c): a hidden sizer plus a `<noscript>` fallback, and the account menu for `signed_in`.*

**Rejected.**
- **Guest links as the Suspense fallback.** A member would see "Sign in" on every hard load until `/me` answers, and for 2 s when the API is slow.
- **Keeping the cookie when the sign-out call fails**, to retry later. On a shared computer the next person stays signed in; a password reset is the documented way to kill every session.
- **`sessionCall` inside `credential-call.ts`.** Session calls send no client IP and credential calls no Bearer; one function with both options makes each easy to send by mistake.

**Too simple?**
- A sign-out during an API outage leaves the session row valid until it idles out (30 days) though the browser no longer holds the token. Accepted; one retry or an outbox if it is ever observed.
- A stale cookie is only removed by sign-in or sign-out, so its holder costs one 401 `/me` per page until the cookie expires (180 days at most). Accepted until `proxy.ts` covers more than `/anime`.
- A no-JS member sees the guest links and cannot sign out from the header.

**Too complicated?** The per-fault throttle and the host check are the two optional parts; both are a few lines and each closes a recorded review finding. Left out: React `cache()` around `loadViewer` (one caller today; add with the first page that reads the viewer, W5), `after()`, a retry.

**Not verified by running:** that Next re-renders the root layout after a Server Action that sets a cookie and redirects (the header must change on sign-in and sign-out: check on beta in iv-c), and the `<noscript>` fallback in a browser with JavaScript off.

## Addendum (1f-iv-b)
Added 2026-11-20 (OTA-139 slice 1f-iv-b), written before the code. It refines decisions 4 and 5 of [Addendum (1f-iv)](#addendum-1f-iv); nothing there is reversed. The six items listed for iv-b come to about 480 changed lines with tests, so iv-b ships as two: **iv-b** session lifecycle (`deleteSession`, `signOutAction`, `redirectToSignedOut`, old-session delete after sign-in; the sign-in change is live, `signOutAction` has no caller until iv-c) and **iv-b2** credential-call follow-ups (the sign-in fault reports, moved here to keep the iv-b review small; the loopback host check of decision 6, unchanged, and the reporter file renamed to `auth-reports.ts`). iv-b2 depends on nothing in iv-b and must merge before sign-up opens (1f-v).

| # | Requirement |
|---|---|
| F2, F3 | As in 1f-iv: a member can sign out; signing in over an old cookie deletes the session it held. |
| F4 | A misconfigured sign-out (key refused, body off contract, a throw) reaches Sentry without a visitor being able to cause it; the same for sign-in in iv-b2. |
| N3 | As in 1f-iv, and it now holds when the call throws: at most 1 `POST /auth/sign-out` (2,000 ms, never retried), cookie cleared on 100 % of same-origin submits. |
| N4 | As in 1f-iv: at most 1 Sentry event per fault kind per instance per 10 minutes. |
| N6 | Sign-in over a well-formed old cookie makes exactly 1 extra call (2,000 ms, never retried), 0 otherwise; a failed delete fails 0 sign-ins. Worst case for one sign-in: 5,000 + 2,000 ms. |
| N7 | A sign-out from another origin, without `Origin`, or on a preview makes 0 API calls and 0 cookie writes. |

**Consistency vs availability.** Unchanged: this browser's cookie is consistent (always cleared, always replaced), the session row is best-effort and can stay valid until it idles out (30 days without use, 180 days at most). **Entities:** none new. **API:** none new (`POST /auth/sign-out`: 204, or 401 already gone).

**Data flow.** Sign-out: preview → return; `Origin` is not `WEB_PUBLIC_URL` → return; read the cookie; a well-formed token → `deleteSession`; set `clearedSessionCookie`; `redirectToSignedOut()`. Sign-in: as before up to the form check; read the old token; `credentialCall`; report a fault (iv-b2); on success `deleteSession(old)` when there was one; set the new cookie; `redirectTo(next)`.

**Decisions.**
1. **`deleteSession(session)`** (`src/auth/delete-session.ts`) is the one place that calls `POST /auth/sign-out`, for both actions. It is total like `loadViewer` (only Next's control-flow signals pass, through `unstable_rethrow`) and returns nothing: 204 and 401 are both "gone", an `AuthCallFault` is reported, a throw is reported as `configuration`. This is what makes N3 and N6 true when `INTERNAL_API_KEY` is missing: without it a throw would skip the cookie clear, or lose a sign-in the API already accepted.
2. **The report's route tag names the API route called**, so the old-session delete inside sign-in reports as `sign-out`; `sign-in` is only the credential call. `signInAction` itself keeps no try/catch: its configuration errors still surface.
3. **A preview sign-out returns before `WEB_PUBLIC_URL` is read** (previews have none, and no session can exist there). A refused `Origin` returns the same way: no cookie read, no redirect, no report.
4. **`redirectToSignedOut()`** takes no argument and holds the constant `/`; the lint allowlist is unchanged.

**Rejected.**
- **`deleteSession` exported from `sign-out-action.ts`.** Every export of a `'use server'` file is a public endpoint; this one would take a token from any caller. The action files export their action only.
- **One PR for all six items.** The host check and the rename touch `src/api/client-ip.ts` and every reporter import, and share nothing with the session code; together they pass the 400-line limit and blur the review of the part that deletes sessions.

**Too simple?**
- Two sign-ins submitted at once from one browser both read the same old token: one new session ends in the cookie, the other is orphaned until it idles out. Accepted.
- A 404 or another unexpected 4xx envelope on `POST /auth/sign-out` is no fault under decision 3 of 1f-iv, so a missing route would fail silently. Accepted: the API's integration spec covers the route.
- A refused sign-out shows nothing and leaves the member signed in. It happens on a host that is not `WEB_PUBLIC_URL` (where sign-in is refused too), but also when a proxy or extension strips `Origin`, or when `WEB_PUBLIC_URL` changed after members signed in. iv-c must make `signOutAction` return a `refused` state and show "Could not sign out".
- Sign-out is an unthrottled POST that costs one API call, like `GET /me` on every signed-in page; the planned general throttle covers both.
- A failed server-side revocation (timeout, 5xx) is not reported yet: iv-b2 adds a throttled, tags-only `revocation_unconfirmed` report.

**Too complicated?** No guard for "the new token equals the old one" (only the API issues tokens). The host check is close to redundant for sign-in, where `isSameOrigin` already refuses a browser on another host; its value is for `credentialCall`'s later callers (sign-up, reset), so iv-b2 decides again whether it earns its lines.

**Not verified by running:** `signOutAction` from a browser (no caller before iv-c).

## Addendum (1f-iv-b2)
Added 2026-11-20 (OTA-139 slice 1f-iv-b2), written before the code. It finishes what [Addendum (1f-iv-b)](#addendum-1f-iv-b) left to this slice, amends decision 3 of [Addendum (1f-iv)](#addendum-1f-iv) for the sign-out route only, and withdraws its decision 6 (the `Host` check). No API change, no new variable, dependency or error code.

| # | Requirement |
|---|---|
| F4 | As in 1f-iv-b, now for sign-in too: a refused key (403 `INTERNAL_KEY_REQUIRED`) or a body off contract (`invalid_response` under 500) on `POST /auth/sign-in` reaches Sentry as route `sign-in`. |
| F5 | A sign-out whose revocation the API did not confirm reaches Sentry as `revocation_unconfirmed`, from both callers of `deleteSession`. |
| F6 | No key, Bearer or password leaves for an `API_BASE_URL` that is neither https nor exactly `127.0.0.1` or `[::1]` (S2 of ADR 0003). Already true; restated because this slice was asked to check it. |
| N4 | As in 1f-iv, now with four kinds: at most 1 Sentry event per kind per server instance per 10 minutes (so at most 6 an hour per kind per warm instance). Our tags are route and kind only; the SDK adds its stack, runtime context and the request's method and path, and `scrubErrorEvent` drops the query and the user and masks secret-named keys: never a token, a password, a username or an IP. |
| N8 | A report adds 0 API calls and 0 ms of waiting to sign-in and sign-out (flushed in `after()`) and fails 0 of them (it never throws). |
| N9 | Sign-in sends 0 reports for what the visitor's input decides (wrong password, validation, a 429 or `AUTH_BUSY` envelope) and 0 for an outage (timeout, network, 5xx). |

**Consistency vs availability.** Unchanged: this browser's cookie is consistent, the session row is best-effort. A report is best-effort too and never delays or fails the action it describes. **Entities:** `AuthReportKind` = `AuthCallFault` or `revocation_unconfirmed`. **API:** none new.

**Data flow.** Sign-in: as before up to `credentialCall`; a called and failed result goes through `authCallFaultOf`, and a fault is reported as `sign-in`; then the form state as before. `deleteSession` (guard: a 2xx must have no body): 204 or a 401 `UNAUTHORIZED` envelope → nothing; any other failed answer → one report as `sign-out`, the fault when there is one, else `revocation_unconfirmed`; a throw → `configuration`; a preview refusal → nothing (no call was made, and a preview holds no session).

**Decisions.**
1. **Sign-in reports faults, not throws.** `signInAction` still has no try/catch (decision 2 of 1f-iv-b): a configuration error surfaces as a failed action, as before.
2. **`revocation_unconfirmed` is everything that is neither "gone" nor a fault**: timeout, network, 429, any 5xx, and any other 4xx envelope (a 401 with another code too), so the silent 404 accepted in 1f-iv-b is now reported. Never two reports for one delete. It goes through `reportAuthCallFault` with its own throttle key, so an outage cannot hide a misconfiguration or the reverse. This is the one place an outage is reported: `GET /me` and sign-in still report none (decision 3 of 1f-iv). Unlike a fault, a visitor can provoke it (a 429, a slow API), so here the throttle is the bound, not the cause.
3. **The reporter file is `auth-reports.ts`**, and the tag of `reportClientIpUnknown` becomes `auth_route`: `credential_route` matches the key pattern of `redactValue` (`packages/shared-types/src/redaction.ts`), which runs on the whole event, so that report has been arriving with its route masked (L8 of 1f-iv-a).
4. **Decision 6 of 1f-iv (the `Host` check) is withdrawn.** Off Vercel, `readCredentialClientIp` keeps sending 127.0.0.1 and reads no header. Every auth Server Action runs `isSameOrigin` before it reads the form, and a browser whose `Origin` is `WEB_PUBLIC_URL` is on that host, so the check would refuse no browser that guard lets through. A script can send any `Host` to a dev server bound beyond loopback. Only behind a tunnel that routes on `Host` would it stop a script, and what it protects there is the rate-limit bucket of a development database, where sharing 127.0.0.1 gives remote callers one bucket, not more attempts. Cost avoided: a `host_mismatch` reason through three unions, a `headers()` read off Vercel and about 70 lines. Decide again if the web is ever hosted off Vercel (an https `WEB_PUBLIC_URL` there throws today).
5. **The key's loopback rule stays as it is** (`isSecureApiBaseUrl`, `src/api/config.ts`): exact `127.0.0.1` and `[::1]` after URL parsing, checked when the client is built and by `next.config.ts`; a Bearer or a credential body throws without the key, and `redirect: 'error'` keeps a redirect from carrying them elsewhere.

**Rejected.**
- **A separate `reportRevocationUnconfirmed()` at `warning` level.** A third copy of throttle, capture and flush, and one more name to mock in four test files, for a level no alert rule reads yet.
- **Reporting from `signOutAction` only.** The old-session delete inside sign-in would stay silent; `deleteSession` is the one caller of the route.
- **Adding `localhost` or all of 127.0.0.0/8 to the key's loopback set.** It loosens a rule that holds: a name is resolved (hosts file, DNS), and nothing here needs another loopback address.

**Too simple?**
- The throttle is per instance, not global: with N warm instances the worst case is 6 × N events an hour per kind, and a visitor who can provoke 429s or timeouts on sign-out can keep that one issue alive. Accepted; a Sentry inbound filter on the fingerprint if it is ever noisy.
- Still no retry of a failed revocation. This report is how "if it is ever observed" (1f-iv) gets an answer.
- `('me', 'revocation_unconfirmed')` type-checks. Accepted: one caller.

**Too complicated?** Nothing added but one union member and two call sites. The complicated part was the `Host` check, withdrawn above.

**Not verified by running:** nothing new (`signOutAction` from a browser still waits for iv-c). Now tests rather than claims: the reporters' tags and fingerprints come out of `scrubErrorEvent` unchanged (`auth-reports.test.ts`); the loopback rule refuses `127.0.0.1@evil.example`, `[::ffff:127.0.0.1]` and `0.0.0.0` and allows `127.1` and `0x7f.0.0.1`, which the URL parser turns into `127.0.0.1` (`config.test.ts`, run in CI on Node 24). Checked by hand only, on Node 22: `127.0.0.2` refused, `2130706433` loopback.

## Addendum (1f-iv-c)
Added 2026-11-20 (OTA-139 slice 1f-iv-c), written before the code. It replaces decision 7 of [Addendum (1f-iv)](#addendum-1f-iv) and amends its decision 2. ADR 0014's `ShellViewer` (slice 2b, never built) is dropped for `Viewer`. The viewer slot and the sign-out form come to about 500 lines with tests, so this ships as two: **iv-c** the viewer slot (guest, member, unknown) and **iv-c2** the sign-out form (`refused`, "Could not sign out"). Web only: no API change, no new variable, dependency or error code.

| # | Requirement |
|---|---|
| F1 | Refines 1f-iv: on every page a member sees an avatar with their initials and, in the account menu, their username; a guest sees Sign in and Sign up; an unknown viewer sees neither. |
| F2 | As in 1f-iv, from the account menu; a sign-out that did not happen says "Could not sign out" (iv-c2). |
| F7 | A visitor with no session cookie gets the guest links whatever the auth configuration. |
| N1 | As in 1f-iv, made precise: 0 calls without a cookie; with one, exactly 1 `GET /me` (2,000 ms) per document render (hard load, refresh, after an action) and 0 per soft navigation, which does not render the root layout again. |
| N5 | As in 1f-iv: with JavaScript off, 100 % of the guest header links stay reachable. |
| N10 | 0 px of layout shift in the header when the slot fills, in all three states and at every width. |
| N11 | Static shell: 0 request-time reads outside the one `Suspense` (`next build` fails otherwise) and 0 usernames in prerendered HTML. |
| N12 | iv-c adds 0 client components (one optional prop on `Disclosure`); iv-c2 adds one island, estimated under 1 kB gzipped, inside ADR 0014's 30 kB. |

**Consistency vs availability.** Availability, unchanged: the header never waits more than 2,000 ms and never fails a page, and it may show a signed-in state that ended elsewhere until the next document render. **Entities:** `Viewer`; `SignOutFormState` (iv-c2). **API:** none new.

```
SiteHeader (server, synchronous, static)
└─ div.sh-right                             one grid cell, content aligned to the end
   ├─ GuestActionsSizer                     aria-hidden, visibility: hidden, spans: holds the width
   └─ Suspense fallback=<ViewerFallback />  <noscript> guest links
      └─ ViewerActions (async) = <ViewerActionsView viewer={await loadViewer()} />
           signed_out  → GuestActions (Sign in, Sign up)
           unavailable → nothing
           signed_in   → Disclosure "Account menu": summary = initials, panel = username [+ SignOutForm, iv-c2]
```

**Decisions.**
1. **The slot's size comes from a hidden copy, not from a number** (N10). `GuestActionsSizer` renders the guest actions' labels as `span`s with the same button classes, `aria-hidden` and `visibility: hidden`, in the static shell; every state is laid over it in the same grid cell. Both come from one `GUEST_ACTIONS` list, so a renamed label resizes the slot. This and the fallback below are what decision 7 called `ViewerSlot`.
2. **The fallback is the guest links inside `<noscript>`** (N5); `unavailable` renders nothing.
3. **`src/shell/viewer-actions.tsx`** holds a pure `ViewerActionsView({ viewer })` (exhaustive switch, tested for the three states) and a one-line async `ViewerActions`. `SiteHeader` stays synchronous and never receives the viewer as a prop.
4. **`signed_in` is the account menu now**, not a flat username and button: an existing `Disclosure` (new optional `summaryLabel`, the constant "Account menu" and never the username, since Sentry click breadcrumbs record `aria-label`; the panel is end-aligned by CSS under `.sh-right`) whose summary is `viewerInitials(username)` (first two characters, upper case: PARITY) and whose panel starts with the username. A 64 px bar has no place for "Could not sign out"; the open panel does. Profile, My List, Settings, the theme radios, level and XP stay OTA-152 slice 2b.
5. **`loadViewer` answers `signed_out` before `WEB_PUBLIC_URL` is read when the request carries neither session cookie name** (F7; amends decision 2 of 1f-iv). With a caller in the root layout, every environment without the variable (the PR screenshot job, a local `.env` older than it) would otherwise lose Sign in on every page. `hasSessionCookie()` beside `readSessionToken` checks presence only, under `SESSION_COOKIE_NAMES` (`auth-cookies.ts`); the token is still read under the configured name only, and a configuration error is still `unavailable` and reported for a cookie holder.
6. **A preview shows the guest links** (`loadViewer` is `signed_out` there, resolved at build time); they lead to `/auth`, which already says "Sign-in is off on preview deployments". No new copy in the header.
7. **iv-c2.** `signOutAction` keeps no parameter and returns a `SignOutFormState` (`sign-out-state.ts`: `idle` or `refused`); both early returns are `refused`, not told apart (no member UI is ever rendered on a preview). `SignOutForm` (`src/auth/sign-out-form.tsx`, client, `useActionState`) shows the alert in the open panel, hidden while pending. The header sits above every `error.tsx`, so an action that throws or cannot be reached (offline, a deploy that changed the action ids) would replace the page with `global-error`: a small class boundary around the form shows the same alert instead and passes Next's signals on with `unstable_rethrow`. A test fails if any non-test source under `app/`, `src/`, `proxy.ts` or `next.config.ts` holds `no-referrer` (a same-origin POST would then send `Origin: null`); the emailed-token 303 of 1f-vi gets a named exception. *Refined by [Addendum (1f-iv-c2)](#addendum-1f-iv-c2): a third state `failed`, and the boundary mounts the form again instead of replacing it.*

**Rejected.**
- **A measured `min-inline-size` for the slot.** Two pixel values (above and below 768 px) to keep in step with the labels, the button padding and the font swap.
- **The viewer fetched in the browser through a route handler** (ADR 0017). Every page would stay fully static, but the browser client only lands with OTA-142, and every hard load would flash from empty to the answer after hydration instead of streaming with the document.
- **`WEB_PUBLIC_URL` added to the screenshot workflow instead of decision 5.** A protected path, and it fixes one environment out of three.
- **One PR for the slot and the form.** About 500 lines, and the action change deserves its own security review.

**Too simple?**
- Between iv-c and iv-c2 the account menu holds only the username: a member still cannot sign out, as today.
- `/faq` and the legal pages stop being fully static: every document request now runs the function for the hole (no API call for a guest). Assumed fine under 1,000 page views a day on beta; not checked against Vercel's included usage.
- The header shows two initials; the username needs the menu open. A no-JS member still sees the guest links (1f-iv).
- A refused sign-out leaves the member one way out, clearing the site's cookies, and the alert does not say so. Refusals are not reported: a visitor can cause them.
- The `no-referrer` test reads source files only: a header set in the Vercel dashboard is out of its reach.

**Too complicated?** The hidden sizer is the one non-obvious part; it replaces a number that three things can silently change. The boundary of iv-c2 is about 15 lines against a full-page error on the first sign-out after any deploy. Left out: React `cache()` around `loadViewer` (still one caller), a toast, `revalidatePath` in the actions.

**Not verified by running:** that the header changes after sign-in and sign-out without a reload (Next documents that setting a cookie in a Server Action renders the page and its layouts again); `<noscript>` as a grid item with JavaScript off; the sizer's width against the real actions at 390, 768, 1100 and 1280 px; `summary` as an inline grid in Safari; `unstable_rethrow` inside `getDerivedStateFromError` in the browser, on which the boundary of iv-c2 depends (if it does not pass a redirect on, iv-c2 catches in a client wrapper around the action instead).

## Addendum (1f-iv-c2)
Added 2026-11-22 (OTA-139 slice 1f-iv-c2), written before the code. It builds decision 7 of [Addendum (1f-iv-c)](#addendum-1f-iv-c) and refines it in two places, and takes the security review's minors on the iv-c pull request. With the import gate the slice comes to about 400 lines of code and tests, so it ships as two: **iv-c2** (sign-out form, referrer guard, frame headers, the `connection()` comment; about 320 lines) and **iv-c3** (the import gate of decision 7; about 85 lines, lint only). Web only: no API change, no new variable, dependency or error code.

| # | Requirement |
|---|---|
| F2 | As in 1f-iv-c: a member signs out from the account menu on any page, and the header then shows the guest links without a reload. |
| F8 | A sign-out that did not happen (refused, thrown, unreachable) says "Could not sign out" in the open panel and leaves a working Sign out button. |
| F9 | No page of the site renders inside a frame. |
| N2 | Extends 1f-iv: a failed sign-out replaces 0 pages with `global-error`. |
| N3, N7 | As in 1f-iv-b: at most 1 `POST /auth/sign-out`; a refusal makes 0 API calls and 0 cookie writes, and now answers `refused`. At most 1 submit in flight per form. |
| N12 | As in 1f-iv-c: one client island, estimated under 1 kB gzipped. |
| N13 | A sign-out costs 1 POST and 0 further document loads, and the render behind its redirect makes 0 `GET /me`. |
| N14 | 100 % of the responses Next serves carry `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`; 0 non-test sources hold the `no-referrer` literal. |

**Consistency vs availability.** Unchanged: availability for the header, this browser's cookie consistent, the session row best-effort. A sign-out that failed before reaching the action leaves the member signed in and says so. **Entities:** `SignOutFormState` (`idle`, `refused`, `failed`). **API:** none new.

**Data flow.** Submit (ignored while one is pending) → `signOutAction`. `refused` → alert. A throw or no answer → the boundary → the form mounted again in `failed` → alert. Success → the client rejects the action with Next's redirect error, which the boundary passes on; the response already carries the whole tree for `/`, rendered with the cleared cookie → guest links.

**Decisions.**
1. **`signOutAction(): Promise<SignOutFormState>`**, still without a parameter; both early returns answer `{ kind: 'refused' }`. The type lives in `src/auth/sign-out-state.ts` (a `'use server'` file exports its action only). `failed` is never returned by the action: only the boundary sets it.
2. **`SignOutForm`** (`src/auth/sign-out-form.tsx`, client): `useActionState(signOutAction, initialState)`, a `<form action>` with one button and no field. While pending the button is `aria-disabled` and a second submit is cancelled, as in the sign-in form (a `disabled` button would drop focus out of the open menu). The alert is `role="alert"`, shown for `refused` and `failed`, hidden while pending. Class names `sh-menu__form`, `sh-menu__action`, `sh-menu__alert` (`shell.css`).
3. **The boundary is the file's export and renders the form itself** (no `children`): `getDerivedStateFromError` calls `unstable_rethrow`, then sets `failed`; `render` passes `failed` as the form's initial state. React unmounts what a boundary caught, so the form comes back with fresh state: the alert and a button that works, where decision 7 of 1f-iv-c left only the alert until a reload. Nothing is reported from the browser (a visitor can cause it; a throw in the action is already reported by the server). Read in Next 16.4.5, not run: the client rejects a redirecting action with the redirect error "so that it's handled by RedirectBoundary" (`server-action-reducer.js`), and Next's own `ErrorBoundary` rethrows router errors from `getDerivedStateFromError` the same way.
4. **No `revalidatePath` and no `refresh()`.** Read in Next 16.4.5: `cookies().set` in an action marks the path revalidated (`request-cookies.js`), and the redirect's payload is fetched with the response's cookies merged over the request's and without `Next-Router-State-Tree` (`action-handler.js`), so the root layout is in it. The cleared cookie arrives with an empty value: present, malformed, so `signed_out` with no call (N13). The viewer is never cached. If a browser shows a stale header all the same, `refresh()` before the redirect is the fix.
5. **Referrer guard** (`src/auth/referrer-policy.test.ts`): no non-test `.ts` or `.tsx` under `app/` or `src/`, nor `proxy.ts`, nor `next.config.ts`, holds `no-referrer` in any letter case, comments included (sources say "the referrer guard"). The header holds a form on every page, so the guard is site-wide and `/auth` needs no rule of its own. It also asserts that it scanned `app/auth/page.tsx` and `src/shell/viewer-actions.tsx`, and that `rel="noopener noreferrer"` does not match.
6. **Frame headers.** `FRAME_DENY_RULE` (`src/auth/frame-headers.ts`: source `/:path*`, the two headers of N14) is appended to the robots rules in `next.config.ts`. The policy holds `frame-ancestors` only, so it restricts nothing else; a full Content-Security-Policy is its own ticket.
7. **iv-c3, import gate.** `no-restricted-imports` patterns with `importNames`: `hasSessionCookie` only in `load-viewer.ts`, `SESSION_COOKIE_NAMES` only in `session-call.ts`. One shared constant added to the three blocks that set the rule, two one-file blocks for the exceptions, rows in `network-lint-rule.test.ts`. Not covered: a dynamic `import()` followed by a property read.
8. **`load-viewer.ts` says why `connection()` comes first**: `cookies()` would leave a prerender too, but `connection()` is the line that keeps everything below it out of the build. Without it, a refactor that reads `WEB_PUBLIC_URL` before the cookie would throw at build time, be caught, and prerender `unavailable` for every visitor.

**Rejected.**
- **Catching in a client wrapper around the action** (the fallback of 1f-iv-c). About 15 lines less and no class, but it only catches the awaited call; the boundary also holds for a cause nobody listed, in a header that sits above every `error.tsx`. Still the way out if a browser shows the redirect not passing the boundary.
- **The gate as `no-restricted-syntax` selectors.** Aliased, namespace and re-export forms would each need a selector; `importNames` covers them.
- **One PR with the import gate.** Over the limit, and the gate shares no file with the form.

**Too simple?**
- The alert does not say what to do next, and after a refusal the only way out is still to clear the site's cookies.
- A submit before hydration is a full-page POST: after a refusal the document comes back with the menu closed, so the alert is unseen until the menu is opened.
- The alert stays through soft navigations until the next submit or a reload. Another tab, or the back button, can show the account menu after a sign-out; its Sign out still clears the cookie and goes home.
- A cookie a visitor sets under a session name with a well-formed value costs 1 `GET /me` (401) per document render, like a stale cookie (1f-iv); the planned general throttle covers it.
- Responses the platform serves before Next (a Vercel error page) carry no frame header.

**Too complicated?** The remount in `failed` is the one non-obvious part: three lines for a retry without a reload. `X-Frame-Options` repeats `frame-ancestors` for browsers that no longer need it: one line, asked for by the review. Left out: a toast, a report from the browser, a reset of the alert when the menu closes.

**Not verified by running:** sign-out in a browser (the header after it, the redirect passing the boundary, the alert after a refusal), with the API up and stopped; `Cache-Control` on `/faq` now that the layout has a request-time hole (review minor); that no tool we use frames the site (the screenshot job loads pages directly).

## Consequences
- **We own the security of this code.** Accepted because the surface is small (no MFA, no email change, no JWT, no cookie cache) and every property above is an integration test. OTA-139 goes through `secure-builder` and `security-reviewer`.
- Each signed-in page costs one extra API call (`GET /me`), and viewer-dependent UI must sit outside the static shell (ADR 0014). `apiClient()` calls that carry a session are always `no-store`, which closes the open point of ADR 0003.
- `Viewer` is `signed_out`, `signed_in { username }` or `unavailable`. For `unavailable` (API or database down) the header shows an empty slot the size of the guest actions: no "Sign in", no account menu. A Server Component cannot delete a cookie, so a 401 renders `signed_out` and the next Server Action, route handler or `proxy.ts` pass deletes the stale cookie; nothing else ever clears it.
- Email is a single point for sign-up: over the budget, or when Brevo is down, new members wait and use "Resend". Brevo Starter ($9/month) or a Resend adapter is the way out.
- Old Supabase members (OTA-149): the PHC format is self-describing, so bcrypt hashes could be imported (that needs a bcrypt dependency), or members get a "set your password" email, within the daily budget.
- Not verified by running, to check in OTA-139 and the email ticket: argon2 time on Railway's CPU, Railway's Node version, whether Brevo's free plan adds a footer to API emails, and that tracking can be turned off.

**Too simple?** Known gaps, accepted for v1: no CAPTCHA (a botnet can spend the sign-up email budget; the reset reserve and the alert limit the damage; add Turnstile if it happens), no email outbox or retry, no breached-password API, no list of active sessions; after a raise of the argon2 parameters, accounts not yet rehashed verify faster than the dummy verification until their next sign-in. **Too complicated?** Three parts look optional and are not: the internal key (without it every request comes from Vercel's IPs and per-IP limits mean nothing), the Postgres counters, the binding (a known takeover otherwise). Left out on purpose: Redis, JWT plus refresh tokens, Passport, a queue.

## Learnings
(Filled in after OTA-139 and OTA-140.) So far: the ticket asked how to share a cookie across subdomains; reading ADR 0003 first showed the simpler answer is not to share one.

## Follow-up tickets
- **OTA-139:** first criterion = runtime proof; hard verification; routes, cookies, limits and tests from this ADR; `engines.node >=24.7`; `Random.bytes(n)`. It also writes the **ADR 0003 addendum**: typed `session` and `clientIp` options on `apiClient()` (the client adds the key itself; no free-form headers), `retryAfterSeconds` on the rate-limited failure, and the new error codes `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `AUTH_TOKEN_INVALID`, `TOO_MANY_REQUESTS`, `USERNAME_TAKEN`.
- **OTA-140:** reset flow as above; avatar storage and Settings are not decided here and should be split out.
- **OTA-178, Farouk:** Brevo account (2FA, tracking off), domain DNS (DKIM, DMARC), env vars on Railway and Vercel, the Vercel checklist.
- **OTA-179:** Build: Google sign-in (plus Farouk's Google Cloud OAuth client).
- **OTA-149, OTA-147, OTA-152:** cutover steps above; privacy page (Brevo as processor, the session cookie, keyed hashes of IPs and identifiers kept under about 48 h: the longest window plus the daily cleanup, and never in the nightly backups; never-verified accounts and expired sessions do stay in those encrypted backups for their 60 days); `Viewer` in the header.

## Sources (checked 2026-11-12)
- npm registry (`registry.npmjs.org`): `better-auth`, `@thallesp/nestjs-better-auth`, `passport`, `passport-local`, `passport-google-oauth20`, `@nestjs/passport`, `lucia`: versions, dates, licences, peers.
- Better Auth: [security release 2026-11-03](https://better-auth.com/blog/security-release-2026-11-03), [NestJS](https://better-auth.com/docs/integrations/nestjs), [Prisma](https://better-auth.com/docs/adapters/prisma), [email and password](https://better-auth.com/docs/authentication/email-password), [security](https://better-auth.com/docs/reference/security).
- Hosted: [Clerk pricing](https://clerk.com/pricing), [Supabase pricing](https://supabase.com/pricing).
- Email: [Brevo transactional](https://www.brevo.com/products/transactional-email/), [Brevo data location](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location), [Resend pricing](https://resend.com/pricing), [Resend regions](https://resend.com/docs/dashboard/domains/regions), [Scaleway TEM plans](https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans).
- Platform: [Node 24 `crypto.argon2`](https://github.com/nodejs/node/blob/v24.x/doc/api/crypto.md), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Next.js data security](https://nextjs.org/docs/app/guides/data-security) (Server Action origin check, updated 2026-10-06), [Vercel request headers](https://vercel.com/docs/headers/request-headers) (`x-forwarded-for` is overwritten), [Railway specs](https://docs.railway.com/networking/public-networking/specs-and-limits) (`X-Real-IP`).
