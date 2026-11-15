# Onboarding

A guide for people. [CLAUDE.md](../CLAUDE.md) and `.claude/rules/` are written for agents; this page tells you where things are and why. It links to the real files instead of copying them.

## 1. TL;DR: run it locally

Prerequisites: git, [nvm](https://github.com/nvm-sh/nvm), Docker (running), pnpm 12.11.2 (`npm install -g pnpm@12.11.2`).

```sh
nvm use            # Node 24 (first time: nvm install)
pnpm install
cp .env.example .env   # first time only
pnpm db:up         # PostgreSQL 18 in Docker
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:3000. API: http://localhost:3001. Swagger UI: http://localhost:3001/docs (OpenAPI JSON at `/docs-json`).
- Full steps and common problems: the "Run it locally" and "Common problems" sections of the [README](../README.md). [SETUP.md](SETUP.md) is not local setup: it is the manual for the Claude daily loop and the autopilot.
- Start from scratch with `pnpm clean`, then `pnpm install`. Never use `git clean -x` or `-X`: `.env` is gitignored, so they delete it.
- Seed users and Mailpit (local mail) do not exist yet: coming with OTA-186.

## 2. Path of a change

```
Linear ticket (OTA-123)
  -> branch type/OTA-123-short-name
  -> pull request
  -> CI
  -> review
  -> merge to main
  -> beta.otakuleague.com
  -> production (after the cutover, OTA-149)
```

1. **Ticket.** Every task is a Linear ticket in team OTA. Commits and the branch name carry its key.
2. **Branch.** `type/OTA-123-short-name`, for example `feat/OTA-123-watchlist-page`. Never push to `main`.
3. **PR.** Keep it under about 400 lines. Use Conventional Commit messages.
4. **CI** ([ci.yml](../.github/workflows/ci.yml)). Jobs on every PR:
   - Lint (zero warnings), Typecheck, Unit tests, Integration tests (real Postgres), Build.
   - Deploy order: a warning, never a failure. Web (Vercel) and API (Railway) deploy separately, so a PR that changes both and touches the contract should be backward compatible, or split with the API first ([script](../scripts/deploy-order.mjs)).

   A separate workflow, Screenshots ([screenshots.yml](../.github/workflows/screenshots.yml)), runs only when `apps/web`, `apps/api`, `packages/shared-types` or `scripts/screenshots` change. It posts real pages as images in one PR comment ([ADR 0013](decisions/0013-pr-screenshots.md)).
5. **Review.** One review pass before merge (the `/ship` skill runs it). The reviewer is never the model that wrote the code.
6. **Merge.** Farouk merges, or the `Autopilot merge` workflow squash-merges a PR labelled `automerge`, or a ready-for-review `autopilot` PR whose checklist is fully ticked (OTA-176), once checks are green. It never merges a PR that touches a protected path. See [AUTOPILOT.md](AUTOPILOT.md).
7. **Beta.** A merge to `main` deploys the web to Vercel and the API to Railway, to https://beta.otakuleague.com. If a watched path changed, Railway builds the API after green checks, runs `prisma migrate deploy`, and the new container must answer `/health` before it takes traffic. Details: [deploy.md](deploy.md) and [deploy-vercel.md](deploy-vercel.md).
8. **Production.** The DNS cutover of otakuleague.com is OTA-149 (no fixed date: Farouk decides, [ROADMAP.md](ROADMAP.md)). The beta is `noindex` until then.

**Rollback.**

- API (Railway): dashboard, API, Deployments, pick the last good one, Redeploy (or Rollback). If Redeploy is not offered, revert the commit on `main` with a PR. See "Rollback" in [deploy.md](deploy.md).
- A rollback never undoes a migration. Fix forward with a new migration. Migrations are additive: expand first, contract in a later PR.
- Web (Vercel): Instant Rollback to a previous production deployment, or revert the commit on `main`. See "Rollback" in [deploy-vercel.md](deploy-vercel.md).

## 3. Code map

| Path | What lives there |
| --- | --- |
| `apps/api/src/<module>/` | NestJS modules: controller, then service, then adapters. Today: `anime`, `health`, `debug`, `observability`, `prisma`, `config`, `common` |
| `apps/api/src/anime/sources/` | One adapter per external anime API (`anilist.adapter.ts`, `jikan.adapter.ts`); a source's API is only called from its adapter |
| `apps/api/prisma/` | `schema.prisma` and `migrations/` |
| `apps/web/app/` | Next.js routes (`anime`, `season`, `faq`, `privacy`, `terms`, `hikari`, ...) and global styles |
| `apps/web/src/` | Client and shared web code by feature (`anime`, `browse`, `home`, `legal`, `shell`, `seo`, `observability`) |
| `apps/web/src/api/client.ts` | `apiClient()`: the only place the web makes network calls (ESLint blocks the rest) |
| `apps/web/app/styles/tokens.css` | Design tokens |
| `packages/shared-types/` | DTOs, error codes and guards used by both apps |
| `docs/decisions/` | ADRs: the "why" behind each choice. Read the matching one before changing an area |
| `.claude/rules/` | Per-area notes for agents (`api`, `web`, `database`, `anime-data`, `observability`, `tooling`) |
| `.claude/skills/` | Slash-command workflows (`/start`, `/next`, `/ship`, `/wrap`, `/design`, `/autopilot`, ...) |
| `.claude/agents/` | The specialised agents (section 7) |

Also: [architecture.md](architecture.md) (diagram of what exists), [engineering-charter.md](engineering-charter.md) (full rules), [worklog.md](worklog.md) (history).

## 4. How a page reaches the browser

```
Browser
  |  HTTPS
  v
Next.js on Vercel (Server Components)
  |  apiClient()  (server-side, API_BASE_URL)
  v
NestJS API on Railway
  |-- PostgreSQL (our cache of anime we served)
  '-- AniList / Jikan (only when the database lacks it or it is stale)
```

- Pages are Server Components. They call the API through `apiClient()` on the server; the browser does not call the API yet. [ADR 0017](decisions/0017-browser-data.md) (proposed) plans browser fetching: `browserApiClient()` (`createApiClient` on `<origin>/api`) calls same-origin `app/api/.../route.ts` handlers, and only those call `apiClient()`, which moves to a server-only file.
- `apiClient()` returns an `ApiResult`, never throws for expected failures ([ADR 0003](decisions/0003-web-api-client.md)). Its default is `no-store`; a call opts into Next caching with `next.revalidate` (or an explicit `cache`).
- The API serves anime from our database. A missing anime is imported on demand from AniList (the import source). Jikan (MyAnimeList) only fills gaps, such as score and rank, when it answers. Each source has its own rate limit. A cached anime expires after 7 days and is deleted if nobody opens it in 30 ([ADR 0006](decisions/0006-anime-data-sources.md), still proposed). We cache what visitors open; we never bulk-copy a source.
- Images are hotlinked from the source CDN with attribution. We do not re-host them (ADR 0006, decision 11).
- Hosting: web on Vercel, API and database on Railway ([ADR 0009](decisions/0009-hosting.md)).

## 5. Conventions in one page

- **Code rules.** The full list is in [CLAUDE.md](../CLAUDE.md). The short version: TypeScript strict, no `any`, logic in services (never controllers), validate at the boundary, derive the user from the auth token, inject `Clock` and `Random`, tests never call live APIs, every list endpoint is paginated with a max page size.
- **Error envelope.** Every API error is `{ "error": { "code": "QUIZ_NOT_FOUND", "message": "..." } }` with the right 4xx or 5xx. Why: [ADR 0002](decisions/0002-api-validation-and-errors.md).
- **ApiResult.** On the web, expected failures are values, not exceptions: [ADR 0003](decisions/0003-web-api-client.md).
- **Design tokens.** Colours, spacing and type come from [tokens.css](../apps/web/app/styles/tokens.css), not hard-coded values.
- **Motion.** Motion is part of the brand, but data pages stay calm and fast. Budgets and rules: [ADR 0011](decisions/0011-visual-and-motion.md). Library choices (Motion by default, GSAP only for showpiece moments) and `prefers-reduced-motion`: [ADR 0012](decisions/0012-ui-libraries-and-design-references.md).
- **Definition of done.** Tests pass, typecheck and lint have zero warnings, docs updated, small PR, edge cases listed (empty, single, boundaries, nothing found, dependency failure).

## 6. Crash courses

<details>
<summary>Next.js App Router</summary>

- A folder under `apps/web/app/` is a route. `page.tsx` is the page, `layout.tsx` wraps it, `error.tsx` and `not-found.tsx` handle failures.
- Components are Server Components by default: they run on the server and can fetch data. Add `'use client'` only for state, effects or browser APIs.
- Here, server code fetches through `apiClient()` and handles the `ApiResult` (success or failure) before rendering.
- `next dev` is started for you by `pnpm dev`. Project rules are in [.claude/rules/web.md](../.claude/rules/web.md). [apps/web/AGENTS.md](../apps/web/AGENTS.md) is a block generated by `next dev` that points at the Next docs.

</details>

<details>
<summary>NestJS modules</summary>

- A module (`anime.module.ts`) groups a controller, services and providers. `app.module.ts` imports them.
- The controller only maps HTTP to a service call and back. Business logic lives in the service.
- Input is validated at the boundary and errors leave as the shared envelope.
- External APIs sit behind an adapter in `sources/`; the service never calls them directly.
- Tests sit next to the code: `*.spec.ts` (unit, no database) and `*.integration.spec.ts` (real Postgres, `pnpm db:up` first). More in [.claude/rules/api.md](../.claude/rules/api.md).

</details>

<details>
<summary>Prisma migrations</summary>

- The schema is `apps/api/prisma/schema.prisma`. Each change becomes a new folder in `apps/api/prisma/migrations/`.
- Apply migrations locally with `pnpm db:migrate`. Production runs `prisma migrate deploy` before each API deploy.
- Never edit an applied migration. Add a new one.
- Make migrations additive (expand, then contract in a later PR) so the old code keeps working during a deploy.
- A failed migration blocks later deploys until it is resolved: see [deploy.md](deploy.md). Local database commands (`db:up`, `db:down`, `db:reset`, `db:logs`) are in [.claude/rules/database.md](../.claude/rules/database.md).

</details>

<details>
<summary>TanStack Query</summary>

- It fetches data in the browser and caches it, with loading and error states handled for you.
- Not adopted yet. [ADR 0017](decisions/0017-browser-data.md) is proposed and describes the plan (OTA-184). Until it is accepted, pages fetch on the server only.
- Once adopted, browser fetching still goes through `apiClient()`, and defaults live in one `QueryClient` config under `src/api/query/`.

</details>

## 7. Who and what to ask

Agents (full table in [.claude/skills/autopilot/SKILL.md](../.claude/skills/autopilot/SKILL.md)):

| Agent | What it does |
| --- | --- |
| `architect`, `ticket-writer` | Plan a feature, new module or data model; break work into tickets |
| `builder` | API, services, adapters, shared types |
| `ui-builder`, `design-critic` | UI and frontend, Design-ticket mockups; critique |
| `secure-builder` | Anything touching auth, sessions, tokens, payments, secrets |
| `explorer`, `boilerplate`, `pr-writer` | Search the code, renames, boilerplate, PR text |
| `test-writer` | Tests beyond the ones written with the code |
| `debugger` | Failing test, CI failure, bug |
| `security-reviewer` | Security audit (auth, input, secrets, third-party data, workflows) |
| `code-reviewer`, `db-migration-checker` | Code review; schema and migration review |
| `interviewer` | Interview-style coaching questions, only on `/review --coach` |

Where decisions and state live:

- **ADRs** in [decisions/](decisions/): why we chose what we chose.
- **[PROGRESS.md](PROGRESS.md)**: current state and next tasks. **[progress/](progress/)**: per-ticket notes, newer than PROGRESS.md.
- **[worklog.md](worklog.md)**: history. **[ROADMAP.md](ROADMAP.md)**: the plan to launch.
- **Linear** (team OTA): the ticket, its acceptance criteria and its discussion.
