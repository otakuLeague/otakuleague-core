# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-12

## Current milestone
W2 Anime page + search. Done: OTA-152 shell, OTA-97 anime page shell, OTA-100 slice 1 (#58). Merged: OTA-176 hands-off merge (#61), OTA-172 season id route (#57), OTA-153 Home design (#59), OTA-171 design direction (#56). Open: OTA-98 slice 1 (#62, migration, Farouk merges); OTA-135 slice 1 (catalog lists, migration, Farouk merges).

## Last session
OTA-176 (merged): `Autopilot merge` also merges a ready PR labelled `autopilot` once its `## Checklist` has no "not done", CI is green and no protected path changed; `automerge` still works. The autopilot opens PRs as drafts and marks them ready when the checklist is final. Each PR writes `docs/progress/OTA-<n>.md`; `/ship` folds them here only when no other open PR changes this file. Farouk (2026-11-12): until the launch swap, build a cleaner-coded version of the old site (parity, no extras); improvements page by page after launch.

## In progress
- OTA-135 slice 1 (this PR's note in `docs/progress/OTA-135.md`): `GET /anime/lists/:kind`, page cache `anime_list_page`. Slices 2 and 3 not started.
- OTA-98 slice 1 (#62): waiting on Farouk's merge.
- OTA-152 remaining slices: 2b member state, mobile sheet + search (Base UI, `package.json` → Farouk merges), hide shell on `/auth*` and `/onboarding`, 404/500 restyle, social icons.
- OTA-100 slice 1 (merged): only an AniList synopsis shows until OTA-127 clears MAL terms. Next: tags + spoiler toggle, trailer + where to watch, next-episode card, tab previews.

## Next 3 tasks
1. OTA-135 slice 2: seasonal + genre filters (after the slice 1 migration merges).
2. OTA-98 slice 2: search (after #62 merges).
3. OTA-136 Build: Home page, after OTA-135 slices 1 and 2. Logo component (unique gradient ids), motion island, `--ease-drift` into tokens.css, hide `.sh-bg` on home, browse row changes.

## Blockers
- Migrations for #62 and OTA-135 need `prisma migrate dev --create-only` run by the owner, with an empty diff confirmed. Cloud runs have no Prisma engines, so API typecheck and integration specs run in CI only.
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Google Fonts are blocked: `next build --webpack` with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` works. The proxy blocks `*.up.railway.app` and `beta.otakuleague.com`.
- `scripts/design/shots.mjs` can't find Playwright in cloud runs (ESM ignores `NODE_PATH`): run a copy next to a symlinked `node_modules`. Fix belongs in a protected-path PR.

## Known bugs
- `Cover` has no fallback when an image fails to load. No ticket yet.

## Notes
- Merging: autopilot-labelled PRs merge per OTA-176 above; everything else Farouk merges. `max_open_prs` is 6 (OTA-175).
- OTA-173 (W7): API guard against id enumeration triggering imports. Review follow-ups: per-client limit on list/search endpoints, never-imported anime removal from cached lists. OTA-174: cap source text size in the API.
- OTA-172: seasons without a slug link to `app/anime/anilist/[id]/[[...tab]]`, which redirects to the canonical slug; `loading.tsx` streams, so a direct hit is HTTP 200 with a meta refresh, never a real 307/404 (see `.claude/rules/web.md`).
- OTA-153 answers (Farouk, 2026-11-12, also on OTA-136): Pierce mark in the header site-wide; leaderboard per season; Trending reuses Top airing. Home mockups in `docs/design/home/`.
- OTA-166 vendored design skills (protected path, Farouk merges). At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 stays red until typescript-eslint and Next's ESLint plugins support TS 7 / ESLint 10.
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide.
- Design direction (ADR 0012 addendum): the look need not match the old site; ADR 0011 performance rules still apply.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
