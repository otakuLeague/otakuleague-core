---
paths:
  - "package.json"
  - "**/package.json"
  - "pnpm-workspace.yaml"
  - "pnpm-lock.yaml"
  - ".nvmrc"
  - ".github/**"
  - ".claude/**"
  - ".githooks/**"
  - "scripts/**"
  - "packages/shared-types/**"
  - "**/eslint.config.mjs"
  - "**/tsconfig*.json"
---
# Tooling, scripts, CI and Dependabot (moved from CLAUDE.md)

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
- `Screenshots` (`.github/workflows/screenshots.yml`, OTA-163, ADR 0013): on PRs touching web, API, shared-types or `scripts/screenshots`, builds both apps against `scripts/screenshots/fake-sources.mjs` (replay of the recorded fixtures), captures `routes.json` with a Playwright 1.63.0 installed outside the repo, and a write-token `publish` job (no repo code, artifact treated as hostile) pushes the allowlisted PNGs to `screenshots/pr-<n>` and updates one PR comment built from their file names; failures go to the capture job summary. Edit `routes.json` to add a page (max 8, names `[a-z0-9-]{1,60}`). `node --test "scripts/*.test.mjs"` covers the replay, the summary and the publish job's shell steps (run from the workflow file against a hostile artifact and a fake `gh`).
- `Autopilot merge` (`.github/workflows/autopilot-merge.yml`, OTA-161) squash-merges a same-repo PR labelled `automerge`, or a ready-for-review PR labelled `autopilot` whose `## Checklist` has no "not done" (OTA-176; both labels must be added by `ALLOWED_LABELERS`), once every check on its head commit passed and no file matches `.github/autopilot-protected-paths` (read from main). It never checks out PR code. Its merges don't start CI on main (GITHUB_TOKEN loop guard); the PR head already passed CI.
- Dependabot (`.github/dependabot.yml`) opens grouped PRs weekly: GitHub Actions (SHA pins), and npm as `blocked-tooling` (typescript, eslint, @eslint/js, held back by upstream peer ranges, see the OTA-83 worklog entry), minor+patch, and majors. After a dependency change, check typescript-eslint is installed once (`pnpm why typescript-eslint -r`); two copies break web lint with "Cannot redefine plugin", and `pnpm dedupe` fixes it.
- `@types/node` follows the Node major in `.nvmrc` (24): Dependabot ignores its major updates, so bump it by hand in the same PR as a Node upgrade (`.nvmrc`, `engines`, CI). Its minor and patch updates still come weekly.
