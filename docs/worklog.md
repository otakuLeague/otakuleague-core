# Worklog
What I shipped, with numbers when possible: problem, what I did, what changed.

## 2026-10-14: Pinned tooling re-checked, Dependabot added (OTA-83)
- Problem: TypeScript was pinned to `~6.0.3` and ESLint to 9 because of upstream peer ranges, with a manual monthly re-check, and the SHA-pinned GitHub Actions never update on their own.
- Blockers today (npm registry, `npm view <pkg>@latest peerDependencies`, 2026-10-14):
  - TypeScript 7.0.2 (latest): `typescript-eslint@8.71.2` (latest) and its `@typescript-eslint/typescript-estree` allow `typescript >=4.8.4 <6.1.0`. Still blocked. 6.0.3 is already the newest 6.0.x.
  - `ts-jest` (allows `typescript <7`) is no longer a blocker: the API moved to Vitest in OTA-82 and it is in no `package.json` nor in `pnpm-lock.yaml`.
  - ESLint 10.12.0 (latest): `eslint-config-next@16.4.0` (latest) depends on `eslint-plugin-react@^7.37.0` (latest 7.37.5, peer `eslint ^3 … ^9.7`), `eslint-plugin-jsx-a11y@^6.10.0` (peer `^3 … ^9`) and `eslint-plugin-import@^2.32.0` (peer `^2 … ^9`). Still blocked. `typescript-eslint` and `eslint-plugin-react-hooks` already allow ESLint 10. `@eslint/js` 10 needs `eslint ^10`, so it stays on 9.39.5, which with `eslint` 9.39.5 is already the newest 9.x.
