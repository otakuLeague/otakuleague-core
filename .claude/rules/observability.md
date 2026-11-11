---
paths:
  - "**/observability/**"
  - "apps/web/instrumentation*.ts"
  - "apps/web/app/hikari/**"
  - "apps/web/app/debug/**"
  - "apps/api/src/debug/**"
  - "apps/web/app/*error*.tsx"
---
# Logs and error tracking (ADR 0004; moved from CLAUDE.md)

- API logs are one JSON object per line; lines written during a request carry `requestId`, also returned as the `X-Request-Id` header. Pipe through `jq` to read them.
- Sentry is off until `SENTRY_DSN` (API) or `NEXT_PUBLIC_SENTRY_DSN` (web) is set in the root `.env`. `SENTRY_ENVIRONMENT` defaults to `NODE_ENV`, `SENTRY_RELEASE` to the git commit.
- Browser events go through the web app's `/hikari` tunnel (OTA-87), never straight to sentry.io. It forwards only envelopes for `NEXT_PUBLIC_SENTRY_DSN`, up to 1 MiB; `src/observability/sentry-tunnel.ts` is the only file besides `client.ts` where ESLint allows `fetch`.
- Deliberate test errors, outside production only: `curl localhost:3001/debug/error`, and in a browser `localhost:3000/debug/server-error` and `localhost:3000/debug/client-error` (click the button).
- Never log raw headers, bodies or query strings, and never put a secret in a URL path: redaction (`redactValue` in shared-types) is a safety net, not a guarantee.
