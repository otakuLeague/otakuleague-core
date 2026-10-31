---
name: review
description: Review the current diff for bugs, security, performance and accessibility with the reviewer subagents. Add --coach for interview-style questions.
disable-model-invocation: true
argument-hint: "[--coach]"
---
Review `git diff main...HEAD` (or the staged diff if on main). Arguments: $ARGUMENTS

1. Run the code-reviewer subagent on the diff. Add security-reviewer if the diff touches auth, user input, secrets, headers or third-party data; db-migration-checker if it touches `schema.prisma` or migrations; design-critic if it changes UI in `apps/web/app` or styles.
2. Also check yourself, briefly: accessibility of changed UI (labels, focus, contrast, keyboard), performance (N+1 queries, unpaginated lists, client bundles, images without sizes), and the definition of done in CLAUDE.md.
3. Merge the findings into one list: Critical / Warnings / Suggestions, each with `path:line` and a concrete fix. No praise.
4. Ask whether to fix the Criticals now.
5. Only if `--coach` was given: run the interviewer subagent afterwards.
