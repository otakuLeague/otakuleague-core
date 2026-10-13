import { REPO_ROOT_ENV_FILE } from '../config/environment';

// Runs before every test file: point the app at the test database, never the dev one.
try {
  process.loadEnvFile(REPO_ROOT_ENV_FILE);
} catch (error) {
  // No .env (CI): DATABASE_URL_TEST must come from the real environment.
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error(
    'DATABASE_URL_TEST is not set. Run `cp .env.example .env` at the repo root, then `pnpm db:up`.',
  );
}
// Tests will truncate tables (OTA-78); refuse anything that is not a *_test database.
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error(
    'DATABASE_URL_TEST must point to a database whose name ends in _test.',
  );
}
process.env.DATABASE_URL = testDatabaseUrl;
