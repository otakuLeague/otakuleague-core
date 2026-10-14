# 0001: Core stack

Status: accepted (2026-10-13)

## Context
OtakuLeague is a solo-built anime platform: public anime pages that must rank in search, user accounts and watchlists, and later games and a mobile app. A browser extension may follow.

Constraints:
- One developer, so every moving part has a maintenance cost.
- Free tools unless strictly necessary.
- Web and mobile must call the same API, so the API is a standalone service.
- Anime data comes from third-party sources (AniList, Jikan) with rate limits and licence terms.
- A written decision is cheaper than a rewrite, so the choices below record what was rejected.

## Options and decision

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Runtime | Node 24 (revisit 26 once it is LTS, expected 2026-10-28) | Node 22 | Node 22 is in maintenance until 2027-04-30; Node 24 is the baseline for new projects |
| Database | PostgreSQL 16, in Docker locally | Document or key-value store | Data is relational: users, lists, follows, clans. One database also gives read-your-writes for free |
| API | NestJS, standalone REST service | Fastify or Hono; Next.js route handlers | NestJS modules and guards fit tier-gating and the services-only rule. Next.js as backend would duplicate the API that mobile needs anyway |
| Web | Next.js (App Router), frontend only, calls the API | Vite React SPA | Public anime pages need server rendering for SEO |
| ORM | Prisma | Drizzle | Familiar, mature docs and tooling. Runtime difference is negligible on a long-running server, so familiarity wins |
| Monorepo | pnpm workspaces | pnpm plus Turborepo | Three packages do not need task caching yet |
| Tests | Vitest (API and web), Playwright (end-to-end) | Jest (API) | One runner across the repo, no experimental Node flag, and it is what Nest CLI 12 generates (the API stays CommonJS, unlike the ESM template). Revised by OTA-82, see addendum |

## Repository layout
One repository, `otakuleague-core`: `apps/api`, `apps/web`, `packages/shared-types`, and later `apps/mobile`. React Native is TypeScript, so mobile imports the same shared types as web; an API contract change breaks every client at compile time. Expo documents first-class monorepo support for pnpm, so this does not block mobile.

`packages/shared-types` never imports Prisma types; it holds the public API contract only.

The browser extension is a separate repository: different build toolchain, store-review release process, nothing to gain from shared builds.

## Consistency vs availability
- **Catalog data (anime, characters):** availability over consistency. Showing data that is hours old is harmless. If AniList or Jikan is down, serve the stored copy.
- **User data (accounts, watchlists, scores):** consistency. A user must see their own write immediately. A single PostgreSQL primary provides this.

## Consequences
- Two deployable services (API and web), so local development runs two processes plus the database.
- NestJS is more verbose than a minimal framework. Accepted for the structure it enforces.
- Prisma uses its own schema language, separate from TypeScript types. Contract types live in `shared-types`, so there is a mapping layer.
- No Turborepo. Revisit when CI time exceeds a few minutes or builds are repeatedly redundant.
- Node 24 leaves Active LTS on 2026-10-20 and stays supported until 2028-04-30. Plan the move to the then-LTS Node 26 deliberately, not by accident.

## Learnings
(Filled in later.)

## Sources checked 2026-10-13
- Node.js release schedule (nodejs.org, verify before relying on dates)
- Expo monorepo guide (docs.expo.dev/guides/monorepos)

## Addendum (2026-10-13, OTA-73 scaffold)
- **Web unit test runner: Vitest.** It needs one small config file (React plugin plus jsdom) and runs the App Router page component directly. Jest would need `next/jest` and a separate transform setup for the same result. Async Server Components are not supported by either runner; those go to Playwright.
- **NestJS no longer defaults to Jest.** Nest CLI 12 now generates an ESM project with Vitest and oxlint. The `@nestjs/*` 12 packages are themselves ESM-only. The API keeps CommonJS and Jest as decided above: Node 24 loads the ESM packages through `require()`, but Jest only does so with Node's experimental `--experimental-vm-modules` flag, which the API test script sets. The "NestJS default" reason in the Tests row is therefore out of date, and the API depends on an experimental flag to run its tests. Revisit "Vitest everywhere" (now Nest's own default) before the API test suite grows. *Superseded by the OTA-82 addendum below.*
- **TypeScript pinned to ~6.0.3, ESLint to 9.** TypeScript 7 is out, but typescript-eslint and ts-jest do not support it yet (ts-jest was removed in OTA-82; typescript-eslint is still the blocker). eslint-config-next still depends on plugins that cap ESLint at 9. Re-checked weekly by Dependabot's `blocked-tooling` group, with `pnpm peers check` in CI (OTA-83).

## Addendum (2026-10-13, OTA-82 API test runner)
The original claim "Jest is the NestJS default" is no longer true: Nest CLI 12.0.8 generates Vitest. The API now runs Vitest, like the web app.

Decision rule, fixed before measuring: (1) no experimental Node flag in the test command, (2) NestJS dependency injection works with a documented standard setup. Vitest passes both, so it replaces Jest. Time and config size were recorded but not decisive.

| Same 2 API tests, Node 24.21.0 | Jest 30.5.2 + ts-jest 29.4.14 | Vitest 5.0.4 (Vite 8.3.4) |
|---|---|---|
| Experimental Node flags | `--experimental-vm-modules` (without it: "Must use import to load ES Module" on `@nestjs/testing`) | none |
| Runner config | 13 lines (`jest` block in package.json) plus 2 flags in the script | 0 lines, no config file; `--dir src` in the script |
| Clean run, median of 3 (cache cleared each time) | 0.76 s | 0.54 s |
| Constructor injection via `Test.createTestingModule` | works | works |

- **Decorator metadata.** The Nest CLI reference project adds no SWC or Babel plugin: Vite 8 transforms TypeScript with Oxc, which reads `experimentalDecorators` and `emitDecoratorMetadata` from the package `tsconfig.json`. Checked with a negative control: with `emitDecoratorMetadata` off, `AppService` is not injected and `GET /` returns 500.
- **No config file.** Vitest's defaults find `*.spec.ts` files in a Node environment; the script adds `--dir src` because the default exclude does not cover `dist/`, so a stray compiled spec would otherwise run twice. The generated Nest config only adds `tsconfigPaths` (the API has no path aliases) and `globals` (the repo imports `describe`/`it`/`expect` from `vitest` explicitly, as the web app does). Add a config file when a real need appears.
- **Persistent transform cache.** Vitest 5 caches transformed modules in the repo-root `node_modules/.vitest-cache` (`fsModuleCache`). It was written with no config at all, and changing decorator options in `tsconfig.json` did not invalidate it: the negative control passed until the cache was cleared. So after such a change, run `pnpm --filter @otakuleague/api exec vitest --clearCache`.
- **Integration tests (OTA-78).** Vitest runs test files in parallel workers by default. Tests that share the real PostgreSQL test database will need isolation per file or `fileParallelism: false`; decide in OTA-78.
