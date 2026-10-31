# Autopilot settings

Read by the `/autopilot` skill at the start of every unattended build run (cloud scheduled task). Edit and push to change its behaviour; no other setup needed.

```yaml
enabled: true          # false = every run stops immediately
automerge: true        # merge the run's own PR when CI is green and the review has no Critical
max_open_prs: 3        # stop opening new PRs when this many autopilot PRs are open
tickets_per_run: 1
design_first: true     # a "Build:" ticket waits until its "Design:" ticket is merged
skip_labels: [needs-human, post-launch]
```

## Rules the autopilot never breaks
- Never merges a PR that changes `.github/workflows/`, `.claude/settings.json`, `.claude/hooks/`, `.githooks/`, `docs/AUTOPILOT.md` or production deploy config: those wait for Farouk.
- Never touches `otakuleague.com` DNS, Vercel/Railway settings or secrets.
- `main` deploys only to beta.otakuleague.com until the launch cutover (OTA-149), so a bad merge is a revert, not an outage.
- When a ticket needs a product or taste decision it can't make, it comments the question on the Linear ticket, adds `needs-human`, and moves to the next ticket.

## Reviewing its work
Every autopilot PR has the `autopilot` label and a Linear comment. Ask for changes in a normal session: "change X on the home page" → `/next` picks it up as a new ticket.
