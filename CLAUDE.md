# OtakuLeague

All-in-one anime platform: visualize anime/manga data, track watchlists, anime-themed games and quizzes. Solo project, built like a real product.
Full engineering rules live in docs/engineering-charter.md. Read the relevant section before design work.

## Stack (confirm with me before changing)
TypeScript strict everywhere, React frontend, NestJS backend, PostgreSQL (real Postgres in Docker for tests), REST API, pnpm. Modular monolith. Add Redis, queues or search engines only after a measured need. Free tools only unless strictly necessary.

## Commands
Requires Node 24 (`nvm use` reads .nvmrc) and pnpm 12.11.2 (pinned in package.json `packageManager`).
- `pnpm install`: install everything; also builds shared-types and points git at .githooks.
- `pnpm dev`: shared-types in watch mode, API on :3001 (PORT in .env), web on :3000.
- `pnpm build`: shared-types first, then api and web.
- `pnpm lint`: ESLint, zero warnings allowed.
- `pnpm typecheck`: tsc in every package.
- `pnpm test`: node:test (shared-types), Vitest (api and web).
- `pnpm format`: Prettier over the whole repo.
- One package only: `pnpm --filter @otakuleague/api test`.

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
2. `pnpm --filter @otakuleague/api exec prisma migrate deploy`: apply migrations to the dev DB (`prisma migrate status` to check).
3. `pnpm dev`, or `pnpm build && pnpm --filter @otakuleague/api start`.
4. `curl localhost:3001/health`: 200 `{"status":"ok",...}`, or 503 while Postgres is down (the API keeps running and recovers by itself). Swagger UI at `/docs`, JSON at `/docs-json`, both off when `NODE_ENV=production`.
- Prisma CLI: run it inside apps/api (`pnpm --filter @otakuleague/api exec prisma ...`); `pnpm install` regenerates the client into `apps/api/src/generated` (gitignored). After a schema change: `prisma migrate dev --name <change>`, then `prisma generate`.
- Migrations: `migrate dev` only against the dev DB; `migrate deploy` for test, CI and production. Never edit an applied migration; add a new one.
- API tests point `DATABASE_URL` at `DATABASE_URL_TEST`; if Postgres is down they fail with "Run `pnpm db:up`".

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
- No dead code, no commented-out code, no TODO without a Linear ticket.
- Every list endpoint is paginated with a max page size.

## Git
Never push directly to main; always open a PR. Never merge with red CI. GitHub does not enforce this on the free plan, so a pre-push hook in .githooks blocks direct pushes to main.
Conventional Commits, small PRs (under ~400 lines), self-review before merge. NEVER add Co-Authored-By or any AI attribution to commits, PRs or code. Never change git user.name/user.email.

## Security
Secrets only in env vars; keep .env.example current. Check license and terms of every third-party data source and image before caching or using it.
