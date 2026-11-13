import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import { robotsHeaders, SEARCH_INDEXING } from './src/seo/indexing';

// Next reads .env files from apps/web only; the repo keeps a single .env at its root (ADR 0003).
// Not @next/env: Next has already called it for apps/web, and its cache makes a second call a no-op.
// Like the API (ADR 0002), the root is trusted only inside the repo checkout, so a deployed build
// never picks up a stray .env from a parent folder. Only the web app's own variables are copied,
// so the database credentials in the same file stay out of this process. Variables already set win.
// INTERNAL_API_KEY is read at request time only: never add it to `env` below (inlined in bundles).
const WEB_ENV_VARIABLES = [
  'API_BASE_URL',
  'INTERNAL_API_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_ENVIRONMENT',
  'SENTRY_RELEASE',
] as const;

const repoRoot = path.resolve(__dirname, '../..');
const rootEnvFile = path.join(repoRoot, '.env');
const insideRepo = existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'));
if (insideRepo && existsSync(rootEnvFile)) {
  const rootEnv = parseEnv(readFileSync(rootEnvFile, 'utf8'));
  for (const name of WEB_ENV_VARIABLES) {
    const value = rootEnv[name];
    if (process.env[name] === undefined && value !== undefined) {
      process.env[name] = value;
    }
  }
}

// Local runs have no SENTRY_RELEASE; the commit is the release, as in the API (ADR 0004).
function gitHeadSha(): string | undefined {
  if (!insideRepo) return undefined;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      // A held lock or a slow disk must not block the build; the catch falls back.
      timeout: 2000,
    }).trim();
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Covers and banners are shown straight from AniList's (or MyAnimeList's) CDN, never fetched,
  // resized or stored by this server (OTA-97): no third-party image cache, and the optimizer
  // endpoint (GHSA-2464-fhr4-w9xw, OTA-131) stays unused. Also skips next/image's host check.
  images: { unoptimized: true },
  headers: () => Promise.resolve(robotsHeaders(SEARCH_INDEXING)),
  // Inlined into the server and browser bundles at build time: the browser cannot read env vars.
  env: {
    SENTRY_ENVIRONMENT:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    SENTRY_RELEASE: process.env.SENTRY_RELEASE || gitHeadSha() || '',
  },
};

// No contact with Sentry's API at build time: no source map upload (deploy ticket), no release
// creation, no build telemetry. Events still carry the release set in init.
export default withSentryConfig(nextConfig, {
  telemetry: false,
  silent: true,
  sourcemaps: { disable: true },
  release: { create: false },
  // Not used (ADR 0004): drops their code from the browser bundle.
  bundleSizeOptimizations: {
    excludeTracing: true,
    excludeDebugStatements: true,
  },
});