- Did: the one upgrade the blockers allow, `typescript-eslint` 8.71.1 → 8.71.2. The install left two copies (8.71.1 kept for `eslint-config-next`), the "Cannot redefine plugin" risk; `pnpm dedupe` brought it back to one, without overrides (it also merged the API's two `@sentry/node` entries into the one that resolves the optional peer `rollup`; no version changed). Full green after it: `install --frozen-lockfile`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:hooks`. Not upgrading ESLint for the API alone: two ESLint majors under one shared config is more to maintain than the upgrade is worth.
- Dependabot (`.github/dependabot.yml`), weekly: one PR for all GitHub Actions (workflows and the composite setup action, SHA pins and their version comments), and npm in three groups: `blocked-tooling` (typescript, eslint, @eslint/js, kept apart so their red PR blocks nothing else), minor+patch, and majors; npm releases wait 7 days (`cooldown`). It replaces the monthly manual re-check: CI's Lint job now runs `pnpm peers check` and `pnpm dedupe --check`, so a green `blocked-tooling` PR means the peer ranges allow it and nothing is duplicated. Patches of those three ride in that PR while it is red, so check them by hand.
- Found: after a lockfile change, the first `pnpm test` failed at startup with `ENOTEMPTY ... node_modules/.vitest-cache`: the API and web Vitest runs share that root cache and both cleared it at once. It passed on the next two runs; CI starts from a clean checkout, so it does not hit this.
- Unverified: Dependabot documents pnpm v7-v10, and this repo uses pnpm 12; the first npm run (Insights > Dependency graph > Dependabot) shows whether it works.

## 2026-10-14: Safe clean script after losing .env (OTA-89)
- Problem: a `git clean -fdX` typed in the terminal at 14:56 to clear build output deleted the root `.env` (gitignored by `.env*`). Found from the zsh history and creation times: every ignored folder was recreated after 14:56:24, `apps/web/.next` at 14:56:24 exactly by the running `next dev`. No Claude command touched it (253 Bash calls of the day checked), and the protect-env hook and deny rules only see Claude's tool calls. Two agent sessions then saw `.env` missing and worked around it for about an hour instead of reporting it.
- Did: `pnpm clean` (`scripts/clean.mjs`) deletes an explicit list of build output (every `node_modules`, with the Vitest caches inside, `dist`, `apps/web/.next`, `apps/web/tsconfig.tsbuildinfo`, `apps/web/next-env.d.ts`, `apps/api/src/generated`) and refuses the root, anything outside it, and any `.env*` path, checking the whole list before deleting anything. README and CLAUDE.md say to use it instead of `git clean -x` / `-X`. Claude deny rules now also cover `git stash -a` / `--all` / `-u` / `--include-untracked`. CLAUDE.md: a missing root `.env` is an incident to report, never a starting state. `pnpm lint` now also lints `scripts/` (the root is not part of `pnpm -r`).
- Tests: `pnpm test:scripts` runs the real `pnpm clean` in a temporary copy (never this repo) and checks the build output and caches are gone and `.env`, `.env.example`, `apps/web/.env.local` and sources are byte-identical; a second runs the script through a symlinked path; a third checks the refusals delete nothing. Each fails on a mutant (a path not deleted; the old entry-point guard, which exited 0 without deleting anything through a symlink, a bug the code review found; the env guard removed). 16 more deny cases in `pnpm test:hooks` (106), the 10 stash ones failing without the new rules. Live: `git stash -a` and `--include-untracked` denied in a throwaway repo, `git stash list` allowed.
- Not covered: a `git clean -X` typed by a human (personal shell guard, out of scope); `git -C dir stash`, clustered flags like `git stash -ka`; false positives on a stash message or path containing `-a` / `-u`.

## 2026-10-14: Sentry tunnel for browser errors (OTA-87)
- Problem: in Opera GX, browser errors never reached Sentry (`net::ERR_BLOCKED_BY_CLIENT` on `ingest.de.sentry.io`), so a share of production browser errors would be lost silently.
- Found: the SDK's built-in `tunnelRoute` (`@sentry/nextjs` 11.7.0) is a rewrite that takes the org and project from the query string: an open relay to any sentry.io project, with no size limit. Not used.
- Did: the browser SDK sends to `/hikari` on our origin; a route handler forwards only envelopes whose DSN matches `NEXT_PUBLIC_SENTRY_DSN` (host and project id), to a URL built from that DSN, up to 1 MiB read within 10 s, 20 at a time, without following redirects, with a 5 s timeout, and never throws. `fetch` is allowed in that one file (ADR 0003 addendum, lint test).
- Tests: 22 tunnel cases against a fake Sentry over real HTTP (forwarded unchanged with rate-limit headers, foreign project/host/port 403, 413 by header and by bytes read, 9 malformed shapes 400, no DSN 404, hanging Sentry 504 under 1 s with a 200 ms timeout, unreachable 502, redirect not followed 502, slow body 408, over the in-flight limit 503), and one browser-build test proving envelopes reach `/hikari` already scrubbed. Each guard was removed once to check its test fails.
- Reviews: the security review found nothing critical; its medium (no cap on concurrent or slow requests) and two lows (unread upstream body, redirects followed) are fixed, and the Origin check is left to the deploy ticket (proxy). The code review caught docs still saying only `client.ts` may call `fetch`, and a lint test picking its cases by position.
- Verified live: on a production build, valid 200 (forwarded), foreign 403, malformed 400, 1.1 MB 413, GET 405, no DSN 404. In headless Chrome on `/debug/client-error`, the click sent 3 envelopes to `/hikari` (all 200, all forwarded) and none to sentry.io.
- Pending: the Opera GX check with its blocker on (ticket test plan).

## 2026-10-14: Phase 0 (Foundation) summary (OTA-71 to OTA-86)
- Goal: a base where every later feature can be built, tested and shipped the same way, before any product code.
- Shipped:
  - Repo and decisions: merge rules, with a pre-push hook blocking direct pushes to main since the free plan cannot enforce it (OTA-71); core stack ADR 0001 (OTA-72).
  - Monorepo: pnpm workspaces with `apps/api`, `apps/web` and `packages/shared-types` (OTA-73).
  - Local Postgres 16 in Docker Compose with a dev and a test database, and `.env.example` (OTA-74).
  - API base: validated config, error envelope, request validation, `GET /health`, Swagger, Prisma wiring (OTA-75, ADR 0002).
  - Web: typed server-side API client (OTA-76, ADR 0003); layout, home page with the API health, error pages (OTA-86).
  - CI on every PR and push to main: lint, typecheck, unit, integration, build (OTA-77).
  - Integration tests against a real Postgres, one cloned database per test file (OTA-78, ADR 0005).
  - Sentry in the API, web server and browser, and JSON logs with a request id (OTA-79, ADR 0004).
  - API tests moved from Jest to Vitest (OTA-82); API dev restart on shared-types changes (OTA-84).
  - Claude Code hooks that fail closed and cover Bash, and a `git clean -x/-X` deny rule (OTA-81).
  - README and `docs/architecture.md` (OTA-80).
- Follow-ups left:
  - OTA-83: tooling pinned behind the latest versions (TypeScript 6.0, ESLint 9).
  - OTA-85: known API gaps to close before the first deployment.
  - OTA-87: a Sentry tunnel, so ad blockers don't hide browser errors.

## 2026-10-14: Claude Code hooks, agents and plugins verified (OTA-81)
- Problem: the attribution and env-file protections were written from memory and never tested. During OTA-76 an agent appended `API_BASE_URL` to `.env` with a shell command, and the env hook (Edit/Write only) let it through. The attribution hook blocked a `gh pr view | grep` check (OTA-82 false positive).
- Found: against 60 sample hook calls, the old hooks failed 35. Every Bash write to an env file passed (redirect, `tee`, `sed -i`, `perl -i`, `cp`, `mv`, `rm`, `python`, `node`, a variable, `bash -c`). A missing `jq`, unreadable input, a script without its executable bit (exit 126) or a missing script (127) all allowed the call, because only exit 2 blocks. "generated with" also blocked text like "client generated with prisma".
- Did: protect-env checks Bash too, one simple command at a time; the attribution hook only reads commit and PR message text (`git commit`, `gh pr create/edit/comment/review`, including `-F` / `--body-file` files) and matches AI attribution only. Both fail closed: launched as `bash <script> || exit 2`, and they block when `jq` is missing. Tests in `pnpm test:hooks`, run in CI with the unit tests. pr-writer writes message text to a file and checks for real attribution lines only, not the word Claude.
- Verified live: the new hook blocked a Bash env write and a Write to a file named `.env` in a scratch folder. It also blocked one of my own commands whose heredoc text paired `.env` with `tee`, the known trade-off, hence the file-based messages.
- Security review: closed 3 more gaps (redirects to `"$ROOT"/.env` or paths with spaces, heredocs into `python3 -`/`node`, `tsx`/`bun`/`sponge`/`patch`; message files the hook cannot read now block) and added a git `commit-msg` hook as the backstop for attribution. It also caught a slowdown: bash 3.2 (macOS) took 8 s on a 200-line command naming `.env`, because of a `${var//[;|&]/...}` substitution; `tr` brings 2000 lines to 0.36 s. 78 tests.
- Linear: the ticket-writer subagent created OTA-88 through the connector, then it was canceled.
- Also found: the claude-mem plugin (user scope) runs 6 of its 7 hooks through Bun, which is not installed, so it fails silently on every prompt and session (exit 1 does not block). Decision: disabled it. A plugin whose hooks fail on every event adds noise and no memory; re-enable it after installing Bun if it is wanted.
- Manual checks: the `/agents` wizard no longer exists in Claude Code (it now points to `.claude/agents/`). Verified instead with `ls .claude/agents/` (10 files) and by asking Claude to list its available subagent types: all 10 present. `/hooks` shows both hooks with `|| exit 2` and no claude-mem hooks. Ponytail is installed at user scope; `/ponytail-help`, `/ponytail lite` and `/ponytail full` respond.
- `git clean -x` / `-X` would delete the gitignored `.env` without naming it, so protect-env cannot see it. Added `permissions.deny` rules `Bash(git clean *x*)` and `Bash(git clean *X*)` in `.claude/settings.json` (deny holds in every permission mode). Verified live: `git clean -nx` and `-nX` (dry runs) denied, `git clean -nd` allowed. 12 more cases in `pnpm test:hooks` (90 total); the 8 deny cases fail without the rules. Not covered (documented limits of permission rules): anything between `git` and `clean` (`-C dir`, `-c key=val`, `--git-dir`), git aliases, `bash -c '...'`; also `git stash --all`, which moves ignored files out of the tree (recoverable with `git stash pop`). False positive: any `git clean` argument containing an x, e.g. `--exclude`.

## 2026-10-14: API dev restart on shared-types changes (OTA-84)
- Problem: unverified whether the API in `pnpm dev` picks up shared-types changes.
- Found: the web app always did (about 0.5 s). The API restarted only when shared-types' `.d.ts` changed: a JS-only change (same types, new behavior) left it serving the old code with no restart for 19+ s.
- Did: one-line fix to the API `dev` script: `nest start --watch --exec "node --watch-path=../../packages/shared-types/dist ..."`. Now every change reaches the API in about 1.2–1.5 s, one restart per build, also after a full rebuild that deletes `dist/` (macOS; Linux unverified, Docker could not pull a Node image); quick double edits (50/200/500 ms apart) always end on the last value.

## 2026-10-14: Integration tests against a real PostgreSQL (OTA-78)
- Problem: parallel test files could share rows in the one test database, nothing migrated it, and "unit" tests secretly needed Postgres.
- Did: one database per test file cloned from a template rebuilt and migrated each run, an advisory lock against overlapping runs, injectable `Clock`/`Random`, unit tests cut off from the database, CI Unit job without Postgres.
- Numbers: clone 15–60 ms per file; integration suite 1.6 s parallel vs 2.85 s serial (4 files). The isolation test fails 1/2 when both files are pointed at one shared database, in parallel and serial.

## 2026-10-14: Error tracking and structured logging (OTA-79)
- Problem: errors were invisible: text logs with no request id, nothing reported from the web app.
- Did: JSON logs with a request id on every request line (Nest's own logger, no new logging dependency), Sentry in the API, the web server and the browser, explicit scrubbing tested end to end (headers, cookies, query, body, emails, host name never reach Sentry).
- Numbers: browser JS +63 KB gzip with the Sentry SDK, cut to +41 KB by excluding tracing and debug code (all static chunks, compared with a build of main). Two reviews caught a ReDoS in the redaction (about 50 ms per crafted 16 KB path, now under 20 ms with a test) and unredacted DTO fields. A 500 still answers at once with Sentry hanging or unreachable (test bound: 3 requests under 1 s).
