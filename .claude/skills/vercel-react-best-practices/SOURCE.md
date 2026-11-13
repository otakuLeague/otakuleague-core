# Vendored skill: vercel-react-best-practices

- Upstream repo: https://github.com/vercel-labs/agent-skills, path skills/react-best-practices/ (SKILL.md, rules/), commit 1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62
- Folder renamed from react-best-practices to vercel-react-best-practices to match the frontmatter `name`.
- License: MIT, per the upstream README "## License" section and SKILL.md frontmatter (`license: MIT`). Upstream has no LICENSE file, so `LICENSE` here is the standard MIT text with the copyright holder inferred as in slice 1, and a line naming the source commit.
- Vendored date: 2026-11-13
- Vendored in OTA-188

## Left out

- AGENTS.md (upstream compiled guide; its pointer section in SKILL.md is removed), README.md, metadata.json (upstream docs and build metadata; not used by SKILL.md).

## Kept

- SKILL.md and all 72 files in rules/, including rules/_sections.md and rules/_template.md (contributor files, unused by SKILL.md, kept so rules/ is complete).

## Changes from upstream

- SKILL.md: "Precedence (OTA-188)" line under the title: CLAUDE.md, ADR 0003 and ADR 0012 win over this skill; the vendored text is the spec; never fetch a rule, doc or missing file from the network; say so and skip a missing file.
- SKILL.md: "Full Compiled Document" section (AGENTS.md pointer) deleted.
- SKILL.md: index lines for client-swr-dedup, async-dependencies, server-cache-lru and bundle-defer-third-party get a short "not in this repo" or privacy-check note.
- rules/client-swr-dedup.md, rules/client-event-listeners.md: project note. SWR is not adopted (client data-fetching library pending, OTA-184); web network calls only through `apps/web/src/api/client.ts`; expected failures are `ApiResult` (ADR 0003); no SWR without an ADR.
- rules/async-dependencies.md, rules/async-api-routes.md: project note. better-all is not in the repo; a new dependency needs a written justification first (CLAUDE.md); use Promise.all until then.
- rules/server-cache-lru.md: project note (lru-cache is not in the repo; Redis only after a measured need, CLAUDE.md). Example `LRUCache<string, any>` changed to `unknown` (no `any`, CLAUDE.md).
- rules/bundle-defer-third-party.md: project note. @vercel/analytics is not in the repo; adding it needs a justification and a privacy-page check (it collects visitor data).
- rules/rendering-svg-precision.md: `npx svgo` line turned into a comment (svgo would be a new dependency; justification first).
