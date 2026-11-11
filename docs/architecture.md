# Architecture

What exists in the code today (end of Phase 0). Planned parts are not drawn; they get added here when they ship. Keep this file in sync with the code: a change that adds a box or an arrow updates the diagram in the same PR.

```mermaid
flowchart LR
  browser["Browser"]

  subgraph web["apps/web (Next.js, React)"]
    pages["app/ pages<br/>(mostly Server Components)"]
    client["API client<br/>src/api/client.ts"]
    tunnel["POST /hikari<br/>Sentry tunnel"]
  end

  subgraph api["apps/api (NestJS)"]
    health["GET /health<br/>HealthController"]
    healthSvc["HealthService"]
    debug["GET /debug/error<br/>(not in production)"]
    animeApi["GET /anime/slugs/:slug<br/>GET /anime/:idSource/:externalId<br/>AnimeService"]
    importer["AnimeImportService<br/>on-demand import, refresh, purge"]
    adapters["Source adapters<br/>AniList, Jikan<br/>(kill switch, rate limiter each)"]
    prisma["PrismaService"]
  end

  anilistApi["AniList GraphQL<br/>(primary)"]
  jikanApi["Jikan / MyAnimeList<br/>(fills gaps)"]

  shared["packages/shared-types<br/>API types, error codes, redaction"]
  db[("PostgreSQL 18<br/>Docker Compose")]
  sentry["Sentry<br/>(optional, DSN in .env)"]
  ci["GitHub Actions CI<br/>lint, typecheck, unit,<br/>integration, build"]

  browser -->|HTTP| pages
  pages --> client
  client -->|"HTTP, server-side only<br/>API_BASE_URL"| health
  health --> healthSvc --> prisma
  animeApi --> importer --> adapters
  animeApi --> prisma
  importer --> prisma
  adapters -->|"HTTP, 30 req/min"| anilistApi
  adapters -->|"HTTP, 1 req/s"| jikanApi
  prisma -->|"SQL (Prisma, pg adapter)"| db

  shared -.->|imported by| web
  shared -.->|imported by| api

  browser -.->|"errors, scrubbed"| tunnel
  tunnel -.->|"own DSN only"| sentry
  web -.->|errors| sentry
  api -.->|errors| sentry

  ci -.->|"runs on every PR and push to main"| web
  ci -.->|"integration job: Postgres service"| api
```

## Pieces

