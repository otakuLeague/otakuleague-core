# 0002: API validation, error envelope, health and Prisma wiring
Status: accepted (2026-10-13, OTA-75)

## Context
Every endpoint depends on the same base: validated configuration, one error shape, request validation, and a way to tell whether the service and its database are alive. If we add these later, every endpoint gets rewritten. The ticket also asked for Prisma with a first migration, and noted that the scaffold's `AppInfo` type breaks the naming rule.

Constraints: the API compiles to CommonJS on Node 24; web and mobile share TypeScript types, not runtime code; the API must start, and report that it is unhealthy, while PostgreSQL is down.

## Options
| Topic | Chosen | Rejected | Cost of the choice |
|---|---|---|---|
| DTO and env validation | class-validator + class-transformer | zod | NestJS's ValidationPipe and Swagger read the decorators directly. The cost: web and mobile cannot reuse the validation rules at runtime. They share only the types in `shared-types`. |
| Health check | Our own service runs `SELECT 1` with a 2 s timeout | @nestjs/terminus | Terminus adds a dependency and its own response shape just to wrap one query. If we ever check more dependencies (Redis, providers), revisit it. |
| Prisma connection | Lazy: no `$connect` at boot, `$disconnect` on shutdown | Connect at boot, with retry and backoff | The first request after a cold start also pays for opening the connection. In return, the API never needs a retry loop or a startup order: every query tries to connect again. This also covers the OTA-74 note ("retry with an increasing delay, don't depend on startup order"). |
| Connection URL | One validated `DATABASE_URL` | Build it from the `POSTGRES_*` parts (OTA-74 note) | Credentials are still written twice in `.env.example`. But production platforms hand out a single URL, so building it from parts would only help local development. |

## Decision
**Error envelope.** Every error response has this shape:

```json
{ "error": { "code": "UPPER_SNAKE_CODE", "message": "...", "details": [{ "field": "studio.name", "message": "..." }] } }
```

- **`details` is a deviation from the charter shape.** It is optional and appears only with `VALIDATION_FAILED`: one entry per failed constraint, and `field` is a dotted path.
- **`ApiError` is a discriminated union on `code`.** `details` exists, and is required, only on the `VALIDATION_FAILED` branch, so the type enforces the rule instead of a comment. `ApiException` carries one branch of that union as is.
- **The codes are a union type, `ApiErrorCode`, in `shared-types`.** The values are `VALIDATION_FAILED`, `MALFORMED_REQUEST`, `BAD_REQUEST`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `CLIENT_ERROR` (any other 4xx), `SERVICE_UNAVAILABLE` and `INTERNAL_ERROR`. Domain codes such as `QUIZ_NOT_FOUND` get added to this union and thrown as `ApiException`.

**Status mapping, in the global filter (`common/filters/api-exception.filter.ts`).**

| What was thrown | Response |
|---|---|
| `ApiException` | Its own status, code, message and details. |
| Any other 4xx `HttpException` (status checked as a positive 400-499 range, so NaN falls to 500) | Its own status and message. Code: 400 gives `BAD_REQUEST`, 404 `NOT_FOUND`, 413 `PAYLOAD_TOO_LARGE`, anything else `CLIENT_ERROR`. |
| A 503, or a database connection failure | 503 `SERVICE_UNAVAILABLE` with a generic message. |
| Anything else, including other 5xx | 500 `INTERNAL_ERROR` with a generic message. |

A server fault never sends its own message, stack, SQL or file paths to the client. The filter logs the real error server-side. If the headers were already sent, the filter ends the response instead of writing a second body.

**Health exception.** `GET /health` returns:
- 200 `{ "status": "ok", "checks": { "database": "up" } }`, or
- 503 `{ "status": "error", "checks": { "database": "down" } }`.

The 503 body is the one documented exception to the envelope: monitors read `checks`, not `error`. The query races a 2 s timer, so the endpoint cannot hang. The response has `Cache-Control: no-store`, so no proxy serves a stale 200 during an outage. The controller only sets the status code and that header; the logic lives in `HealthService`.

