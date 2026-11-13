# Vendored skill: vercel-react-view-transitions

- Upstream repo: https://github.com/vercel-labs/agent-skills
- Upstream path: skills/react-view-transitions/ (SKILL.md and references/ only)
- Commit SHA: 1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62
- License: MIT, stated in the upstream README "## License" section and in SKILL.md frontmatter (`license: MIT`). The copyright holder line in LICENSE ("Vercel, Inc.") is inferred because upstream has no LICENSE file; the LICENSE in this folder is the standard MIT text.
- Vendored date: 2026-11-12
- Vendored in OTA-166

## Changes from upstream

- references/nextjs.md: the two lines that read the live Next.js guide and grep node_modules replaced with the OtakuLeague rule (Next pinned in apps/web/package.json; no doc fetch, no node_modules read).
- SKILL.md: the "implement all applicable patterns" / "every pattern that fits the app" sentences and the "start with the audit" sentence replaced with: build only the transitions the ticket names; skip the full-app audit.
- SKILL.md: deleted the "Full Compiled Document" section pointing to AGENTS.md (left out).
- references/implementation.md: the Step 1 audit scan ("scan the codebase thoroughly ... Open every file") replaced with the same OtakuLeague rule.
- Reason: security review and CLAUDE.md (scope to the ticket; no full-app audit, no runtime doc fetch).
- Files left out: AGENTS.md (compiled duplicate of SKILL.md plus references), README.md, metadata.json, and the .zip. The skill name in SKILL.md frontmatter is unchanged.
