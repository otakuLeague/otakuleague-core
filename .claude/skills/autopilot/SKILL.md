---
name: autopilot
description: One unattended build run. Picks the next v1 Linear ticket, designs or builds it, ships a PR and, if allowed, merges it when CI is green. Used by the scheduled autopilot task; can also be run by hand.
disable-model-invocation: true
---
You are running unattended: nobody will answer questions. Decide, record the decision, keep going. Follow CLAUDE.md and the token rules strictly; this run has a limited budget.

0. **Config:** read `docs/AUTOPILOT.md`. If `enabled: false`, reply "autopilot disabled" and stop. Read `docs/PROGRESS.md`. `git fetch origin main` and start from an up-to-date `main`.
   **Lock (runs start every hour):** in Linear project "v1 Launch", look for a ticket with label `autopilot` in state In Progress. Updated less than 90 minutes ago → another run is active: reply "another run is active" and stop. Older than 90 minutes → the previous run died (usually the usage limit): resume that ticket from its pushed branch instead of picking a new one.
1. **Fix before build:** list open PRs with the `autopilot` label (GitHub MCP `list_pull_requests`; `gh pr` commands get HTTP 403 in cloud runs, `gh api` works). If one has red CI or review comments from Farouk, check out its branch, address them, push, and stop after that (one thing per run). If open autopilot PRs ≥ `max_open_prs`, stop with a one-line note.
2. **Pick one ticket** in Linear project "v1 Launch": label `v1`, none of `skip_labels`, state Backlog/Todo, all `blockedBy` done; earliest milestone first, then priority. With `design_first`, Design tickets block their Build tickets in Linear, so the blockedBy rule already orders them; never start a Build ticket whose Design ticket is not Done. Tickets whose description needs human account steps (Railway, Vercel, DNS): add `needs-human` with a comment listing the exact steps, and pick another.
3. **Start:** ticket → In Progress, add the Linear label `autopilot`, comment "Autopilot run started". Branch `type/OTA-<n>-<short-name>`. Commit and push after every meaningful step (`wip(OTA-<n>): ...` is fine before the final commit), and comment progress on the ticket, so a run cut off by the usage limit loses nothing.
4. **Do the work:**
   - "Design:" tickets: follow the `design` skill.
   - Everything else: plan in ≤ 8 bullets (use the explorer subagent for unknown areas; the architect subagent + an ADR for a new module or data model), then implement with tests. Parity reference: `docs/PARITY.md`; read the old repo (`NasriFarouk/OtakuLeague`, attach read-only if needed) only for a specific file it points to.
   - Too big for one PR (> ~400 lines)? Ship the first coherent slice, and note the rest on the ticket.
   - A product or taste question you can't settle from the ticket, PARITY.md, ADRs or mockups: pick the option closest to the old site's behaviour, write it under "Decisions" in the PR body, and add a Linear comment. Only add `needs-human` if both options are irreversible or expensive.
5. **Ship:** run the `ship` skill steps 1–8. Add the `autopilot` label to the PR (`gh api -X POST repos/otakuLeague/otakuleague-core/issues/<pr>/labels -f 'labels[]=autopilot'`).
6. **Hand over for merge (only if `automerge: true`):** never merge yourself. If the review had no unresolved Critical and the diff touches nothing in `.github/autopilot-protected-paths`, add the `automerge` label (same `gh api` call, `labels[]=automerge`). The `Autopilot merge` workflow squash-merges it once every check is green (OTA-161). Ticket → In Review either way; the next run moves it to Done when the PR is merged. A PR that touches a protected path gets no `automerge` label: say so in the PR body and the Linear comment.
7. **Report:** Linear comment on the ticket and a final reply, both ≤ 6 lines: what was done, PR link, merged or waiting, decisions taken, what the next run will pick.

Next-run bookkeeping (start of step 1): autopilot tickets In Review whose PR is merged → Done.

Stop rules: never more than `tickets_per_run` tickets; never push to main directly; if the same step fails twice, stop, comment the failure on the ticket and leave the branch pushed.
