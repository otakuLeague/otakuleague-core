---
name: autopilot
description: One unattended build run. Picks the next v1 Linear ticket, designs or builds it, ships a PR and, if allowed, merges it when CI is green. Used by the scheduled autopilot task; can also be run by hand.
disable-model-invocation: true
---
You are running unattended: nobody will answer questions. Decide, record the decision, keep going. Follow CLAUDE.md and the token rules strictly; this run has a limited budget.

**You coordinate; agents do the work (OTA-162).** Hand each kind of work to its agent, which runs on its own model and effort (set in `.claude/agents/`). Never do an agent's work yourself, even when it looks small; if an agent fails twice, apply the stop rule.

| Work | Agent (model, effort) |
| --- | --- |
| Plan a feature, new module or data model; break work into tickets | `architect`, `ticket-writer` (Fable, high) |
| Build API, services, adapters, shared types | `builder` (Sonnet, medium) |
| Build UI and frontend; Design-ticket mockups | `ui-builder` (Opus, medium); critique: `design-critic` (Opus, medium) |
| Anything touching auth, sessions, tokens, payments, secrets | `secure-builder` (Opus, extra high) |
| Search the code, renames, boilerplate, PR text | `explorer`, `boilerplate`, `pr-writer` (Haiku, low) |
| Tests beyond the ones written with the code | `test-writer` (Sonnet, low) |
| Failing test, CI failure, bug | `debugger` (Opus, max) |
| Security audit (auth, input, secrets, third-party data, workflows) | `security-reviewer` (Fable, max) |
| Code review; schema and migration review | `code-reviewer`, `db-migration-checker` (Fable, high: never the model that wrote the code) |

Give each agent a brief with the goal, the ticket's acceptance criteria, the files to read and what to report back.

0. **Config:** read `docs/AUTOPILOT.md`. If `enabled: false`, reply "autopilot disabled" and stop. Read `docs/PROGRESS.md` and the handoff notes in `docs/progress/` (one per merged or open ticket). `git fetch origin main` and start from an up-to-date `main`.
   **Lock (runs start every hour):** in Linear project "v1 Launch", look for a ticket with label `autopilot` in state In Progress. Updated less than 90 minutes ago → another run is active: reply "another run is active" and stop. Older than 90 minutes → the previous run died (usually the usage limit): resume that ticket from its pushed branch instead of picking a new one.
1. **Fix before build:** list open PRs with the `autopilot` label (GitHub MCP `list_pull_requests`; `gh pr` commands get HTTP 403 in cloud runs, `gh api` works). If one has red CI or review comments from Farouk, first convert it to a draft (GitHub MCP `update_pull_request`, `draft: true`) so it can't merge on old ticks, then check out its branch, address them, push, re-review and update the checklist, mark it ready again only if every step is ticked (step 6), and stop after that (one thing per run). If open autopilot PRs ≥ `max_open_prs`, stop with a one-line note.
2. **Pick one ticket** in Linear project "v1 Launch": label `v1`, none of `skip_labels`, state Backlog/Todo, all `blockedBy` done; earliest milestone first, then priority. With `design_first`, Design tickets block their Build tickets in Linear, so the blockedBy rule already orders them; never start a Build ticket whose Design ticket is not Done. Tickets whose description needs human account steps (Railway, Vercel, DNS): add `needs-human` with a comment listing the exact steps, and pick another.
3. **Start:** ticket → In Progress, add the Linear label `autopilot`, comment "Autopilot run started". Branch `type/OTA-<n>-<short-name>`. Commit and push after every meaningful step (`wip(OTA-<n>): ...` is fine before the final commit), and comment progress on the ticket, so a run cut off by the usage limit loses nothing.
4. **Do the work:**
   - "Design:" tickets: `ui-builder` follows the `design` skill; `design-critic` reviews the screenshots; `ui-builder` fixes what it flags.
   - Everything else: `architect` writes the plan (≤ 8 bullets; plus an ADR for a new module or data model), using `explorer` for unknown areas. Then the builders implement it with tests: `builder` for the API and logic, `ui-builder` for pages and components, `secure-builder` for anything in the auth/payments row. Mechanical parts go to `boilerplate`; extra test coverage to `test-writer`; any red test or CI failure to `debugger`. Parity reference: `docs/PARITY.md`; read the old repo (`NasriFarouk/OtakuLeague`, attach read-only if needed) only for a specific file it points to.
   - Cross-app changes: `architect` plans them API-first and additive. If the deploy-order guard fires (see `ship` step 6), the PR body carries the `## Deploy order` section from `ship` (before `## Checklist`, prose, no `- [` list items), or the web half goes on the ticket as the next slice.
   - Too big for one PR (> ~400 lines)? Ship the first coherent slice, and note the rest on the ticket.
   - **Until the launch swap (2026-12-28) the goal is a cleaner-coded version of the old site:** build what PARITY.md lists for the page, no extra features beyond the ticket. Improvements and new features come after launch, page by page.
   - Creative liberty is welcome in design (better layouts, small extra touches), as long as every feature PARITY.md lists for that page still works. A product or taste question you can't settle from the ticket, PARITY.md, ADRs or mockups: pick the option you think makes the better product while keeping parity, write it under "Decisions" in the PR body, and add a Linear comment. Only add `needs-human` if both options are irreversible or expensive.