**Validation.** A global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted` and `transform`. Its `exceptionFactory` throws `ApiException(400, VALIDATION_FAILED, details)`.

**Configuration.**
- **Setup:** `@nestjs/config` with a class-validator `validate` function. It reads `NODE_ENV` (development, test or production; required), `PORT` (integer from 1 to 65535, default 3001) and `DATABASE_URL` (a `postgres://` or `postgresql://` URL). An empty value (`KEY=` in `.env`) counts as unset.
- **URL check.** `DATABASE_URL` is checked with `URL.canParse` plus the protocol, not `@IsUrl`. validator.js rejected valid connection strings: hosts with underscores (Compose service names) and Unix sockets via `?host=`.
- **Where it loads from:** the repo-root `.env`, resolved from the module's own directory, so the working directory does not matter. A missing file is fine, and real environment variables override the file.
- **Only inside the repo.** The file is read only if `pnpm-workspace.yaml` sits next to it. A deployed `dist/` would otherwise resolve the path to an unrelated folder such as `/` and could pick up a stray `.env` that switches Swagger on or swaps the database (security review M2). Outside the repo, only real environment variables count, and a missing `NODE_ENV` stops the boot.
- **Bad config:** any problem stops the boot with one message that lists every problem, and exit code 1. Messages never include values: `DATABASE_URL` contains a password.
- **`NODE_ENV` is required on purpose.** A default of `development` would quietly turn Swagger on in a misconfigured production deploy.

**OpenAPI.** `@nestjs/swagger` builds it from the code. The UI is at `/docs` and the JSON at `/docs-json`, both only outside production.

**Prisma 7.10.0, pinned exactly.**
- **Version.** The npm `latest` tag of `prisma` points to `8.0.0-rc.22`, a release candidate. `@prisma/client` `latest` is 7.10.0. The CLI, the client and `@prisma/adapter-pg` must move together.
- **Generator settings.** We use the `prisma-client` generator with `output = "../src/generated/prisma"` (gitignored, regenerated by `postinstall`) and `moduleFormat = "cjs"`.
- **Why `moduleFormat = "cjs"` is required.** It is not in the NestJS guide, which assumes ESM. Without it, Prisma infers ESM. The client then sets `globalThis.__dirname` from `import.meta.url` and imports `.ts` paths, and both break `nest build`. Checked by generating both formats and comparing them.
- **Where the URL lives.** Prisma 7 no longer accepts `url` in `schema.prisma`, so it is set in `apps/api/prisma.config.ts`.
- **How the CLI gets it.** The config reads the root `.env` with `process.loadEnvFile`, a Node built-in, so we need no dotenv dependency. It uses `process.env.DATABASE_URL ?? ''` rather than `env()`, because `env()` throws when the variable is unset, which would break `prisma generate` on a clean clone.
- **Runtime connection.** `PrismaService` connects through `PrismaPg` with `connectionTimeoutMillis: 5000` and `query_timeout: 10000`. pg has no timeouts by default, so a blackholed host or a stalled server would hold pool slots indefinitely. The health check stops waiting after 2 s, but only these settings free the slot of the query it abandoned. `errorFormat: 'minimal'` keeps call arguments out of error messages, and therefore out of the 5xx logs.
- **The empty migration.** `prisma migrate dev --create-only --name init` did create a migration with no models. It contains only `-- This is an empty migration.`. Applied with `migrate deploy`. On the test DB, `migrate status` went from exit 1 ("No migration found ... The current database is not managed by Prisma Migrate") to "Database schema is up to date!".
- **Install scripts denied.** `allowBuilds` blocks the install scripts of `prisma` (its preinstall is only a Node version check), `@prisma/engines` (postinstall downloads the schema engine) and `@scarf/scarf` (install-time telemetry from swagger-ui). The CLI downloaded the schema engine itself the first time it ran (`~/.cache/prisma/master/<hash>`). Consequence: the first CLI run needs network access.

**Express adapter.** `ApiExpressAdapter` overrides `mapException`, the documented hook in the `HttpServer` contract.
- **Why it is needed.** The stock adapter turns invalid JSON into a plain `BadRequestException(error.message)`, losing the cause. It also passes other body-parser errors through raw, so 413 (body too large) and 415 (unsupported charset) would become 500.
- **What it does.** Invalid JSON becomes 400 `MALFORMED_REQUEST`. The other body-parser errors keep their 4xx status.
- **Where it is wired.** `main.ts` and the test app both use it.

## Consequences
- **Database errors under driver adapters don't match the docs.**
  - **What the docs say:** a connection failure is `PrismaClientInitializationError` or P1001.
  - **What actually happened on 7.10.0:** a raw query against a closed port threw `PrismaClientKnownRequestError` P2010, with `meta.driverAdapterError.cause.kind = "DatabaseNotReachable"`. A pg connect timeout arrives as a bare `Error("Connection terminated due to connection timeout")`.
  - **What the filter checks:** the documented classes and codes, the adapter's connection kinds, and that exact pg message.
  - **Risk:** if a Prisma or pg upgrade renames any of these, those failures become 500 instead of 503. The unit tests pin each shape.
