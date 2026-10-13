import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import type { NextConfig } from 'next';

// Next reads .env files from apps/web only; the repo keeps a single .env at its root (ADR 0003).
// Not @next/env: Next has already called it for apps/web, and its cache makes a second call a no-op.
// Like the API (ADR 0002), the root is trusted only inside the repo checkout, so a deployed build
// never picks up a stray .env from a parent folder. Only the web app's own variables are copied,
// so the database credentials in the same file stay out of this process. Variables already set win.
const WEB_ENV_VARIABLES = ['API_BASE_URL'] as const;

const repoRoot = path.resolve(__dirname, '../..');
const rootEnvFile = path.join(repoRoot, '.env');
if (
  existsSync(path.join(repoRoot, 'pnpm-workspace.yaml')) &&
  existsSync(rootEnvFile)
) {
  const rootEnv = parseEnv(readFileSync(rootEnvFile, 'utf8'));
  for (const name of WEB_ENV_VARIABLES) {
    const value = rootEnv[name];
    if (process.env[name] === undefined && value !== undefined) {
      process.env[name] = value;
    }
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
