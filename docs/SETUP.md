# How this repo runs itself (user manual)

## Your daily loop (on the Mac, in Claude Code at the repo root)
`/start` → `/next 2h` → say "go" → work with Claude → `/ship` → `/clear`.
Stopping early: `/wrap` (saves state to `docs/PROGRESS.md`, pushes a WIP branch).
Also: `/bug <what's wrong>`, `/review` (`--coach` for interview questions), `/roadmap`, `/design <OTA-key>`.
Model: `opusplan` for your own session; each kind of work goes to its agent with a fixed model and effort (OTA-162, table in `.claude/skills/autopilot/SKILL.md`). The status line shows model · context % · 5-hour plan usage · branch; at 50 % think `/compact`, at 70 % `/clear`.

## What runs without you
| What | When | Where | Cost |
|---|---|---|---|
| **Autopilot builder** (cloud scheduled task "OtakuLeague autopilot") | every hour; stops when plan usage runs out, resumes when it's back | Anthropic cloud, works with the Mac off | Max plan usage; one ticket per run |
| Nightly digest (`scripts/autopilot/nightly.sh`, launchd) | 06:47 daily (on wake if asleep) | `~/OtakuLeague/digests/YYYY-MM-DD.md` + notification | Checks free; one capped Haiku call |
| Sunday review (`weekly.sh`, launchd) | Sun 18:13 | `~/OtakuLeague/digests/weekly-YYYY-MM-DD.md` | One capped Sonnet call |
| CI (GitHub Actions) | every PR and push to main | GitHub | free |
| Dependabot | weekly | PRs | free |
| Deploys (after OTA-133/134) | merge to main → beta.otakuleague.com; PR → Vercel preview | Vercel, Railway | ADR 0009 |
| Claude GitHub Action (optional) | `claude-ok` label on a GitHub issue, or `@claude` comment | GitHub | Max plan usage |
| Hooks | every Claude edit / command | local | zero tokens |

## Reviewing the autopilot
It picks tickets from Linear "v1 Launch" in dependency order (each Design ticket blocks its Build ticket), opens PRs labelled `autopilot`, and merges its own PR when CI is green and the review has no Critical (see `docs/AUTOPILOT.md` for the paths it never merges). Designs land as mockups + screenshots in `docs/design/<page>/`.
To change something: open a session and say what you want ("make the home hero calmer"), or comment on the PR; the next run fixes PRs with your comments first. Tickets it can't do alone get `needs-human`.

## Pause or adjust
- Autopilot: set `enabled: false` (or `automerge: false`) in `docs/AUTOPILOT.md` and push; or pause the scheduled task in claude.ai → Code → scheduled tasks.
- Digests: `touch ~/.otakuleague/paused` (delete to resume); remove with `scripts/autopilot/uninstall-mac.sh`.
- Notifications: `OTAKU_NOTIFY=0` in your shell.
- Claude GitHub Action: remove the `CLAUDE_CODE_OAUTH_TOKEN` secret or delete `.github/workflows/claude.yml`.

## One-time setup on the Mac (~10 min)
1. `git pull && pnpm install` (also enables the git hooks).
2. `brew install jq gh && gh auth login` if missing.
3. `scripts/autopilot/install-mac.sh --run-now --with-design` (installs the digests, runs one now, installs Chromium for design screenshots).
4. Optional: in Claude Code, `/plugin marketplace add pbakaus/impeccable` and install Impeccable (ADR 0011); add `"env": {"DO_NOT_TRACK": "1"}` to `~/.claude/settings.json`.
5. Optional: `claude setup-token` and save it as the repo secret `CLAUDE_CODE_OAUTH_TOKEN` to enable the GitHub Action.

## Human-only tickets
OTA-133 (Railway account + card) and OTA-134 (Vercel import + DNS record for beta.otakuleague.com). ~15 min each; the autopilot prepares the config files.

## Parallel sessions
For two independent tasks at once: `git worktree add ../ol-OTA-123 -b feat/OTA-123-x` and open a second Claude Code session there. Don't run two `pnpm test:integration` at the same time (they share the test database).
