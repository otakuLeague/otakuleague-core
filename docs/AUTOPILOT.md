# Autopilot settings

Read by the `/autopilot` skill at the start of every unattended build run. The cloud scheduled task "OtakuLeague autopilot" starts a run every hour; a run that hits the plan's usage limit simply stops, and the next run with quota resumes its ticket from the pushed branch. A Linear lock (ticket In Progress with label `autopilot`, updated < 90 min ago) keeps runs from overlapping. Edit and push to change its behaviour; no other setup needed.

```yaml
enabled: true          # false = every run stops immediately
automerge: true        # label the run's PR `automerge` when its review has no Critical; the workflow merges it
max_open_prs: 6        # stop opening new PRs when this many autopilot PRs are open (OTA-175: Farouk merges each PR himself)
tickets_per_run: 3     # tickets per hourly run; a run skips tickets that wait on an open PR and stops early when only blocked work is left (Farouk, 2026-11-15)
design_first: true     # a "Build:" ticket waits until its "Design:" ticket is merged
skip_labels: [needs-human, post-launch]
```

## Rules the autopilot never breaks
- Never merges anything itself. The `Autopilot merge` workflow (`.github/workflows/autopilot-merge.yml`) squash-merges a PR labelled `automerge`, or a ready-for-review PR labelled `autopilot` opened by Farouk's account whose `## Checklist` lines are all ticked (OTA-176), once every check on its head commit is green. The autopilot keeps its PR a draft until the checklist is final and marks it ready only when every step is ticked: for an autopilot PR, "ready for review" means "merge when green". A step "not done" stays unticked and keeps the PR a draft for Farouk.
- The workflow never merges a PR that touches a path in `.github/autopilot-protected-paths` (read from main): only that file and the merge workflow itself, so the autopilot can't change the rule that checks its own PRs. Everything else, including migrations, dependencies, CI, `.claude/` and CLAUDE.md, merges on its own once CI is green and the Fable reviews have no Critical: `db-migration-checker` for migrations, `security-reviewer` for workflows, dependencies, `.claude/`, CLAUDE.md, `scripts/`, configs and deploy files (Farouk, 2026-11-16, OTA-202). Only labels added by Farouk's account count.
- A PR that needs Farouk to do something outside the repo before it can deploy safely (a new secret or setting on Railway or Vercel, DNS, a third-party account) stays a draft until he says it's done.
- To stop merges: convert the PR to a draft, remove its `automerge`/`autopilot` label, set `automerge: false` here (new PRs stay drafts; a PR already marked ready still merges), or disable the workflow in GitHub's Actions tab.
- Until the launch swap (no fixed date; Farouk decides, OTA-149): a cleaner-coded version of the old site, parity first; improvements and new features after launch, page by page.
- Pings Farouk only when it needs him to do something outside the repo (Railway, Vercel, DNS, secrets, a third-party account), or when the autopilot can't run at all (access lost). Everything else (drafts, failures, page reports, a full queue) goes to the PR and Linear only (Farouk, 2026-11-16).
- Never touches `otakuleague.com` DNS, Vercel/Railway settings or secrets.
- `main` deploys only to beta.otakuleague.com until the launch cutover (OTA-149), so a bad merge is a revert, not an outage.
- It coordinates and hands each kind of work to its agent, each on its own model and effort (OTA-162, table in the skill). Code is always reviewed by a different model than the one that wrote it.
- Every PR lists which agent did what and a checklist of every workflow step; a PR with a step "not done" stays a draft and never merges on its own.
- After each page it adds or changes, it sends a page report: desktop and mobile screenshots plus a "how it works" a 5-year-old understands (PR body, Linear comment, push and email).
- Creative liberty in design and features is fine as long as everything in docs/PARITY.md for that page still works. A decision it can't make and that is irreversible or expensive: it comments the question on the Linear ticket, adds `needs-human`, and moves to the next ticket.

## Reviewing its work
Every autopilot PR has the `autopilot` label and a Linear comment. Ask for changes in a normal session: "change X on the home page" → `/next` picks it up as a new ticket.
