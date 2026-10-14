# Worklog
What I shipped, with numbers when possible: problem, what I did, what changed.

## 2026-10-14: Claude Code hooks, agents and plugins verified (OTA-81)
- Problem: the attribution and env-file protections were written from memory and never tested. During OTA-76 an agent appended `API_BASE_URL` to `.env` with a shell command, and the env hook (Edit/Write only) let it through. The attribution hook blocked a `gh pr view | grep` check (OTA-82 false positive).
- Found: against 60 sample hook calls, the old hooks failed 35. Every Bash write to an env file passed (redirect, `tee`, `sed -i`, `perl -i`, `cp`, `mv`, `rm`, `python`, `node`, a variable, `bash -c`). A missing `jq`, unreadable input, a script without its executable bit (exit 126) or a missing script (127) all allowed the call, because only exit 2 blocks. "generated with" also blocked text like "client generated with prisma".
- Did: protect-env checks Bash too, one simple command at a time; the attribution hook only reads commit and PR message text (`git commit`, `gh pr create/edit/comment/review`, including `-F` / `--body-file` files) and matches AI attribution only. Both fail closed: launched as `bash <script> || exit 2`, and they block when `jq` is missing. Tests in `pnpm test:hooks`, run in CI with the unit tests. pr-writer writes message text to a file and checks for real attribution lines only, not the word Claude.
- Verified live: the new hook blocked a Bash env write and a Write to a file named `.env` in a scratch folder. It also blocked one of my own commands whose heredoc text paired `.env` with `tee`, the known trade-off, hence the file-based messages.
- Security review: closed 3 more gaps (redirects to `"$ROOT"/.env` or paths with spaces, heredocs into `python3 -`/`node`, `tsx`/`bun`/`sponge`/`patch`; message files the hook cannot read now block) and added a git `commit-msg` hook as the backstop for attribution. It also caught a slowdown: bash 3.2 (macOS) took 8 s on a 200-line command naming `.env`, because of a `${var//[;|&]/...}` substitution; `tr` brings 2000 lines to 0.36 s. 78 tests.
- Linear: the ticket-writer subagent created OTA-88 through the connector, then it was canceled.
- Also found: the claude-mem plugin (user scope) runs 6 of its 7 hooks through Bun, which is not installed, so it fails silently on every prompt and session (exit 1 does not block). Not changed: it is a user-level choice.

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
