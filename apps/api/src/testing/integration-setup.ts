import { afterAll, beforeAll, inject } from 'vitest';
import {
  clonePrefix,
  connectMaintenance,
  databaseName,
  withDatabase,
} from './test-database';

// Runs in the worker before each integration test file (ADR 0005): clone the migrated
// template into a database only this file uses, and point the app at it.
const templateUrl = new URL(inject('testDatabaseUrl'));
const template = databaseName(templateUrl);
// Unique within a run; integration-global-setup.ts drops clones from earlier runs.
const clone = `${clonePrefix(templateUrl)}${process.env.VITEST_WORKER_ID ?? '0'}`;

// Set before the test file imports AppModule, which reads it at import time.
process.env.DATABASE_URL = withDatabase(templateUrl, clone).href;
// Same moment: a key in a local .env must not switch the internal key check on (ADR 0019).
// A spec that tests the real wiring sets its own fake key with vi.hoisted.
process.env.INTERNAL_API_KEY = '';
process.env.INTERNAL_API_KEY_PREVIOUS = '';

beforeAll(async () => {
  const maintenance = connectMaintenance(templateUrl);
  try {
    await maintenance.$executeRawUnsafe(
      `CREATE DATABASE "${clone}" TEMPLATE "${template}"`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not clone ${template} into ${clone}: ${message}. Close any client (psql, IDE) connected to ${template}.`,
    );
  } finally {
    await maintenance.$disconnect();
  }
});

// Setup hooks are registered first: this beforeAll runs before the file's, this afterAll after.
afterAll(async () => {
  const cleanup = connectMaintenance(templateUrl);
  try {
    await cleanup.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${clone}" WITH (FORCE)`,
    );
  } finally {
    await cleanup.$disconnect();
  }
});
