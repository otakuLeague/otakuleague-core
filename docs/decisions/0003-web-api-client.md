# 0003: Web API client
Status: accepted (2026-10-14, OTA-76). Superseded in part by ADR 0017 (proposed 2026-11-13, accepted when its slice 2 merges with OTA-142): the browser may call same-origin route handlers; `client.ts` keeps the isomorphic `createApiClient` and `apiClient()` moves to a `server-only` file.

## Context
Every page of the web app will call the API. Without one client, each page invents its own timeouts, error handling and caching. The API answers errors with the envelope from ADR 0002, except `GET /health`, whose 503 carries a `HealthResponse`. No runtime schema library is shared between API and clients (ADR 0002), so TypeScript types alone say nothing about what actually arrives. Pages are Next.js Server Components; the layout, error pages and caching flags are OTA-86.

## Options
| Topic | Chosen | Rejected | Cost of the choice |
|---|---|---|---|
| Where calls run | Server-side only (Server Components, route handlers), base URL from server-only `API_BASE_URL` | Browser calls with `NEXT_PUBLIC_API_BASE_URL` | No client-side fetching yet. A browser call needs its own decision (CORS, a public URL, auth cookies). |
| Failure handling | Return `ApiResult<T>`, a discriminated union | Throw typed errors | Every caller must branch on `ok`; in return the compiler forces it to handle failures. |
| Response checking | Hand-written guards `isApiError` and `isHealthResponse` in `shared-types`; other success bodies trusted by type unless the caller passes a guard | A schema library (zod) shared by API and clients | Success payloads of future endpoints are unchecked by default (see Consequences). |
| Loading the root `.env` | Copy only the web app's variables (`util.parseEnv`) in `next.config.ts`, inside the repo only | `@next/env` `loadEnvConfig`; `process.loadEnvFile` | See below: the documented call is a no-op inside `next.config.ts`. |

## Decision
**Types** (in `apps/web/src/api/client.ts`, not `shared-types`: they describe this client, not the API contract).

```ts
type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };
type ApiFailure =
  | { kind: 'api_error'; status: number; error: ApiError } // a valid envelope
  | { kind: 'network' }                                   // refused, DNS, reset, redirect
  | { kind: 'timeout' }
  | { kind: 'invalid_response'; status: number };         // HTML from a proxy, wrong JSON shape
```

Expected failures are returned, never thrown. A throw means a programming or configuration error: a missing or invalid base URL, an unsafe path, a timeout that is not a positive integer, or a body `JSON.stringify` rejects. These are checked before the request, outside the `catch`, so they cannot pass for `network`. Inside the `catch`, `unstable_rethrow` (next/navigation) lets Next's own control-flow errors through first.

A failure never holds the raw body or the underlying error. A valid envelope or health body is rebuilt from its contract fields (`code`, `message`, `details[].field/message`; `status`, `checks.database`), so extra keys a server or proxy adds, such as `stack` or `debug`, never reach a page or a log.

