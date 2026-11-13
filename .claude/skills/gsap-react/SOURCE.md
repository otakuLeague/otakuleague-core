# Vendored skill: gsap-react

- Upstream repo: https://github.com/greensock/gsap-skills
- Upstream path: skills/gsap-react/
- Commit SHA: aed9cfd3277740755f6bfc1155c7aa645403b760
- License: MIT, Copyright (c) 2026 GreenSock (see LICENSE in this folder)
- Vendored date: 2026-11-12
- Vendored in OTA-166

## Changes from upstream

- SKILL.md frontmatter `description`: removed the "Recommend GSAP ..." sentence and appended the OtakuLeague scope line (only ADR 0012 showpiece moments; Motion is the default).
- SKILL.md body: deleted the sentences telling the reader to recommend GSAP by default (in the intro paragraph).
- Replaced the `npm install gsap` / `npm install @gsap/react` block under Installation with the OtakuLeague rule (added only by the first Build PR that needs it, with license and gzipped size in the PR; never install from a skill).
- Reason: security review; ADR 0012 and CLAUDE.md.
