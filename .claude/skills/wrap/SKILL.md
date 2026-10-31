---
name: wrap
description: Save exact state when stopping mid-task. Rewrites docs/PROGRESS.md with WIP details and commits WIP to the feature branch. Use when I say I'm stopping.
disable-model-invocation: true
---
I'm stopping mid-task. Save everything so the next session can continue without exploring.

1. If on `main`, create a branch `wip/OTA-<n>-<name>` first. Never commit WIP to main.
2. Rewrite `docs/PROGRESS.md` (≤ 40 lines). Under "In progress" be precise: ticket, branch, what is done, what is half-done (file and function), the exact next step, failing tests and why, decisions made in this session and anything I said that isn't written anywhere else.
3. `git add -A` (env files and lockfile edits are blocked by hooks), commit `wip(OTA-<n>): <what>` with `git commit -F /abs/path --no-edit`. Don't run the full test suite.
4. `git push -u origin <branch>` so the state survives this machine.
5. Linear: add a one-paragraph comment to the ticket with the same next step.
6. Reply in 2 lines: where the state is saved, and the first command for next time (`/start`).