- **apps/web**: Next.js App Router. Pages are Server Components, except the error boundaries and the client-error debug button; the browser never calls the API. Every network call goes through `src/api/client.ts` (`apiClient()`), which applies timeouts and returns expected failures as an `ApiResult` instead of throwing; ESLint blocks raw `fetch` elsewhere, except in the Sentry tunnel `src/observability/sentry-tunnel.ts` ([ADR 0003](decisions/0003-web-api-client.md) and its OTA-87 addendum). Today the home page shows the API health; there are also error pages and debug pages for testing Sentry.
- **apps/api**: NestJS. Validated config from the repo-root `.env` (the API refuses to boot on a missing or invalid variable), one error envelope `{ "error": { "code", "message" } }` (except the 503 body of `/health`, a `HealthResponse`), request validation, `GET /health` (200, or 503 while Postgres is down), Swagger at `/docs` outside production ([ADR 0002](decisions/0002-api-validation-and-errors.md)). Logs are one JSON object per line with a `requestId` ([ADR 0004](decisions/0004-error-tracking-and-logging.md)).
- **Anime data** ([ADR 0006](decisions/0006-anime-data-sources.md) and its OTA-92 update): `GET /anime/:idSource/:externalId` (`anilist` or `myanimelist` id) serves the core anime from our database. An anime we do not have is imported on the request from AniList (one shared import per anime); Jikan fills MAL data in the background. Each source has an adapter, a kill switch (`ANIME_SOURCE_*_ENABLED`) and a rate limiter; each stored value keeps its source and fetch time (`anime_source_snapshot`, one row per anime and source), merged at read time. Stale data is served at once and refreshed in the background (daily while airing, weekly otherwise); anime nobody opened for 30 days are purged daily. Adult entries are never stored. For the page header (OTA-97), the AniList snapshot also keeps the original creators ("Original Creator" / "Original Story" staff), favourites, AniList's all-time ranks by score and by popularity among anime of the same format, and the cover colour; these are AniList-only fields, never filled from MyAnimeList. "Original Character Design" counts as a creator only next to an "Original Story" credit (split writer/artist manga such as Death Note), not for light-novel illustrators.
- **Anime slugs** ([ADR 0007](decisions/0007-anime-slugs.md)): each AniList anime gets a permanent slug from its English title (romaji as fallback), claimed when its AniList snapshot is stored. `anime_identity` (canonical slug, `removed_at`) and `anime_slug` (every slug ever claimed) are keyed on the AniList id and have no link to `anime`, so the purge never breaks a URL; an anime deleted for being adult is never imported again. `GET /anime/slugs/:slug` serves the anime for its canonical slug and answers `{ kind: "redirect", canonicalSlug }` for any other slug of it (alias, former canonical, other letter case); the web app turns that into a 301 (OTA-97). Every anime response carries `canonicalSlug`, null until the anime has an AniList identity.
- **Anime pages** (OTA-97, in progress): `apps/web/app/anime/[slug]/` holds the layout (header inside Suspense, so a first-visit import streams) and one route per tab, each tab's content behind its own Suspense. `apps/web/proxy.ts` decides redirects and 404s before rendering, from `GET /anime/slugs/:slug/resolve` (database only): with Partial Prefetching a page cannot change its HTTP status once the App Shell is sent. The design tokens and component styles (`docs/design/anime-page/`) are the web app's global styles; the theme follows the visitor's system setting. The header (`header.tsx`) renders from one pure view model, `headerFacts()` in `src/anime/header-facts.ts`, which drops any value AniList lacks (never a 0 or `#null`); the sticky bar (`sticky-bar.tsx`, a client component) reuses it and appears through an IntersectionObserver on the header, its progress line a CSS scroll timeline. The page accent comes from AniList's cover colour: `accentPalette()` in `src/anime/accent.ts` derives `--accent-ink` per theme at 4.5:1 and `--on-accent`, emitted as a small `<style>` for `.anime-page` because the tabs render outside the header's Suspense boundary. Status and season chip colours are tokens; `app/styles/tokens.test.ts` checks their contrast on the chip's tinted fill in both themes. Images are shown from the source CDN as-is (`images.unoptimized`): never fetched, resized or stored by the web server.
- **Season selector** (OTA-97): the header loads `GET /anime/slugs/:slug/franchise` beside the anime and renders the main line as a disclosure of links in the hero (not the sticky bar), each opening the same tab on that season; a season not imported yet (no slug) is listed but disabled.
- **Franchise walk** ([ADR 0008](decisions/0008-franchise-chain.md), OTA-95): `FranchiseWalker` walks SEQUEL/PREQUEL edges from one AniList anime in the background, one batched AniList request per level (free slot only, so page requests never wait), and stores each entry's summary and edges in `anime_relation_node` (no link to `anime`; purged 30 days after last use). `anime_franchise_override` holds manual fixes (`SEASON`, `RELATED`, `BOUNDARY`, label), shipped as reviewed data migrations. `buildFranchise` (`franchise-view.ts`, pure) computes the main line, its labels and the Related groups from the stored rows at read time; `GET /anime/slugs/:slug/franchise` serves it from stored rows only and queues a walk when rows are missing or stale; `SourceBackoff` keeps an entry AniList answers badly (no `isAdult`, or left out of a relations answer) from costing a request per view (it waits 1 h, 6 h, 1 d, then a week; a franchise missing an id on an early step answers `partial`).
- **PostgreSQL**: one container from `docker-compose.yml`, bound to 127.0.0.1, with a dev database and a test database. Prisma 7 owns the schema and migrations (`apps/api/prisma`); there are no tables yet.
- **packages/shared-types**: built to `dist/` and imported by both apps: the API response types (`HealthResponse`, `ApiError`), error codes and their type guards, and the redaction used before anything reaches a log or Sentry.
- **Sentry**: the API, the web server and the browser report errors when their DSN is set; with no DSN nothing is sent. Scrubbing runs before sending ([ADR 0004](decisions/0004-error-tracking-and-logging.md)). The browser sends to our own `/hikari` route, which forwards only envelopes for our DSN, so blockers of sentry.io do not drop them ([ADR 0003 addendum](decisions/0003-web-api-client.md)).
- **CI**: `.github/workflows/ci.yml`, five parallel jobs on every PR and push to main. The unit job has no database; the integration job gets a Postgres service and recreates the test database itself ([ADR 0005](decisions/0005-integration-tests-real-postgres.md)).
- **Deploy**: Railway runs the API and Postgres in production, Vercel the web app. See [docs/deploy.md](deploy.md) for Railway settings, rollback, backups and restore, and [docs/deploy-vercel.md](deploy-vercel.md) for Vercel.
- **PR screenshots** ([ADR 0013](decisions/0013-pr-screenshots.md), OTA-163): `.github/workflows/screenshots.yml` builds the API and web against a local replay of the recorded source fixtures (`scripts/screenshots/`), captures the routes in `routes.json` at 1440 px and 390 px, dark and light, and posts them in one sticky PR comment (`<!-- pr-screenshots -->`) when the PR changes a page. Only a crashed app fails the run.

## Decisions

- [Engineering charter](engineering-charter.md): how the project is built.
- [ADR 0001: Core stack](decisions/0001-core-stack.md)
- [ADR 0002: API validation, error envelope, health and Prisma wiring](decisions/0002-api-validation-and-errors.md)
- [ADR 0003: Web API client](decisions/0003-web-api-client.md)
- [ADR 0004: Error tracking and structured logging](decisions/0004-error-tracking-and-logging.md)
- [ADR 0005: Integration tests against a real PostgreSQL](decisions/0005-integration-tests-real-postgres.md)
- [ADR 0013: Screenshots of the real pages on every web PR](decisions/0013-pr-screenshots.md)
- [ADR template](decisions/0000-template.md)
