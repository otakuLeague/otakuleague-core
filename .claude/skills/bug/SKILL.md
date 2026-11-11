---
name: bug
description: Fix a bug test-first. Reproduce, write a failing test, fix, ship. Use as "/bug <description>".
disable-model-invocation: true
argument-hint: "<what is wrong>"
---
Bug: $ARGUMENTS

1. Find or create the Linear ticket (label Bug, project "v1 Launch", current milestone) with steps to reproduce. Branch `fix/OTA-<n>-<name>`.
2. Locate the cause with targeted greps; use the explorer subagent for a wide search, the debugger subagent only if it isn't clear after one look.
3. Reproduce it: write the smallest failing test (unit if possible, integration if it needs Postgres). Run it and confirm it fails for the right reason.
4. Fix the cause, not the symptom. Run the test, then the affected package's tests.
5. List related edge cases and cover the important ones.
6. Run `/ship` steps 1–9.
