---
paths:
  - "apps/web/**"
---
# Web with the API (moved from CLAUDE.md)

- The web app copies its own variables (`WEB_ENV_VARIABLES` in `next.config.ts`) from the repo-root `.env`, inside the repo only; real env vars win. It needs `API_BASE_URL` (server-only, example value in `.env.example`; an older `.env` needs it added). A missing or invalid value fails the first API call with one message naming the variable.
- Restart `pnpm dev` after editing the root `.env`, and don't add `apps/web/.env*` files (ADR 0003).
- Anime pages (OTA-97): `/anime/[slug]` and its six tab routes (`/episodes`, `/cast`, `/music`, `/related`, `/stats`, `/community`). `apps/web/proxy.ts` (matcher `/anime/:path*`) calls `GET /anime/slugs/:slug/resolve` (300 ms timeout, answers cached about 60 s) and answers another slug or letter case with a 308 to the canonical slug on the same tab, and an unknown slug with the anime 404 page and a real 404 status. It has to be the proxy: with Partial Prefetching, Next sends a prerendered App Shell (status 200) before a page can resolve its slug. When the API is slow or down the proxy lets the request through and the page shows its own state. Check with `curl -I localhost:3000/anime/<alias>/cast`.
- Motion and glass (OTA-150): transitions use the `--ease-*` / `--dur-*` tokens in `app/styles/tokens.css` (when to use each: `docs/design/system-v2/motion.md`), move things with `transform`/`opacity` only (colour and shadow transitions on small elements are fine), and each component states its `prefers-reduced-motion` behaviour. Frosted surfaces only through `.ol-glass` (solid fallback built in); never animate the blur.