5. **Ship:** run the `ship` skill steps 1–8 (skip its step 9, the interactive reply). Open the PR as a **draft**; it stays a draft until step 6. Its review step is `code-reviewer` on every PR, plus `security-reviewer` when the auth/payments row or user input, secrets, third-party data or workflows changed, plus `db-migration-checker` when the schema changed. The PR body ends with:
   - **Agents:** which agent did each part.
   - **Checklist:** under a heading exactly `## Checklist`, one `- [ ] ` line per step of this skill (0–7) and of the `ship` skill (1–8), 16 lines. Done or "n/a" (with the reason) → ticked `- [x] `; "not done" (with the reason) → left unticked `- [ ] `. Never leave one out: the merge workflow merges only when all of them are ticked. Steps 6 and 7 are ticked when done, by editing the PR body (GitHub MCP `update_pull_request`) before the final reply.
   - **Page report**, when the ticket adds or changes a page (see step 7). Add the `autopilot` label to the PR (`gh api -X POST repos/otakuLeague/otakuleague-core/issues/<pr>/labels -f 'labels[]=autopilot'`).
6. **Hand over for merge (only if `automerge: true`):** never merge yourself, and don't add the `automerge` label (the cloud permission check refuses it). Finish the PR body first (steps 6 and 7 ticked). Then, if every checklist line is ticked and the reviews had no unresolved Critical, mark the PR ready (this is what makes it merge) for review (GitHub MCP `update_pull_request`, `draft: false`). The `Autopilot merge` workflow squash-merges a ready PR labelled `autopilot` whose 16 checklist lines are all ticked once every check is green and no protected path is touched (OTA-161, OTA-176). A step that is "not done" (unticked) leaves the PR a draft for Farouk. A PR that touches a protected path: mark it ready anyway, say in the PR body and the Linear comment that Farouk merges it. Ticket → In Review either way; the next run moves it to Done when the PR is merged.
7. **Report:** Linear comment on the ticket and a final reply, both ≤ 6 lines: what was done, PR link, merged or waiting, decisions taken, what the next run will pick.
   **Page report** (every ticket that adds or changes a page, Design or Build):
   - Screenshots at 1440 px and 390 px. Build tickets: the real page from the PR's `Screenshots` comment (marker `<!-- pr-screenshots -->`, one collapsed block per route, ADR 0013); the files are in the run's artifact (`gh run download <run-id> -n pr-screenshots`), and missing shots are explained in that run's job summary. Only if that comment is missing (no page files changed, or the job failed), the matching mockup screenshots, labelled "mockup, not the real page". Design tickets: the mockup screenshots.
   - "How it works", for a 5-year-old: at most 6 short sentences, no jargon, e.g. "You type the name of a show. We look in our big box of shows. We show you the ones that match, even if you used its nickname."
   - Put it in the PR body and in a Linear comment with the images uploaded (`prepare_file_upload`; if the upload fails, link the screenshots in the PR instead). No push notification for a page report.

**Notifications (Farouk, 2026-11-12):** send a PushNotification only when a run needs Farouk: a ticket marked `needs-human` or a question that blocks the work, a PR left as a draft because a step is "not done", a PR that touches a protected path (he merges it), a step that failed twice (stop rule), or the autopilot unable to run (access denied, `max_open_prs` reached). Nothing for routine progress or a PR that will merge on its own.

Next-run bookkeeping (start of step 1): autopilot tickets In Review whose PR is merged → Done.

Stop rules: never more than `tickets_per_run` tickets; never push to main directly; if the same step fails twice, stop, comment the failure on the ticket and leave the branch pushed.
