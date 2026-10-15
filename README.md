# OtakuLeague

An all-in-one anime platform: visualize anime and manga data, track watchlists, and play anime-themed games and quizzes.

## Why it exists

To put anime data, tracking and games in one place, and to own a real product end to end, from design to production. It is a solo project built the way a product team would build it: written decisions, tests on every change, CI on every PR ([engineering charter](docs/engineering-charter.md)).

Today (end of Phase 0) it is the foundation only: a NestJS API with a health endpoint, a Next.js web app that shows the API status, PostgreSQL, error tracking and CI. No product features yet. See [docs/architecture.md](docs/architecture.md).

## Run it locally (under 5 minutes)

Prerequisites: git, [nvm](https://github.com/nvm-sh/nvm), Docker (running), and `jq` for the hook tests.

```sh
git clone https://github.com/otakuLeague/otakuleague-core.git
cd otakuleague-core
nvm install                      # installs and uses Node 24 from .nvmrc (later: nvm use)
npm install -g pnpm@12.11.2      # the version pinned in package.json
pnpm install                     # all packages; also builds shared-types and sets up git hooks
cp .env.example .env             # dev-only placeholder values, no secrets needed
pnpm db:up                       # PostgreSQL 16 in Docker, waits until healthy
pnpm db:migrate                  # applies Prisma migrations to the dev database
pnpm dev                         # API on :3001, web on :3000
```

Check it works:

- `curl localhost:3001/health` returns 200 `{"status":"ok",...}` (503 while Postgres is down).
- http://localhost:3000 shows the API status.
- Swagger UI at http://localhost:3001/docs.

Stop with Ctrl+C, then `pnpm db:down` (keeps the data).

### The .env file

- `.env` lives at the repo root only; the API and the web app both read it, and real environment variables win. Restart `pnpm dev` after editing it.
- When `.env.example` gains a variable, add it to your `.env`. If you append from the shell (`echo X=1 >> .env`), first check that the file ends with a newline: `tail -c1 .env | od -c` must show `\n`. Otherwise the new variable is glued to the last line and both values break.
- Sentry is optional: leave `SENTRY_DSN` (API) and `NEXT_PUBLIC_SENTRY_DSN` (web) empty and nothing is sent. Set them to report errors to your own Sentry projects (ADR 0004).

### Common problems

- **Port 5432 already in use**: set `POSTGRES_PORT` (e.g. 5433) in `.env`, change the port in `DATABASE_URL` and `DATABASE_URL_TEST` to match, then `pnpm db:up`.
- **`db:up` ends with "container ... is unhealthy"**, or the logs say the database files are incompatible: an old data volume. `pnpm db:reset` recreates it (deletes local data).
- **The API exits at boot with a list of variables**: `.env` is missing or outdated; compare it with `.env.example`.
- **Start from scratch** (stale dependencies or build output): `pnpm clean`, then `pnpm install`. It deletes `node_modules`, `dist`, `.next` and the generated Prisma client, and never `.env`. Never use `git clean -x` / `-X` for this: `.env` is gitignored, so they delete it too.

## Tests

| Command | What it runs | Needs |
| --- | --- | --- |
| `pnpm test` | Unit tests: node:test (shared-types), Vitest (api, web), then the hook and `scripts/` tests | nothing running |
| `pnpm test:integration` | API `*.integration.spec.ts` against a real PostgreSQL; recreates and migrates the test database each run | `pnpm db:up` |
| `pnpm test:hooks` | Claude Code hook and permission tests in `.claude/hooks` | `jq` |
| `pnpm lint` / `pnpm typecheck` | ESLint (zero warnings) / `tsc` in every package | nothing |

CI runs lint, typecheck, unit tests, integration tests and build on every PR and every push to main.

## More

- [Architecture](docs/architecture.md)
- [Decision records](docs/decisions/)
- [Engineering charter](docs/engineering-charter.md)
- [Worklog](docs/worklog.md)
- [CLAUDE.md](CLAUDE.md): every command in detail, including the database and dev-mode notes.