**One module touches the network.** `createApiClient({ baseUrl, fetch?, defaultTimeoutMs? })` returns `call<T>(path, options)` (a `getHealth()` helper existed until OTA-136, when the home page stopped showing the health); it validates `baseUrl` with the same rules as `API_BASE_URL`. `apiClient()` builds the app-wide instance on first use from `process.env`. ESLint's built-in rules enforce this in `apps/web` outside `src/api/client.ts`, and a Vitest test runs the real config to prove it:
- `no-restricted-globals`: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`.
- `no-restricted-properties`: `.fetch` on `globalThis`, `window`, `self`, `global`.
- `no-restricted-imports`: `http`, `https` (with or without `node:`), `undici`; and `createApiClient` outside `src/api`, so a page cannot build a client on a host of its choosing (pages use `apiClient()`).

This is a guardrail, not a security boundary: `Reflect.get(globalThis, 'fetch')`, aliasing `globalThis`, or a disable comment get past it. Code review covers those.

**Health.** The two pairs from ADR 0002 are `ok: true`: 200 with `ok`/`up`, and 503 with `error`/`down`. The API answered, and the data says whether the database is up. Any other combination, such as a 503 carrying `ok` or a body that contradicts itself, is `invalid_response`, except a non-200 envelope, which gives `api_error`.

**Timeouts.** Every call uses `AbortSignal.timeout`, default 5 s, overridable per client and per call (a positive integer, or the call throws). It also covers reading the body, so a stalled body times out too. The timeout is told apart from other errors by the `TimeoutError` name.

**No retries yet.** When a real need appears, retry only idempotent GETs, with exponential backoff and jitter and a small bound, inside this module.

**Caching.** Each call accepts Next's `cache` and `next` (`revalidate`, `tags`). The default is `cache: 'no-store'`, dropped when `next.revalidate` is set so Next does not see two conflicting instructions. The real caching policy is OTA-86.

**Bodies.** An empty body is valid only on 204 and 205; on any other 2xx it is `invalid_response`, so a page never receives `undefined` typed as `T`.

**Other request details.** `redirect: 'error'`: the API never redirects, and following one could send the request to a host that is not configured.
- **Host.** The full URL is `${baseUrl}${path}`, built by concatenation onto a validated origin. The leading `/` that `path` must have (type `` `/${string}` `` plus a runtime check) is what keeps `@host` or `.host` from joining the authority. A `//host` path stays on our host with concatenation; it would switch hosts only with `new URL(path, base)`, so keep concatenation.
- **Dot segments.** `encodeURIComponent('..')` is `..`, and WHATWG URLs treat `%2e%2e` and `\` like `..` and `/`. A path with a `.` or `..` segment (before the query), or with a tab, LF or CR (which URL parsing strips before resolving dots), throws, so a route param such as `/anime/..` cannot reach another endpoint or climb out of a base path prefix. Callers still encode dynamic segments with `encodeURIComponent`, and validate route params before calling, since a throw renders an error page rather than a 404.

**Configuration.** `readApiBaseUrl` requires an absolute `http:` or `https:` URL with no credentials, query or fragment, trims trailing slashes (a path prefix such as `/api` is allowed) and throws one message that names the variable, the rule and an example, never the value. It runs on the first API call, not at boot.

**Root `.env`.** Next only reads `.env*` files from `apps/web`. The Next docs suggest `loadEnvConfig` from `@next/env` for loading env "outside of the Next.js runtime". Inside `next.config.ts` it did nothing: Next has already called it for `apps/web`, it returns its module-level cache unless `forceReload` is passed, and it marks `process.env.__NEXT_PROCESSED_ENV`. Checked: the route returned "API_BASE_URL is missing". `forceReload` skips the cache (not tried), but the source shows it first resets `process.env` to its initial snapshot, which would silently drop any `apps/web/.env*` file. Instead, `next.config.ts` parses the root file with `util.parseEnv` (Node built-in) and copies only the variables in `WEB_ENV_VARIABLES` (today `API_BASE_URL`) that are not already set, so real environment variables and `apps/web` files win. Copying a list rather than the whole file (`process.loadEnvFile`, the first version) keeps `DATABASE_URL` and `POSTGRES_PASSWORD` out of the web process. As in ADR 0002 (security review M2), the file is read only when `pnpm-workspace.yaml` sits next to it.

## Consequences
- **Success bodies are trusted by type.** `call<T>` without `isExpectedBody` casts the parsed JSON to `T`. If the API changes a payload, a page can crash at render rather than get `invalid_response`. Mitigation: pass a guard for anything a page depends on structurally; revisit a shared schema library if hand-written guards multiply.
- **Unknown error codes become `invalid_response`.** `isApiError` accepts only the codes in `API_ERROR_CODES`. An API deployed with a new code before the web app sees `invalid_response` with the right status but no message. Deploy the web app with any new code, or relax the guard if deploys diverge.
- **The base URL is checked at first use, not at boot.** A misconfigured deploy fails on the first page that calls the API, with the configuration message in the server log. Failing at start (for example in `instrumentation.ts`) interacts with prerendering and is left to OTA-86.
- **No body size limit.** The client reads the whole body before parsing. The API is ours and behind our config; add a limit if the client ever calls a third party.
- **A new web variable must be added to `WEB_ENV_VARIABLES`** in `next.config.ts`, or it is only read from real env vars and `apps/web/.env*`.
- **Root `.env` changes need a dev restart**: Next does not watch it. And if an `apps/web/.env*` file changes in dev, Next re-runs `loadEnvConfig` with `forceReload`, which resets `process.env` to its first snapshot and drops `API_BASE_URL` until restart (read in `@next/env`, not run). Don't add `apps/web/.env*` files.
- **A Docker image that copies the repo with its `.env`** would pass the `pnpm-workspace.yaml` guard and fill a forgotten `API_BASE_URL` with the dev value. Add a `.dockerignore` excluding `.env*` with the first Dockerfile.
- **Plain `http:` is accepted for any host.** Requiring `https:` in production, except for loopback or private hosts, belongs with the deploy ticket.
- **Caching and auth.** Callers may pass `cache: 'force-cache'` or `next.revalidate`. Once requests carry per-user credentials, those calls must be forced to `no-store` (or the option types made exclusive), so one user's response is never cached for another. Decide in OTA-86 or the auth ticket.
- **No `server-only` marker.** `API_BASE_URL` is not `NEXT_PUBLIC_`, so a client import of the module fails closed (missing variable). The `server-only` package would turn that into a build error, but needs a Vitest alias; add it with the first Client Component that might import the client.
- **Health status stays split.** `ok: true` with `status: 'error'` means "API up, database down"; callers must read `data.status`, not only `ok`.

## Learnings
- The `@next/env` snippet in the Next docs is for tools outside Next (ORM configs, test runners). Inside `next.config.ts` it is a cached no-op; test env loading end to end, not by reading the docs.
- `isApiError` checks a shape but keeps every extra key; a guard is not a sanitizer. Rebuild values that cross a trust boundary.
- Linting in-memory code with type-aware rules needs a path that exists in the TypeScript project, or ESLint reports a parsing error with no rule id. A test that only asserts "no rule fired" would pass for the wrong reason, so the lint test also asserts there is no fatal message.

## Sources checked 2026-10-14
- `apps/web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` (Next 16.4.0): `@next/env` section and load order.
- `@next/env` 16.4.0 `dist/index.js`: `loadEnvConfig` cache and `__NEXT_PROCESSED_ENV`.
- `apps/web/node_modules/next/types/global.d.ts`: `NextFetchRequestConfig` on `RequestInit`.
- `next/dist/docs/01-app/02-guides/data-security.md`: `server-only`.
- `next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`.

## Addendum: home page, error pages and caching flags (2026-10-14, OTA-86)

**Home health is its own union.** `ApiResult<HealthResponse>` has `ok: true` for both "all up" and "database down" (see Consequences above), which a page can misread. The home page maps it once, in `toHomeHealth` (`apps/web/app/health-status.tsx`), to `healthy | degraded | unknown`, where `unknown` carries the `ApiFailure` (network, timeout, invalid response, or an envelope). `HealthStatusView` renders it with an exhaustive `switch` and `assertNever`, so a new state is a compile error. This is an exception, not a new rule: the client and every other call keep returning `ApiResult`. An `api_error` message is never shown; it can be internal. A configuration error (missing or invalid `API_BASE_URL`) still throws, as the client is designed to, so it is not `unknown`: the whole home page falls back to `error.tsx`. Accepted until boot validation lands (see Still open).

*Update (OTA-136):* the health status and `getHealth()` are gone from the web app; the home catalog rows use the same pattern (`HomeRowState` in `apps/web/src/home/home-rows.ts`, `assertNever` in `apps/web/app/home-row.tsx`).

**Caching flags: keep `cacheComponents` and `partialPrefetching`.** Tested with the home page on a production build (`next build && next start`):

| | Flags on | Flags off |
|---|---|---|
| Route type | `◐` Partial Prerender: the shell (heading, "Checking the API…") is prerendered; the status streams per request | `ƒ` Dynamic: the whole page renders per request |
| API hanging (timeout path), TTFB / total | 0.011 s / 5.05 s | 0.039 s / 5.02 s |
| Uncached fetch outside `<Suspense>` | Build fails ("uncached or runtime data during prerendering") | Builds; the whole page waits up to the 5 s timeout before its first byte |

The status was never cached: `getHealth` used `cache: 'no-store'` and ran in `HealthStatus` inside `<Suspense>`, so the prerendered HTML only held the fallback (checked in `.next/server/app/index.html`). Since OTA-136 the proof is the home catalog rows: each `HomeRow` streams uncached behind its own `<Suspense>`, and the prerendered `index.html` holds the hero and the three skeletons. Stopping the database with the web server still running turned the next request into "degraded" with no restart. Reason for keeping the flags: with Suspense both modes stream, so speed alone does not decide it; but with the flags on, caching is opt-in (`"use cache"`) and an uncached read that would block the page fails the build. Both flags become the default in the next Next.js major (`next/dist/docs/.../cacheComponents.md`), so turning them off now means migrating back later. Cost: every uncached read needs a Suspense boundary or an explicit `"use cache"` decision. Not added: a "checked at" timestamp; it only matters if the status is ever cached.

**Error pages.** `error.tsx`, `global-error.tsx` and `not-found.tsx` show fixed text and a way out ("Try again" calls Next's `retry`, a link home). They never render `error.message`, `error.stack` or `error.digest`: in development Next forwards the original message, and a Client Component error keeps it in production too. `global-error.tsx` replaces the root layout, so it renders its own `<html lang>`, `<body>`, `<title>` and imports `globals.css`. "Try again" is a visitor's choice; the client still never retries on its own.

**Still open.** Failing at boot on a bad `API_BASE_URL` (`instrumentation.ts`) and the caching rule for authenticated calls stay with the deploy and auth tickets.

## Addendum: Sentry tunnel, a second file allowed to call fetch (2026-10-14, OTA-87)

**Problem.** Browser errors sent straight to `*.ingest.sentry.io` are dropped by ad and tracker blockers (`net::ERR_BLOCKED_BY_CLIENT` in Opera GX during OTA-79). The SDK's `tunnel` option sends them to a route on our own origin instead, and that route must forward them to Sentry from the web server.

**Options.**

| Option | Why not / cost |
|---|---|
| `withSentryConfig({ tunnelRoute })` (built in) | A Next rewrite to `o<org>.ingest[.<region>].sentry.io/api/<project>/envelope/` taking the org and project from the query string (`@sentry/nextjs` 11.7.0, `config/withSentryConfig/tunnel.js`). Any org and project on sentry.io can be reached through our domain, with no size limit and no check of the envelope: an open relay to Sentry. |
| Forward through `src/api/client.ts` | That client is for our API: base URL from `API_BASE_URL`, `ApiPath` paths, JSON bodies read into `ApiResult`. The tunnel posts raw envelope bytes to another host and passes Sentry's status and rate-limit headers back. Bending the client to do that turns it into a generic HTTP helper, a bigger hole in the rule than one named exception. |
| Re-send through the server SDK's transport | No `fetch` in our code, but the envelope is parsed and re-serialized, it depends on the server `Sentry.init` having run, and the browser never sees Sentry's status or rate limits. |
| **Chosen: a route handler, with `fetch` allowed in one more file** | `app/hikari/route.ts` (one line) calls `forwardSentryEnvelope` in `src/observability/sentry-tunnel.ts`, the only file besides `client.ts` where ESLint allows the `fetch` global. Everything else stays banned there too (`XMLHttpRequest`, `WebSocket`, `EventSource`, `globalThis.fetch`, `http`/`https`/`undici` imports). |

**Rules of the tunnel.**
- Path `/hikari` (`SENTRY_TUNNEL_PATH`): filter lists match words like `sentry`, `monitoring`, `tunnel` or `envelope`, not this one. Unverified against every list; if it gets listed, change the constant and the folder name.
- No DSN configured, or the configured DSN is invalid: 404. Only POST is exported, so Next answers 405 to anything else.
- Body capped at 1 MiB (`MAX_ENVELOPE_BYTES`), checked on `Content-Length` and again while reading, since a streamed body has none: 413.
- The envelope header (first line, JSON) must hold a `dsn` with a public key and a numeric project id: 400 otherwise. Its host (with port) and project id must equal `NEXT_PUBLIC_SENTRY_DSN`'s: 403 otherwise. The target URL is built from the configured DSN only, never from the request, so the route cannot be pointed anywhere else.
- At most 20 requests handled at once per server process (`MAX_IN_FLIGHT`): 503 above, so memory stays around 20 MiB and outbound calls are bounded. A body not fully received within 10 s (`READ_TIMEOUT_MS`): 408, so a slow client cannot hold a slot.
- Forwarded unchanged, without the visitor's IP or headers. Redirects from Sentry are not followed (`redirect: 'error'`, 502): the configured DSN alone decides where an envelope goes. Sentry's response body is cancelled so the connection goes back to the pool. Sentry's status, `Retry-After` and `X-Sentry-Rate-Limits` go back to the browser SDK so it backs off.
- Sentry slow or down: the forward is aborted after 5 s (504), or fails at once (502). The handler never throws, so a Sentry outage never shows up as a route error, and the browser SDK sends in the background, so a page never waits on it.

**Scrubbing (ADR 0004) still applies**, because it runs in the browser before sending: `beforeSend` and `beforeBreadcrumb` are part of `BROWSER_SENTRY_OPTIONS` in `src/observability/sentry.ts`. `sentry-browser.test.ts` initialises the browser build of the SDK with those exact options and asserts the envelope goes to `/hikari` with no email, password, bearer token, console text or user id in it. The tunnel does not scrub again: it only moves bytes it has already checked the destination of.

**Consequences.**
- Anyone can post envelopes for our project through `/hikari`, as they already could to Sentry with the public DSN. The tunnel adds our bandwidth (1 MiB per request at most) and a server hop, not a new capability. The Sentry rate limit per key and spike protection (ADR 0004) remain the quota guard.
- The `Origin` header is not checked, so another site could make its visitors' browsers post envelopes for our project. Not added: behind a reverse proxy the origin Next sees can differ from the browser's, and a wrong check would silently drop every browser event. Decide with the deploy ticket, once the proxy and its trusted headers are known.
- Sentry's Allowed Domains setting (ADR 0004) checks the `Origin` / `Referer` of the request it receives. Through the tunnel that request comes from our server and carries neither. How Sentry treats that is unverified: check that events still arrive once Allowed Domains is set.

## Addendum: internal key and client IP (2026-11-13, OTA-182 slice 2, ADR 0019)

- `apiClient()` reads `INTERNAL_API_KEY` (server-only; empty means unset, otherwise 43 to 128 characters of `[A-Za-z0-9_-]`) and sends it as `X-Internal-Api-Key` on every call. With a key, `next.config.ts` fails the build and `createApiClient` throws unless the key is valid and the base URL is https or exactly `127.0.0.1` or `[::1]` (not `localhost`, which is resolved by name), so the key never crosses a network in clear and a bad value stops a deploy, not requests. Errors name the variable, never the value or the URL.
- `CallOptions.clientIp` is a branded `ClientIp` that only `clientIpFromHeaders()` makes (Vercel's `x-forwarded-for`, one address). `readClientIp()` gives one only when `VERCEL=1`: only Vercel overwrites that header, and elsewhere the API counts the shared `unknown` visitor (a CDN in front of Vercel needs its own decision). It is sent as `X-Client-Ip` only next to the key, and only calls that can make the API call AniList for the visitor pass it (imports, list pages; ADR 0019 OTA-195 addendum), never inside `'use cache'`: reading `headers()` anywhere else would add request-time data to pages and the proxy for nothing. On a cached call it throws, so a per-visitor header can never split Next's data cache.
- Unchanged: the browser still never calls the API; when it does (ADR 0017), these options stay on the server-only client. Still open (slice 2b): a 403 `INTERNAL_KEY_REQUIRED` reported to Sentry and shown as "service unavailable".

## Addendum: session, key-required calls and Retry-After (2026-11-20, OTA-139 slice 1f-i, ADR 0015)

The addendum ADR 0015 assigned to OTA-139. It closes "Caching and auth" (Consequences) and the caching rule left in "Still open". No new ADR: every choice applies ADR 0015; this records the client's contract. The error codes ADR 0015 listed are already in `API_ERROR_CODES`.

**Requirements.** The web server can (1) call the API as the member whose session cookie it holds; (2) send a credential (password, emailed token) only as the trusted `web` caller; (3) tell a visitor how long a rate limit lasts.

| # | Requirement |
|---|---|
| S1 | 0 answers to a call with `session` in Next's data cache: `session` with `next.revalidate` or a `cache` other than `no-store` throws. |
| S2 | 0 Bearer tokens and 0 credential bodies leave without the internal key, so 0 cross plain HTTP off loopback (the key already refuses such a base URL). |
| S3 | 0 secrets in what the client returns or throws: no token, key or header value in an `ApiFailure` or an error message. |
| S4 | `retryAfterSeconds` is a whole number from 1 to 86,400, or absent: an HTTP date, 0, a sign, a decimal, text or a larger number all give absent. |
| S5 | 0 edits to existing callers and tests of `call()`; no dependency; `fetch` stays in `client.ts` only. |

**Consistency vs availability:** consistency, as ADR 0015: an answer given to one session is never reused, and a configuration that cannot carry a secret safely stops the call instead of degrading.

**Entities:** `SessionToken`, `WebPublicUrl`, `SessionCookie` (lands in slice 1f-ii with `auth-cookies.ts`).

**Contract** (TypeScript; the HTTP routes are ADR 0015's and do not change).

```ts
// src/api/session-token.ts: the only maker of the brand, like ClientIp
type SessionToken = string & { readonly [sessionTokenBrand]: true };
function sessionTokenFrom(value: string | undefined): SessionToken | undefined; // 43 base64url characters, else undefined

