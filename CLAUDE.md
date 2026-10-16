# OtakuLeague

All-in-one anime platform: visualize anime/manga data, track watchlists, anime-themed games and quizzes. Solo project, built like a real product.
Full engineering rules live in docs/engineering-charter.md. Read the relevant section before design work.

## Stack (confirm with me before changing)
TypeScript strict everywhere, React frontend, NestJS backend, PostgreSQL (real Postgres in Docker for tests), REST API, pnpm. Modular monolith. Add Redis, queues or search engines only after a measured need. Free tools only unless strictly necessary.

## Commands
Requires Node 24 (`nvm use` reads .nvmrc) and pnpm 12.11.2 (pinned in package.json `packageManager`).
- `pnpm install`: install everything; also builds shared-types and points git at .githooks.
- `pnpm dev`: shared-types in watch mode, API on :3001 (PORT in .env), web on :3000.
  - A shared-types change reaches both apps in about 1.5 s with no manual restart (verified in OTA-84). The web app reloads it itself. The API restarts through `nest start --watch` when the `.d.ts` changes, and through `node --watch-path=../../packages/shared-types/dist` (the API `dev` script's `--exec`) when only the JS changes, e.g. a function body; without it the API kept the old code. Each build gives one API restart (about 1 s down), even for a type-only change. On macOS, a rebuild that deletes `dist/` (`pnpm test`, `lint`, `typecheck`) does not break the watch; Linux is unverified. If the API restarts in the instant `dist/` is missing, it exits with `ENOENT ... watch`: edit an API file or restart `pnpm dev`.
- `pnpm build`: shared-types first, then api and web.
- `pnpm lint`: ESLint, zero warnings allowed.
- `pnpm typecheck`: tsc in every package.
- `pnpm test`: unit tests, no database needed: node:test (shared-types), Vitest (api and web), then `pnpm test:hooks` and `pnpm test:scripts` (node:test for `scripts/`).
- `pnpm clean`: deletes build output only, from the explicit list in `scripts/clean.mjs` (every `node_modules` with the Vitest caches, `dist`, `apps/web/.next`, `apps/api/src/generated`); it refuses any `.env*` path. Then `pnpm install`. Run it from the repo root: it overrides pnpm's built-in `clean`, which a package folder still gets. macOS and Linux only (Windows untested). To start from scratch use `pnpm clean`, never `git clean -x` / `-X`: they delete the gitignored root `.env` (OTA-89).
- `pnpm test:hooks`: pipes sample hook JSON into the Claude Code hooks in `.claude/hooks` and checks block (exit 2) or allow (exit 0). Needs `jq`. The hooks are launched as `bash <script> || exit 2`, so a missing script, a lost executable bit or a missing `jq` blocks instead of silently allowing. protect-env also covers Bash: a line that names a real env file next to a redirect or a write command (`tee`, `sed`, `cp`, `python`...) is blocked, even inside heredoc text, so long commit/PR text goes through a file (`git commit -F`, `--body-file`) given as a literal absolute path (the attribution hook blocks a message file it cannot read). `cat`/`grep` of `.env`, and anything on `.env.example`, stay allowed. `.githooks/commit-msg` rejects attribution in the final commit message too. It also matches the `permissions.deny` patterns in `.claude/settings.json` against sample commands (a bash-glob approximation of Claude Code's matching): `git clean` with `-x`/`-X` (which would delete the gitignored `.env`) and `git stash` with `-a`/`--all` (which move it out of the tree) or `-u`/`--include-untracked` (which move untracked work) are denied in every permission mode. These rules cover only Claude's tool calls, not commands typed in a terminal.
- `pnpm test:integration`: API `*.integration.spec.ts` against real Postgres (`pnpm db:up` first). Same command in CI. Recreates and migrates the `DATABASE_URL_TEST` database each run, one cloned database per test file (ADR 0005).
- `pnpm format`: Prettier over the whole repo.
- One package only: `pnpm --filter @otakuleague/api test`.
- CI (`.github/workflows/ci.yml`) runs the same scripts on every PR and push to main: jobs Lint (after `pnpm peers check` and `pnpm dedupe --check`), Typecheck, Unit tests (no database), Integration tests (Postgres service), Build. It uses no secrets, so fork and Dependabot PRs run identically.
- Dependabot (`.github/dependabot.yml`) opens grouped PRs weekly: GitHub Actions (SHA pins), and npm as `blocked-tooling` (typescript, eslint, @eslint/js, held back by upstream peer ranges, see the OTA-83 worklog entry), minor+patch, and majors. After a dependency change, check typescript-eslint is installed once (`pnpm why typescript-eslint -r`); two copies break web lint with "Cannot redefine plugin", and `pnpm dedupe` fixes it.
- `@types/node` follows the Node major in `.nvmrc` (24): Dependabot ignores its major updates, so bump it by hand in the same PR as a Node upgrade (`.nvmrc`, `engines`, CI). Its minor and patch updates still come weekly.

### Database
Requires Docker. First time: `cp .env.example .env` (until `.env` exists, Compose stops with "required variable ... is missing a value").
- `pnpm db:up`: start PostgreSQL 16 detached and wait until healthy. Dev DB `POSTGRES_DB`, test DB `POSTGRES_TEST_DB`, bound to 127.0.0.1 only.
- `pnpm db:down`: stop the container, keep the data.
- `pnpm db:reset`: delete the data volume and start fresh; the init script recreates the test DB.
- `pnpm db:logs`: follow the database logs.
- Port conflict ("port is already allocated" / "address already in use"): set `POSTGRES_PORT` in `.env` (e.g. 5433) and update the port in `DATABASE_URL` and `DATABASE_URL_TEST`, then `pnpm db:up`.
- Leftover volume (`db:up` ends with "container ... is unhealthy" because the test DB is missing, or the logs say "database files are incompatible with server" after a version change): init scripts only run on an empty volume, so run `pnpm db:reset`. This deletes all local data.

### API with the database
The API loads the repo-root `.env` (real env vars win) and refuses to boot, exit code 1, with one message listing every missing or invalid variable (`NODE_ENV`, `PORT`, `DATABASE_URL`).
1. `cp .env.example .env` (an older `.env` needs `NODE_ENV=development` added), then `pnpm db:up`.
2. `pnpm db:migrate` (runs `prisma migrate deploy` in the API): apply migrations to the dev DB (`prisma migrate status` to check).
3. `pnpm dev`, or `pnpm build && pnpm --filter @otakuleague/api start`.
4. `curl localhost:3001/health`: 200 `{"status":"ok",...}`, or 503 while Postgres is down (the API keeps running and recovers by itself). Swagger UI at `/docs`, JSON at `/docs-json`, both off when `NODE_ENV=production`.
- Prisma CLI: run it inside apps/api (`pnpm --filter @otakuleague/api exec prisma ...`); `pnpm install` regenerates the client into `apps/api/src/generated` (gitignored). After a schema change: `prisma migrate dev --name <change>`, then `prisma generate`.
- Migrations: `migrate dev` only against the dev DB; `migrate deploy` for production; the integration suite migrates the test DB itself. Never edit an applied migration; add a new one.
- Unit tests point `DATABASE_URL` at a closed port; anything that queries Postgres is a `*.integration.spec.ts`. Copy `apps/api/src/testing/example.integration.spec.ts` (inject `Clock` and `Random`, never `new Date()` or `randomUUID()`). If Postgres is down the integration suite stops with "Run `pnpm db:up`"; "Another integration run is using ..." means two runs overlap.

### Web with the API
- The web app copies its own variables (`WEB_ENV_VARIABLES` in `next.config.ts`) from the repo-root `.env`, inside the repo only; real env vars win. It needs `API_BASE_URL` (server-only, example value in `.env.example`; an older `.env` needs it added). A missing or invalid value fails the first API call with one message naming the variable.
- Restart `pnpm dev` after editing the root `.env`, and don't add `apps/web/.env*` files (ADR 0003).

### Anime data (ADR 0006, OTA-92)
- `GET /anime/:idSource/:externalId` with `anilist` or `myanimelist`, e.g. `curl localhost:3001/anime/myanimelist/16498`. The first request imports from AniList (a few seconds); Jikan fills in MAL data in the background.
- By slug (ADR 0007): `curl localhost:3001/anime/slugs/attack-on-titan`. The canonical slug answers `{"kind":"anime",...}`; an alias, a former slug or another letter case answers `{"kind":"redirect","canonicalSlug":...}` (the web client refuses HTTP redirects, so the redirect is data). `/anime/slugs/:slug` is declared before `/anime/:idSource/:externalId` in the controller: both have two segments, keep that order.
- Franchise (ADR 0008): `curl localhost:3001/anime/slugs/attack-on-titan/franchise`. Stored data only: the first call answers `{"state":"walking",...}` and queues a background walk of the SEQUEL/PREQUEL graph on AniList (one batched request per level); call again for the seasons and Related groups. Manual fixes live in `anime_franchise_override` and ship as reviewed data migrations (`INSERT ... ON CONFLICT`, ADR 0008).
- Kill switches `ANIME_SOURCE_ANILIST_ENABLED` / `ANIME_SOURCE_JIKAN_ENABLED` (default true, read at start): false hides that source's data everywhere without deleting it. Base URLs `ANILIST_API_URL` / `JIKAN_API_URL` are optional.
- A new source is a new adapter under `apps/api/src/anime/sources` with its own switch and limiter; never read a source's API outside its adapter. Tests use the recorded responses in `sources/fixtures` and local fake servers, never live calls.

### Logs and error tracking (ADR 0004)
- API logs are one JSON object per line; lines written during a request carry `requestId`, also returned as the `X-Request-Id` header. Pipe through `jq` to read them.
- Sentry is off until `SENTRY_DSN` (API) or `NEXT_PUBLIC_SENTRY_DSN` (web) is set in the root `.env`. `SENTRY_ENVIRONMENT` defaults to `NODE_ENV`, `SENTRY_RELEASE` to the git commit.
- Browser events go through the web app's `/hikari` tunnel (OTA-87), never straight to sentry.io. It forwards only envelopes for `NEXT_PUBLIC_SENTRY_DSN`, up to 1 MiB; `src/observability/sentry-tunnel.ts` is the only file besides `client.ts` where ESLint allows `fetch`.
- Deliberate test errors, outside production only: `curl localhost:3001/debug/error`, and in a browser `localhost:3000/debug/server-error` and `localhost:3000/debug/client-error` (click the button).
- Never log raw headers, bodies or query strings, and never put a secret in a URL path: redaction (`redactValue` in shared-types) is a safety net, not a guarantee.

## Definition of done
1. Tests cover the behavior and pass (run them, don't assume).
2. Typecheck and lint pass with zero warnings.
3. Docs updated (README, architecture, or a decision record).
4. Small, reviewable change with a Conventional Commit message.
5. Edge cases considered and listed: empty, single item, boundaries, nothing found, dependency failure.
6. Complexity and trade-offs explainable in two sentences.

## Workflow for any task
1. Restate the goal and assumptions in 2-3 lines. Ask at most 3 clarifying questions.
2. Every task maps to a Linear ticket. Branch names and commits reference its key.
3. Larger features: delegate to the architect subagent first, write the decision record in docs/decisions, then code.
4. Implement with tests alongside. Simplest design that works.
5. Delegate to test-writer, then code-reviewer. If schema.prisma changed, also db-migration-checker. Fix critical findings and re-review.
6. Delegate to pr-writer for commit, push and PR.
7. Finish with a short summary: Context, Actions, Results, Learnings.
8. After a non-trivial feature, delegate to the interviewer subagent.

## Code rules
- No any (use unknown and narrow). Discriminated unions for states, never ambiguous booleans.
- Precise domain names (WatchlistEntry, QuizAttempt), never data/info/item.
- Small pure functions. Never mutate inputs.
- Validate at the boundary. Derive the current user from the auth token, never from the request body.
- Error envelope: { "error": { "code": "QUIZ_NOT_FOUND", "message": "..." } } with correct 4xx/5xx.
- Business logic in services, never controllers. External providers behind interfaces.
- All network calls from the web app go through `apps/web/src/api/client.ts`; pages use `apiClient()`. ESLint blocks raw `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `http`/`https`/`undici` imports and `createApiClient` elsewhere. Expected failures come back as `ApiResult`, never thrown (ADR 0003).
- No dead code, no commented-out code, no TODO without a Linear ticket.
- Every list endpoint is paginated with a max page size.

## Git
Never push directly to main; always open a PR. Never merge with red CI. GitHub does not enforce this on the free plan, so a pre-push hook in .githooks blocks direct pushes to main.
Conventional Commits, small PRs (under ~400 lines), self-review before merge. NEVER add Co-Authored-By or any AI attribution to commits, PRs or code. Never change git user.name/user.email.

## Security
A missing root `.env` is an incident, never a starting state: stop, tell the human what you saw and when, and do not recreate it, copy `.env.example` over it, or work around it with env vars until they answer (OTA-89).
Secrets only in env vars; keep .env.example current. Check license and terms of every third-party data source and image before caching or using it.