- **Model queries are untested.** There are no models yet, so no test covers a failing model query (as opposed to a raw query). Re-check the error shape when the first model lands.
- **No `$connect` at boot.** A wrong password or a missing database is only noticed at the first query or health check, not at startup.
- **Logging.** The filter logs the real message and stack for 5xx. Connection messages include user, host and port, never the password (checked). Model-query messages are untested until models exist; `errorFormat: 'minimal'` is the first guard. Redaction belongs to OTA-79.
- **Vitest now has a config file.** It holds one `setupFiles` entry, which loads `.env` and points `DATABASE_URL` at `DATABASE_URL_TEST`, so tests never touch dev data. This revises the "no config file" note in ADR 0001. Integration tests only read; write isolation is OTA-78. (Superseded by ADR 0005: unit tests have no database, integration tests get one cloned database per file.)
- **No migration is applied automatically.** Run `migrate deploy` per environment (see CLAUDE.md). The test DB is not migrated by the test run. Once models exist, OTA-78 must add that (Vitest `globalSetup` running `migrate deploy`) and CI (OTA-77) must run it too. `use-test-database.ts` refuses a `DATABASE_URL_TEST` whose database name does not end in `_test`. (Done in OTA-78, see ADR 0005.)
- **A production install needs a build stage.** `prisma` is a devDependency and `postinstall` runs `prisma generate`, so `pnpm install --prod` fails. The future Dockerfile must generate and build in a stage with dev dependencies and run `migrate deploy` from there; the runtime only needs `dist/`.

### Follow-ups and accepted risks (from the reviews)
- **Swagger fails open.** It is on for any `NODE_ENV` other than `production`, as decided. Allowing it only in `development` would fail closed; decide this before the first deploy.
- **The API binds every interface.** Add `HOST` (default `127.0.0.1` in development) with the deploy ticket.
- **Some 4xx messages echo client input**, for example `Cannot GET /<path>` and `unsupported charset "X"`. The body is JSON, so there is no XSS. Rule going forward: never pass a library message into a 4xx; throw `ApiException` with our own text.
- **`CLIENT_ERROR` is a placeholder.** Add `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` and `TOO_MANY_REQUESTS` in the ticket that first produces each one.
- **Misconfiguration reads as an outage.** `AuthenticationFailed` and `DatabaseDoesNotExist` map to 503 like an outage, as specified ("Prisma connection errors"). Revisit when alerting distinguishes the two.
- **`/health` is unauthenticated** and runs a query per call. Rate limiting belongs to OTA-79. A shared in-flight check is the next step if probes get noisy.
- **`pnpm audit` advisories are dev-only.** `mysql2` and `deepmerge-ts` come in through the `prisma` CLI; `braces` through `eslint-config-next`, and it predates this change. `pnpm audit --prod` is clean. Accepted for now.
- **The schema engine is downloaded at first CLI use**, outside the lockfile's integrity hashes. That is the same trust as the denied postinstall. CI should cache `~/.cache/prisma`.

## Learnings
- `@ValidateNested()` alone accepts a missing nested object; pair it with `@IsDefined()`.
- class-validator checks a property's decorators from the bottom one up. With `stopAtFirstError`, put the type check (`@IsInt`) last in the source, or `PORT=abc` reports "must be at most 65535".
- Any module that calls class-transformer must `import 'reflect-metadata'` itself. It worked in the app only because Nest loads the polyfill first, and failed in a standalone unit test.
- Applied migrations are checksummed. `.editorconfig` now leaves `prisma/migrations/**` alone, because an editor adding a final newline would make Prisma treat the init migration as modified, and `migrate dev` would offer to reset the database.
- Adding the API dependencies changed the lockfile's peer variants (`eslint` resolved with `jiti` and `supports-color@7`). The result was two `@typescript-eslint` plugin instances, and web lint failed with "Cannot redefine plugin". `pnpm dedupe` fixed it; run it after adding dependencies.

## Sources checked 2026-10-13
- Prisma ORM v7 docs: guides/v7/frameworks/nestjs, guides/v7/deployment/pnpm-workspaces, orm/v7/reference/prisma-config-reference, orm/v7/prisma-schema/overview/generators, orm/v7/reference/error-reference (the unversioned pages now describe Prisma 8).
- `@nestjs/core` 12.1.3 source: `HttpServer.mapException`, `ExpressAdapter.mapException`, `ExceptionsZone`.
- `@prisma/adapter-pg` 7.10.0 source: socket error to `kind` mapping.
