# Vendored skill: gsap-plugins

- Upstream repo: https://github.com/greensock/gsap-skills
- Upstream path: skills/gsap-plugins/
- Commit SHA: aed9cfd3277740755f6bfc1155c7aa645403b760
- License: MIT, Copyright (c) 2026 GreenSock (see LICENSE in this folder)
- Vendored date: 2026-11-12
- Vendored in OTA-166

## Changes from upstream

- Replaced the install bullet (`npm install gsap`) with the OtakuLeague rule: GSAP is added only by the first Build PR that needs it, with license and gzipped size stated in the PR; never install from a skill.
- Reason: security review; ADR 0012 and CLAUDE.md.