// src/api/client.ts
interface CallOptions<T> {
  readonly session?: SessionToken;      // sent as `Authorization: Bearer`; implies requiresInternalKey
  readonly requiresInternalKey?: true;  // a K route of ADR 0015
}
type ApiFailure =
  | { kind: 'api_error'; status: number; error: ApiError; retryAfterSeconds?: number }
  | … // network, timeout, invalid_response: unchanged
```

**Data flow.** Cookie value → `sessionTokenFrom()` → `call(path, { session })` → checks (uncached, key present) → `Authorization: Bearer` next to `X-Internal-Api-Key`, `no-store` → API. On a 429 envelope the client reads `Retry-After` into `retryAfterSeconds`.

**Design, simplest first.** Three checks before the request, outside the `catch`, like the existing ones (a throw is a configuration or programming error, never `network`):
1. `session` or `clientIp` on a cached call throws (`assertClientIpUncached` becomes one check for both per-visitor options).
2. `session` or `requiresInternalKey` on a client built without a key throws one message naming `INTERNAL_API_KEY`. This is ADR 0015's "a missing key throws on the first auth call", and it is what gives S2 with no second URL check: a key exists only with an https or loopback base URL.
3. No `headers` option, now or later: every header the client sends is one of five it writes itself.

**Deep dives.**
- **S1.** Throw, not a silent `no-store`: a caller that asked for `revalidate` believes its page is cached, and the mistake should fail its first test. The check sees only the fetch options, not a `'use cache'` scope: a session call is never made inside `'use cache'`. `cookies()` cannot be read there, but a token passed in as an argument would become part of the cache key, so the rule is what holds, not the runtime. `requiresInternalKey` is refused on a cached call too (security review M1): a credential call is never replayed.
- **S2.** Without the key the Bearer is not dropped (see Rejected) and not sent (the API would answer 403 to an open caller, after the token crossed for nothing). Locally this means accounts need `INTERNAL_API_KEY` in the root `.env` and the default `API_BASE_URL=http://127.0.0.1:3001`; the API already needs the key for `GET /me`. A visitor without a cookie never makes a session call, so public pages are unaffected.
- **S3.** The failure for a session call is built by the same code as today, from status and contract fields only; a test sends a token and a key and searches every failure and thrown message for both.
- **S4.** Only on a 429 that carries a valid envelope, matched by `/^[1-9][0-9]{0,4}$/` then capped at 86,400 (the longest window any API rule uses is 24 h). The API only sends whole seconds (`api-exception.filter.ts`); a date would be a proxy's, and a countdown must not trust it. Optional on the existing variant so no caller or fixture changes (S5); pages read it for the countdown and never retry by themselves (ADR 0020).

