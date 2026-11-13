# Vendored skill: web-design-guidelines

- Upstream repo (SKILL.md): https://github.com/vercel-labs/agent-skills, path skills/web-design-guidelines/SKILL.md, commit 1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62
- Upstream repo (guidelines.md): https://github.com/vercel-labs/web-interface-guidelines, path command.md, commit 434b7f91364665f2f733b310ec54809bf8f37937
- License, SKILL.md: MIT per the vercel-labs/agent-skills README; no LICENSE file upstream.
- License, guidelines.md: MIT, Copyright (c) 2025 Vercel Labs (LICENSE in this folder, from web-interface-guidelines).
- Vendored date: 2026-11-12
- Vendored in OTA-166

## Changes from upstream

- SKILL.md: "How It Works" step 1, "Guidelines Source" section and "Usage" step 1 changed to read the pinned `guidelines.md` in this folder instead of fetching the raw GitHub URL with WebFetch; "fetched guidelines" (2 places) changed to "pinned guidelines". Nothing else changed.
- guidelines.md: copied verbatim from command.md.
- Left out: install.sh (not copied), AGENTS.md, README.md.
