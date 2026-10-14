# 0004: Error tracking and structured logging
Status: accepted (2026-10-14, OTA-79)

## Context
The charter asks for structured logs and error tracking from the start. Today the API prints Nest's colored text logs, the 500 handler logs a message with no way to tie it to a request, and the web app reports nothing (`error.tsx` says client errors "are not reported yet"). Constraints: Sentry free tier (limited monthly event quota), no DSN must mean "off" with no noise, Sentry being down or slow must never affect a request, and no secret or personal data may reach a log line or Sentry. ADR 0003 allows only `src/api/client.ts` to touch the network in the web app.

## Options
| Topic | Chosen | Rejected | Cost of the choice |
|---|---|---|---|
| API JSON logs | Nest's own `ConsoleLogger` (`json: true`), subclassed to add `requestId` and redact | `nestjs-pino` + `pino` + `pino-http` | Three fewer dependencies. Nest's logger is synchronous `process.stdout.write`; pino is faster under heavy log volume. Revisit if logging shows up in a profile. |
| Request id | `AsyncLocalStorage` (Node built-in), set by an Express middleware registered before the body parser | Request-scoped Nest providers; `cls` libraries | One module-level store. Request-scoped providers would make every injected service per-request. |
| Incoming `X-Request-Id` | Ignored: the API always generates a UUID and returns it in `X-Request-Id` | Trust the header | No cross-service correlation yet. Accept a validated incoming id when the web server starts sending one. |
| API Sentry SDK | `@sentry/nestjs`, initialised in `main.ts` after config validation, errors captured by our own filter | `instrument.ts` imported first with `SentryGlobalFilter` | Without the early import, Sentry cannot isolate scopes per request, so breadcrumbs are off in the API (they could mix two users' requests) and the request id is passed explicitly to each capture. In return, one place reads env vars (ConfigModule), and the SDK only sees what the filter hands it. |
| Web Sentry SDK | `@sentry/nextjs` with `withSentryConfig`, `instrumentation.ts` (server), `instrumentation-client.ts` (browser) | Server only | The browser bundle grows by the Sentry browser SDK (no Replay, no tracing). Without it, client-side errors stay invisible. |
| Scrubbing | Our own `redactText` / `redactValue` / `scrubErrorEvent` / `scrubBreadcrumb` and one `PRIVATE_DATA_COLLECTION` in `shared-types`, used by both apps | Rely on SDK defaults | SDK v11 collects cookies, headers, bodies, IP, query strings, source lines and stack-frame local variables by default. Defaults change between majors; an explicit allowlist does not. |

## Decision
**Configuration (root `.env`, all optional).**
- `SENTRY_DSN` (API) and `NEXT_PUBLIC_SENTRY_DSN` (web, server and browser). Two names so the API and the web app can report to two Sentry projects. A DSN is public by design (it only allows sending events), which is why the web one may be `NEXT_PUBLIC_`. Unset or empty: `Sentry.init` is never called, capture calls are no-ops, nothing is logged.
- `SENTRY_ENVIRONMENT`, default `NODE_ENV`. Shared by both apps.
- `SENTRY_RELEASE`, default the git `HEAD` SHA when running inside the repo, otherwise the SDK's own CI detection. Both apps resolve it the same way, so one deploy is one release.
- The API validates `SENTRY_DSN` at boot (an `http(s)` URL with a public key) and fails with the variable name, never the value. The web app copies these variables from the root `.env` through `WEB_ENV_VARIABLES` (ADR 0003) and passes environment and release to both bundles through Next's `env` option, so the browser gets them at build time.

**API logs.** Every line is one JSON object (`level`, `timestamp`, `pid`, `context`, `message`, optional `params`/`error`/`stack`), and every line written while handling a request carries `requestId`. One `request completed` line per request records `method`, `path` (query string dropped), `statusCode`, `durationMs` and `aborted`. The whole log object goes through `redactValue` before it is written. Startup lines have no `requestId`, by design.

**What is reported to Sentry.**
- API: only 500 `INTERNAL_ERROR` from the exception filter, tagged `request_id` (same value as the log line and the `X-Request-Id` header), with `method` and `path` as context. 4xx are client mistakes; 503 means the database is down, which `/health` and the logs already show and which would burn the quota once per request during an outage. Uncaught exceptions and unhandled rejections are reported by the SDK's default handlers.
- Web server: `onRequestError` (`Sentry.captureRequestError`), so every server-rendering and route-handler error.
- Web browser: uncaught errors and unhandled rejections (SDK defaults), plus `error.tsx` and `global-error.tsx`, which report the error only when it has no `digest`. An error with a digest came from the server, which already reported it; reporting it again from the browser would count it twice.

**Quota and noise.** No tracing, profiling or Replay (`tracesSampleRate` unset, no Replay integration, tracing code excluded from the browser bundle), so only error events count. Errors are not sampled: losing a real error is worse than the quota risk, and the API sends 500s only. Browser noise is filtered with `ignoreErrors` (ResizeObserver loop, a visitor going offline, chunks deleted by a deploy) and `denyUrls` (browser extensions). The SDK's dedupe integration drops identical consecutive events. The last line of defense is the per-key rate limit and spike protection in the Sentry project settings, configured by hand (see Consequences).

**Scrubbing, in three layers.**
1. `dataCollection` (`PRIVATE_DATA_COLLECTION`, one constant for every app so they cannot drift) turns off cookies, headers, bodies, query strings, user info (IP), stack-frame variables, source context lines, database query data and GraphQL/AI payloads. `includeServerName: false` keeps the machine's host name out. In the browser, `beforeBreadcrumb` (`scrubBreadcrumb`) drops console breadcrumbs and the query of navigation and fetch URLs.
2. `beforeSend` runs `scrubErrorEvent`: `request` is rebuilt from `method` and `url` without query or fragment, `user` is dropped, then `redactValue` walks the whole event.
3. `redactValue` walks plain objects, arrays and class instances (validated DTOs are class instances), replaces the value of any key that looks sensitive (`password`, `secret`, `token`, `auth`, `authorization`, `cookie`, `api_key`, `private_key`, `session`, `credential`, `jwt`, `otp`, `dsn`), turns a nested `Error` into its redacted stack, and runs `redactText` on every string. `redactText` masks URL credentials (`postgres://user:pass@`, up to the last `@`), `Bearer`/`Basic`/`Token` values, JWTs, `key=value` / `"key": "quoted value"` pairs including compound names (`passwordHash`, `refresh_token_hash`), and email addresses.
4. `redactText` runs on attacker-controlled text (the request path of every log line), so it must not be a ReDoS: strings over 8 KB are cut, no rule rescans a long run from each position (JWTs are found by splitting the text into runs first), and a test bounds five crafted 16 KB paths to under 20 ms each. The first version's JWT rule took about 50 ms on such a path, enough to stall the API with 20 requests per second (security review).
Tests prove it end to end: the API test sends a request with an `Authorization` header, a cookie, a token in the query and a password in the body and error message, captures the envelope Sentry would send, and asserts none of them is in it.

**Never slow down a request.** Captures are fire-and-forget: the SDK queues the envelope and sends it in the background (`captureException` returns immediately, the transport drops events when its buffer is full). Nothing on the request path awaits `flush`. A test points the DSN at a server that accepts connections and never answers, and one at a closed port, and asserts the 500 still comes back immediately. `captureRequestError` in Next only calls `flush` inside `waitUntil`, which is a no-op outside Vercel/Cloudflare, so it does not hold the response either.

**ADR 0003 network rule.** No exception is added to the lint config. Our code never calls `fetch`: the Sentry transport lives inside `@sentry/nextjs`, which ESLint does not lint. The rule's intent (one module talks to our API) still holds; Sentry is a second, vendor-owned outbound destination, from both the web server and the browser. Any new direct use of the network in our own code still goes through `client.ts`.

**Source maps.** Not uploaded anywhere yet: `withSentryConfig` gets `sourcemaps: { disable: true }`, `telemetry: false` and `release.create: false`, so `next dev` and `next build` never talk to Sentry's API. Upload (with `SENTRY_AUTH_TOKEN` in CI only, never in `.env`) belongs to the deploy ticket. Until then, production browser stack traces are minified.

**Deliberate test errors (non-production only).** `GET /debug/error` in the API (`DebugModule`, loaded by `ConditionalModule` only when `NODE_ENV` is not `production`), and `/debug/server-error` and `/debug/client-error` in the web app (a `notFound()` in production).

## Consequences
- **Heuristic text redaction.** `redactText` catches known shapes, not every secret: a password in free text without a `password=`-style key, or a cookie header's second value, gets through. The real protection is not logging raw headers, bodies or query strings, which no code does today. Review any new log call that takes request data.
- **Paths are logged and reported as they are.** Query strings are dropped, path segments are not. Never put a secret in a URL path (for example a reset token as `/reset/:token`); send it in the body or a header.
- **Browser bundle +41 KB gzip** (all static chunks, against a build of main; +63 KB before excluding tracing and debug code).
- **License.** `@sentry/*` packages are MIT. `@sentry/nextjs` also pulls the Sentry CLI (`sentry` 0.45.0), licensed FSL-1.1-Apache-2.0: source-available, fine for our use, not for building a competing product. It has no install script; `allowBuilds` stays deny-by-default.
- **The public DSN and unauthenticated 500 paths can drain the quota.** Mitigated only by the manual Sentry settings below, and later by rate limiting the API (deploy ticket).
- **No breadcrumbs in the API.** Logs (with `requestId`) give the context instead. Revisit with the early `instrument.ts` import if traces are ever needed.
- **503s are not in Sentry.** A database outage must be caught by an uptime check on `/health` (deploy ticket).
- **Sentry project settings are manual.** Set a rate limit on each client key, keep spike protection on, and set Allowed Domains on the web project, so a crash loop or forged events cannot drain the monthly quota. Not in code, so not tested.
- **Stack frames carry absolute paths** (the deploy directory, or the developer's home folder locally). Kept: Sentry groups issues by them. Add `rewriteFramesIntegration` if a deploy path ever matters.
- **Environment and release are build-time values in the web app.** One build deployed to two environments reports the build's environment. Build once per environment, or move to a runtime value when that matters.
- **Debug routes are off only by `NODE_ENV`.** A staging deploy running with `NODE_ENV=production` cannot use them, and a deploy reachable from the internet with `NODE_ENV=development` exposes them (like Swagger). Non-production deploys stay private until the deploy ticket decides otherwise.

## Learnings
- Read the SDK's option types, not its docs pages: v11 replaced `sendDefaultPii` with `dataCollection`, whose defaults collect almost everything.
- Bounded quantifiers are not enough against ReDoS: `x{1,4096}` tried from every position is still O(n × 4096). Cap the input and avoid rescanning runs.
- Redaction has to run on what the logger really prints: Nest prints a DTO instance field by field, so skipping class instances leaked the fields. And the email rule first mangled pnpm paths in stack traces (`core@12.1.3_x`); a manual run caught it, not the unit tests.
