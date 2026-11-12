---
name: ship
description: Finish the current task. Lint, typecheck, test, one review pass, conventional commit, push, PR, Linear update, progress note. Use when the task's acceptance criteria are met.
disable-model-invocation: true
---
Ship the current branch. Stop and tell me at the first step you can't fix in two attempts.

1. `pnpm lint`, `pnpm typecheck`, `pnpm test`; `pnpm test:integration` too if anything under `apps/api` touches the database (needs `pnpm db:up`). Fix failures. Summarise results in one line each; never paste logs.
2. Check the acceptance criteria of the Linear ticket one by one; list any not met and stop if one is.
3. One review pass: the code-reviewer subagent on `git diff main...HEAD`. Add db-migration-checker if `schema.prisma` or a migration changed, security-reviewer if auth, user input, secrets, third-party data or workflows changed. Fix every Critical; mention Warnings in the PR.
4. Docs: update the matching `.claude/rules/*.md`, `docs/architecture.md` or an ADR if behaviour or commands changed. Add a worklog entry only for decisions or incidents worth remembering.
5. Commit with a Conventional Commit message referencing the key, e.g. `feat(OTA-123): ...`. Message in a file with `git commit -F /abs/path`. No AI attribution (hooks enforce).
6. `git push -u origin <branch>`, then open the PR (`gh pr create` with a body file locally; GitHub MCP `create_pull_request` in cloud runs, where `gh pr` gets HTTP 403): Summary, Changes, Tests, Edge cases, Linear link. Keep PRs under ~400 lines; split if bigger. Before opening it, run `git diff --name-only --no-renames -z origin/main...HEAD -- | node scripts/deploy-order.mjs`; if it warns, split the work (API PR first) or add a `## Deploy order` section (prose, no `- [` list items) before `## Checklist` in the PR body explaining why both orders are safe (old web + new API, new web + old API).
7. Linear: move the ticket to In Review and link the PR.
8. Handoff (OTA-176, so parallel PRs never conflict): write `docs/progress/OTA-<n>.md` (≤ 15 lines: what changed, decisions, next steps, new blockers or bugs) instead of editing `docs/PROGRESS.md`. Then fold: if no other open PR changes `docs/PROGRESS.md`, rewrite it from scratch (≤ 40 lines, same sections) from the current state and the notes already on main, and delete those folded notes; otherwise leave it. Commit on the branch, push.
9. Reply in 4 lines (Context, Actions, Results, Learnings), then: "Run `/clear` before the next task."
