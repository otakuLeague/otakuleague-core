# OtakuLeague

All-in-one anime platform: anime data, watchlists, XP and leaderboards, later games and quizzes. Solo project, built like a real product. v1 (parity with the old otakuleague.com) launches **2026-12-28**: see docs/ROADMAP.md.

**Start every session with docs/PROGRESS.md** (current state, next tasks) and the per-ticket notes in `docs/progress/`, which are newer. Don't re-explore the repo to find out where we are.

## Stack (confirm with me before changing)
TypeScript strict, Next.js 16 web (`apps/web`), NestJS + Prisma API (`apps/api`), PostgreSQL 18 (Docker locally, real Postgres in tests), REST, pnpm monorepo, `packages/shared-types`. Modular monolith. Redis, queues or search engines only after a measured need. Free tools unless strictly necessary. Hosting: Vercel (web) + Railway (API, DB), ADR 0009.

## Map
- `apps/api/src/<module>/`: controller → service → adapters; `sources/` = external anime APIs (one adapter each).
- `apps/web/app/`: routes; `apps/web/src/`: client code; `src/api/client.ts` = the only network entry.
- `packages/shared-types/`: DTOs and guards shared by both apps.
- `docs/decisions/`: ADRs (read the relevant one before changing an area). `docs/architecture.md`, `docs/engineering-charter.md` (full rules), `docs/worklog.md` (history).
- `.claude/rules/*.md`: detailed notes per area, loaded automatically when you touch matching files.

## Commands
Node 24 (`nvm use`), pnpm 12.11.2.
- `pnpm install` · `pnpm dev` (API :3001, web :3000) · `pnpm build`
- `pnpm lint` (zero warnings) · `pnpm typecheck` · `pnpm test` (unit, no DB)
- `pnpm db:up` then `pnpm test:integration` (real Postgres) · `pnpm db:migrate`
- One package: `pnpm --filter @otakuleague/api test` · One file: `pnpm --filter @otakuleague/web exec vitest run <path>`
- `pnpm clean` to start fresh (never `git clean -x`/`-X`: deletes `.env`) · `pnpm test:hooks` after touching `.claude/`
- CI runs lint, typecheck, unit, integration, build on every PR and push to main.

## Token rules (follow them)
- Grep/Glob before Read; read targeted line ranges, not whole files. Never re-read a file you just edited.
- Wide or unfamiliar searches go to the `explorer` subagent, which returns conclusions, not file dumps.
- Plan (a few lines) before any multi-file change; use plan mode for anything non-trivial.
- One task per session. After `/ship`, tell me to `/clear`.
- Summarise logs and test output; never paste long output back.
- Don't run the full test suite after every edit: run the affected file or package, the full suite once in `/ship`.
- Formatting is done by a hook after each edit: never spend a turn on formatting.

## Workflow for a task (ADR 0010)
1. `/start` or `/next`: restate goal, acceptance criteria and a short plan. At most 3 clarifying questions.
2. Every task maps to a Linear ticket (team OTA). Branch `type/OTA-123-short-name`; commits reference the key.
3. Larger features (new module, data model change): architect subagent first, ADR in docs/decisions, then code.
4. Implement with tests alongside. Simplest design that works. Each kind of work goes to its agent, on its own model and effort (OTA-162): plan `architect` (Fable, high), build `builder` (Sonnet, medium), UI `ui-builder` (Opus, medium), auth/payments/secrets `secure-builder` (Opus, extra high), search/renames/boilerplate `explorer`/`boilerplate` (Haiku, low), tests `test-writer` (Sonnet, low), bugs `debugger` (Opus, max), security audit `security-reviewer` (Fable, max), review `code-reviewer` (Fable, high: never the model that wrote the code). Full table: `.claude/skills/autopilot/SKILL.md`.
5. `/ship`: lint, typecheck, tests, one code-reviewer pass (plus db-migration-checker if `schema.prisma` changed, security-reviewer if auth/input/secrets), commit, PR, Linear update, progress note in `docs/progress/` (PROGRESS.md is only rewritten when no other open PR changes it, OTA-176).
6. Stopping mid-task: `/wrap`.
7. Finish with a 4-line summary: Context, Actions, Results, Learnings.

## Definition of done
1. Tests cover the behavior and pass (run them, don't assume).
2. Typecheck and lint pass with zero warnings.
3. Docs updated (README, architecture, ADR, or the matching `.claude/rules` file).
4. Small, reviewable change (PR under ~400 lines) with a Conventional Commit message.
5. Edge cases considered and listed: empty, single item, boundaries, nothing found, dependency failure.
6. Complexity and trade-offs explainable in two sentences.

## Code rules
- No `any` (use `unknown` and narrow). Discriminated unions for states, never ambiguous booleans.
- Precise domain names (WatchlistEntry, QuizAttempt), never data/info/item.
- Small pure functions. Never mutate inputs.
- Validate at the boundary. Derive the current user from the auth token, never from the request body.
- Error envelope: `{ "error": { "code": "QUIZ_NOT_FOUND", "message": "..." } }` with correct 4xx/5xx.
- Business logic in services, never controllers. External providers behind interfaces; a source's API is only called from its adapter.
- Web network calls only through `apps/web/src/api/client.ts` (`apiClient()`); ESLint blocks the rest. Expected failures are `ApiResult`, never thrown (ADR 0003).
- Tests never call live APIs: recorded fixtures and local fakes. Inject `Clock` and `Random`.
- No dead code, no commented-out code, no TODO without a Linear ticket.
- Every list endpoint is paginated with a max page size.

## Never do
- Push to main, merge with red CI, force-push, rewrite main's history (pre-push hook and Claude hooks enforce).
- Add Co-Authored-By or any AI attribution to commits, PRs or code. Change git user.name/user.email.
- Edit `.env*` (except `.env.example`) or lockfiles by hand; edit an applied migration (add a new one).
- Log raw headers, bodies or query strings; put a secret in a URL.
- Add an MCP server, a paid service or a new dependency without saying why it pays for itself.

## Security
A missing root `.env` in Farouk's local checkout is an incident, never a starting state: stop, tell me what you saw and when, and do not recreate it, copy `.env.example` over it, or work around it with env vars until I answer (OTA-89). Exception: a fresh clone in a cloud session (the autopilot) never has `.env` (gitignored); that is expected, so work without it and never create one.
Secrets only in env vars; keep `.env.example` current. Check license and terms of every third-party data source and image before caching or using it (ADR 0006).
