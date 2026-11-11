# Autopilot settings

Read by the `/autopilot` skill at the start of every unattended build run. The cloud scheduled task "OtakuLeague autopilot" starts a run every hour; a run that hits the plan's usage limit simply stops, and the next run with quota resumes its ticket from the pushed branch. A Linear lock (ticket In Progress with label `autopilot`, updated < 90 min ago) keeps runs from overlapping. Edit and push to change its behaviour; no other setup needed.

```yaml
enabled: true          # false = every run stops immediately
automerge: true        # label the run's PR `automerge` when its review has no Critical; the workflow merges it
max_open_prs: 3        # stop opening new PRs when this many autopilot PRs are open
tickets_per_run: 1
design_first: true     # a "Build:" ticket waits until its "Design:" ticket is merged
skip_labels: [needs-human, post-launch]
```

## Rules the autopilot never breaks
- Never merges anything itself. The `Autopilot merge` workflow (`.github/workflows/autopilot-merge.yml`) squash-merges a PR labelled `automerge` once every check on its head commit is green.
- The workflow never merges a PR that touches a path in `.github/autopilot-protected-paths` (read from main): CI and workflows, git hooks, Claude settings, hooks and the autopilot skill, CLAUDE.md, this file, dependencies (`package.json`, the lockfile), deploy and Docker config, `.env*`. Those wait for Farouk.
- To stop merges: remove the `automerge` label, set `automerge: false` here, or disable the workflow in GitHub's Actions tab.
- Never touches `otakuleague.com` DNS, Vercel/Railway settings or secrets.
- `main` deploys only to beta.otakuleague.com until the launch cutover (OTA-149), so a bad merge is a revert, not an outage.
- When a ticket needs a product or taste decision it can't make, it comments the question on the Linear ticket, adds `needs-human`, and moves to the next ticket.

## Reviewing its work
Every autopilot PR has the `autopilot` label and a Linear comment. Ask for changes in a normal session: "change X on the home page" → `/next` picks it up as a new ticket.