**Rejected.**
- **A free-form `headers` option.** One line of client code, but any caller could then send `X-Client-Ip` from a browser-supplied value or the key to a path of its choosing; typed options keep each header's rule next to the header.
- **Dropping the Bearer when no key is configured** (what `clientIp` does). The API would answer 401, the page would render signed out, and the next Server Action would delete a valid cookie (ADR 0015): a missing variable on Vercel would sign every member out. A throw is loud and destroys nothing.
- **A new `rate_limited` failure kind.** Every existing 429 branch (`busy` on `/season`, the import limits) reads `api_error` and its code; a new kind changes them all for one number.

**Too simple?** `requiresInternalKey` is opt-in, so a credential call that forgets it would post a password with whatever configuration exists: slice 1f-ii gives the auth actions one wrapper that always sets it and takes a non-optional `ClientIp`, and no action calls `apiClient()` directly. A `Retry-After` on a 503 is ignored (no page needs it). **Too complicated?** No: two options, one optional field, about 45 lines. Left out on purpose: retries, a `signal` option and the `server-only` split (ADR 0017 slice 2 moves `session`, `clientIp` and the key to that file).

**1f-ii (2026-11-20):** `credentialCall` (`src/auth/credential-call.ts`) reads the client IP itself (`readCredentialClientIp`) instead of taking a `ClientIp`, so no caller can pass a wrong one; off Vercel it sends 127.0.0.1 only for a loopback (http) `WEB_PUBLIC_URL` and throws a configuration error otherwise; on Vercel a missing or malformed `x-forwarded-for`, or a Server Action hop re-sent by Next (`x-action-forwarded`), is refused as `client_ip_unknown`.

**1f-iii-c (2026-11-20):** a literal dynamic `import()` of the client (a specifier ending in `api/client`; inside `src/api`, `import('./client')` stays allowed) or of a network module above is now a lint error too, and `import()` must take a string literal; ADR 0015 Addendum (1f-iii-c) lists what lint still cannot see.

**Configuration.** `WEB_PUBLIC_URL` (ADR 0015) joins `WEB_ENV_VARIABLES`: the web's own origin, https, or http only for `localhost`, `127.0.0.1` and `[::1]`. Read on first use by `readWebPublicUrl()` (`src/auth/web-public-url.ts`), never at build, so a deploy without it still serves public pages. It names the session cookie (`__Host-ol_session` with `Secure` on https, `ol_session` on http) and later checks `next` and `Origin`.
