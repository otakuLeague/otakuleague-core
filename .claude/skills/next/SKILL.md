---
name: next
description: Pick the next highest-priority task that fits the time available, restate its acceptance criteria and propose a short plan. Use as "/next 2h".
disable-model-invocation: true
argument-hint: "[hours available, default 2]"
---
Time available: $ARGUMENTS (default 2 hours if empty).

1. From `docs/PROGRESS.md` "Next 3 tasks" (and the notes in `docs/progress/`) and Linear project "v1 Launch" (current milestone first, then priority, skip anything blocked), pick ONE ticket that fits the time. A ticket bigger than the time: propose the slice that fits and say what's left.
2. Fetch only that ticket. Restate: goal (1 line), acceptance criteria (checklist), edge cases.
3. Plan in at most 8 bullets: files to touch (use the explorer subagent if you don't know where things are), tests to write, any ADR needed. Flag if it needs the architect subagent (new module or data model).
4. Create the branch `type/OTA-<n>-<short-name>` from an up-to-date main, set the ticket to In Progress.
5. Stop and wait for my "go" unless I said "go" in the arguments.
