# Progress (handoff)

Rewritten at the end of every session by `/ship` or `/wrap`. Max ~40 lines. Read this first; don't re-explore the repo.

Updated: 2026-11-11

## Current milestone
W2 Anime page + search. Done: OTA-97 (anime page shell), OTA-152 (global shell), OTA-133, OTA-134, OTA-163. W1 Live skeleton closed.

## Last session
Autopilot on OTA-172 (branch `feat/OTA-172-season-id-route`). Every main-line season in the selector is now a link; the selector shows whenever the main line has 2+ seasons. Seasons without a slug link to the new route `app/anime/anilist/[id]/[[...tab]]` (`rel="nofollow"`, `prefetch={false}`), a thin page over `src/anime/season-redirect.ts`: validates id and tab, `loadAnimeByAnilistId` (15 s), then `redirect()` to the canonical slug on the same tab. Because `loading.tsx` streams, a direct hit is HTTP 200 with a meta refresh or the not-found UI, never a real 307/404 (documented in `.claude/rules/web.md`). Noindex comes from an `X-Robots-Tag` header rule in `src/seo/indexing.ts` (page-level `robots` is forbidden by `indexing.test.ts`). A malformed slug from the API throws (error page).

## In progress
- OTA-172: PR open, autopilot-labelled.
- OTA-171 (design direction): PR #56, Farouk's.

## Next 3 tasks
1. OTA-153 Design: Home page, or OTA-100 Build: Overview tab (both W2, unblocked).
2. OTA-166 vendored design skills (protected path, Farouk merges).
3. OTA-173 (new, W7): API guard against id enumeration triggering imports (negative cache, cold-import cap). Raised by the OTA-172 security review.

## Blockers
- Cloud runs have Node 22 (repo wants 24): install with `pnpm install --frozen-lockfile --config.engine-strict=false --ignore-scripts`, then build shared-types. Prisma engines and Google Fonts are blocked, so API lint/typecheck/tests and the normal web build fail here; API checks rely on CI. The proxy also blocks `*.up.railway.app` and `beta.otakuleague.com`.

## Known bugs
- `Cover` has no fallback when an image fails to load (visible in CI screenshots). No ticket yet.

## Notes
- At launch (OTA-149): flip `SEARCH_INDEXING` to `'allowed'`; checks in `docs/deploy-vercel.md`.
- Dependabot PR #18 (TypeScript 7 / ESLint 10) stays red until typescript-eslint and Next's ESLint plugins support them; never auto-merged.
- Autopilot commits are authored "Claude <noreply@anthropic.com>" by the cloud environment, so squash merges may add a Co-authored-by trailer. Farouk to decide (CLAUDE.md forbids AI attribution).
- Open design question: ticket asks for "purple primary, cyan secondary"; OTA-91's tokens use teal. v2 keeps teal for UI and purple → cyan for the brand gradient.
- Open product question (OTA-99): regional streaming availability needs a non-AniList source (ADR 0006) or stays out of v1.
