# Vendored skill: react-best-practices

- Upstream repo: https://github.com/vercel-labs/agent-skills, path skills/react-best-practices/ (SKILL.md, rules/), commit 1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62
- License: MIT per the vercel-labs/agent-skills README ("## License: MIT"). No LICENSE file upstream, so none is vendored here.
- Vendored date: 2026-11-13
- Vendored in OTA-188

## Changes from upstream

- SKILL.md: the `client-swr-dedup` line now says SWR is not adopted here (see the project note in the rule).
- rules/client-swr-dedup.md, rules/client-event-listeners.md: added a project note under the title: SWR is not adopted yet (client data-fetching pending, OTA-184), web network calls only through `apps/web/src/api/client.ts`, expected failures are `ApiResult` (ADR 0003), no SWR without an ADR. The rule text is otherwise unchanged.
- rules/rendering-svg-precision.md: `npx svgo ...` replaced by a comment that svgo would be a new dependency and needs a justification first (CLAUDE.md), with the command kept as a comment.
- Left out: AGENTS.md, README.md, metadata.json (upstream docs and build metadata, not used by SKILL.md). Kept: SKILL.md and all 72 rules/ files, including rules/_sections.md and rules/_template.md (contributor files in rules/, unused by SKILL.md; copied so the rules folder is complete). 73 files in total.
