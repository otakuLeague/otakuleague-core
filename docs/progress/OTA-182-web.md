# OTA-182 slice 2: web sends the internal key and the client IP

- Merge after #84 and #85: these docs cite ADR 0019 and the rotation runbook in `docs/deploy.md`, which only exist on those branches. `.env.example` carries #84's block byte for byte, so the order between them is free.
- What changed: `apiClient()` sends `X-Internal-Api-Key` when `INTERNAL_API_KEY` is set; `next.config.ts` fails the build on a malformed key or a base URL that is neither https nor `127.0.0.1`/`[::1]`. `X-Client-Ip` from `x-forwarded-for` (`src/api/client-ip.ts`) only with the key, only when `VERCEL=1`, and only from `loadAnime` and `loadAnimeByAnilistId`. Key unset: requests are as before.
- Decisions: key rule copied from the API (43-128 of `[A-Za-z0-9_-]`); no `localhost` (resolved by name); `clientIp` on a cached call throws even without a key; IPv6 zone ids refused; off Vercel no IP (the API's shared `unknown` bucket; a CDN in front of Vercel needs its own decision); no `server-only` package (ADR 0017 adds the server-only file with OTA-142).
- Tests: `data.test.ts` rollout gate (every export of `data.ts` is listed; import loaders send the IP, the others the key only and never read `headers()`), no key or IP in a failure, no `NEXT_PUBLIC_INTERNAL` and no key in next.config's `env:` block.
- Next:
  1. PR C: `INTERNAL_API_KEY_PREVIEW` on the API and the `INTERNAL_API_KEY_REQUIRED` boot flag; Vercel Preview gets only that key.
  2. Slice 2b: report a refused key (403 `INTERNAL_KEY_REQUIRED`) to Sentry and show "service unavailable".
  3. Before rollout step 3, confirm with Farouk the privacy page wording: the raw IP is held in API memory about 200 s for rate limiting (ADR 0019).
  4. After #84: move the key pattern into `shared-types` so web and API share one rule.
  5. Farouk sets the key on Vercel Production (Sensitive), redeploys, then on Railway (ADR 0019 Rollout).
