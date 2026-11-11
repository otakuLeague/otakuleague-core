# 0010: Solo dev workflow with Claude Code, tuned for token cost

Status: accepted (2026-10-31, OTA-132). The **Models** bullet is superseded by OTA-162 (2026-11-11): each kind of work goes to its agent with a fixed model and effort, see `.claude/skills/autopilot/SKILL.md`. Supersedes the "Workflow for any task" steps that sent every task through five subagents.

## Context
About 10 hours a week until the 2026-12-28 launch, on a Claude Max plan that ran out fast on earlier attempts. The old workflow ran architect → test-writer → code-reviewer → pr-writer → interviewer for every task, all on the main model, each starting from zero and re-reading files. `CLAUDE.md` was ~14 KB and loaded in full every session.

## Decision
- **Context:** `CLAUDE.md` stays under ~120 lines. Detail that only matters for some files lives in `.claude/rules/*.md` with `paths:` frontmatter (loaded only when Claude touches matching files). Session state lives in `docs/PROGRESS.md` (≤ 40 lines, rewritten each session), so a fresh session reads one file instead of exploring.
- **Models:** main session `opusplan` (Opus while planning, Sonnet while executing). Read-only and mechanical agents run on Haiku or Sonnet with `maxTurns`; only the architect and debugger stay on Opus.
- **Subagents only when they pay:** one review pass per PR (code-reviewer; security-reviewer only for auth, input, secrets; db-migration-checker only for schema changes). Test writing happens in the main session alongside the code. The interviewer is opt-in (`/review --coach`), not automatic.
- **Daily loop as skills:** `/start`, `/next`, `/ship`, `/wrap`, `/bug`, `/review`, `/roadmap` in `.claude/skills`.
- **Deterministic work in hooks, not tokens:** Prettier and ESLint `--fix` after each edit, guards for env files, lockfiles, force-pushes and attribution, a macOS notification when Claude waits.
- **Unattended runs:** nightly and Sunday digests via launchd and `claude -p --model haiku --max-turns --max-budget-usd`, read-only tools, writing a short Markdown file. Optional `claude-ok` GitHub label for small tickets via the Claude Code GitHub Action on the Max subscription (OAuth token).
- **No MCP servers in the project.** `gh`, `pnpm`, `curl` cover it; Linear is reached through the connector already in the account. Playwright stays a dev dependency driven from tests, not an MCP.

## Consequences
- A typical session loads roughly a quarter of the old instructions, and one review agent instead of four.
- Less ceremony per task. Quality relies on CI, the definition of done and the single review pass; the charter is unchanged.
- The digests use a small slice of plan usage each night (Haiku, a handful of turns); `--max-turns` and `--max-budget-usd` cap a bad run.

## Learnings
Every subagent call is a fresh context: delegate to save the main context, not by habit.
