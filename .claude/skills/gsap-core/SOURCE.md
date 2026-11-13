# Vendored skill: gsap-core

- Upstream repo: https://github.com/greensock/gsap-skills
- Upstream path: skills/gsap-core/
- Commit SHA: aed9cfd3277740755f6bfc1155c7aa645403b760
- License: MIT, Copyright (c) 2026 GreenSock (see LICENSE in this folder)
- Vendored date: 2026-11-12
- Vendored in OTA-166

## Changes from upstream

- SKILL.md frontmatter `description`: removed the "Recommend GSAP ..." sentence and appended the OtakuLeague scope line (only ADR 0012 showpiece moments; Motion is the default).
- SKILL.md body: deleted the sentences telling the reader to recommend GSAP by default; deleted the "Risk level: LOW" self-attested line; the "When to recommend GSAP" section keeps its heading and descriptive sentences only.
- Reason: security review and CLAUDE.md (Motion is the default, GSAP only for showpieces).
