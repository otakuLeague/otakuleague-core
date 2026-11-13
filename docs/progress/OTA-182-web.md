# OTA-182 slice 2: web sends the internal key and the client IP

- What changed: `apiClient()` sends `X-Internal-Api-Key` when `INTERNAL_API_KEY` is set (https or loopback base URL only, else it throws); `X-Client-Ip` from Vercel's `x-forwarded-for` (`src/api/client-ip.ts`) only with the key and only from `loadAnime` and `loadAnimeByAnilistId`. Key unset: requests are byte-for-byte as before. `.env.example` carries the same block as PR #84, so either merge order is clean.
- Decisions: the key is validated like the API does (43-128 of `[A-Za-z0-9_-]`); exact loopback hosts (`127.0.0.1`, `localhost`, `[::1]`); `clientIp` on a cached call throws even without a key; an IPv6 zone id is refused on the web too (`isIP` accepts it, the API does not); no `server-only` package (`next/headers` already fails in a client bundle, and ADR 0017 adds the server-only file with OTA-142).
- Tests: rollout gate in `src/anime/data.test.ts` (both import loaders send the IP, the three others key only with `headers()` read 0 times), key and IP never in an error or failure, and a scan for `NEXT_PUBLIC_INTERNAL` in apps/web.
- Next:
  1. PR C: `INTERNAL_API_KEY_PREVIEW` on the API and the `INTERNAL_API_KEY_REQUIRED` boot flag; Vercel Preview gets only that key.
  2. Slice 2b, before rollout step 3: report a refused key (403 `INTERNAL_KEY_REQUIRED`) to Sentry and show it as "service unavailable".
  3. Farouk sets the key on Vercel Production (Sensitive), redeploys, then sets it on Railway (ADR 0019 Rollout).
