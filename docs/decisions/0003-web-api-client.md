# 0003: Web API client
Status: accepted (2026-10-14, OTA-76)

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

**One module touches the network.** `createApiClient({ baseUrl, fetch?, defaultTimeoutMs? })` returns `call<T>(path, options)` and `getHealth()`; it validates `baseUrl` with the same rules as `API_BASE_URL`. `apiClient()` builds the app-wide instance on first use from `process.env`. ESLint's built-in rules enforce this in `apps/web` outside `src/api/client.ts`, and a Vitest test runs the real config to prove it:
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
