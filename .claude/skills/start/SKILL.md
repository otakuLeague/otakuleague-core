---
name: start
description: Session briefing. Reads docs/PROGRESS.md and the top of the Linear backlog, then gives a 5-line briefing. Use at the start of a work session.
disable-model-invocation: true
allowed-tools: Read Bash(git status *) Bash(git log *) Bash(git branch *) Bash(gh pr list *) Bash(gh pr checks *) Bash(gh api repos/otakuLeague/otakuleague-core/*)
---
Brief me on where we are. Keep it cheap: read nothing else unless something below is contradictory.

1. Read `docs/PROGRESS.md`.
2. `git status --short --branch` and `git log --oneline -5`.
3. Open PRs and their CI: `gh api repos/otakuLeague/otakuleague-core/pulls --jq '.[] | "#\(.number) \(.title) [\(.head.ref)]"'`.
4. Linear (team OTA, project "v1 Launch"): the in-progress issues and the next 3 by milestone then priority. If the Linear tools aren't available, use PROGRESS.md and say so in one line.
5. Today's date vs the current milestone in `docs/ROADMAP.md`.

Reply in exactly 5 lines:
- **Where:** milestone, days left in it, on track / behind.
- **Last time:** one line.
- **Today:** the single task I should do (key + title), and why.
- **Risks:** red CI, blockers, open PRs waiting on me, or "none".
- **Next:** `/next <hours>` to plan it.
