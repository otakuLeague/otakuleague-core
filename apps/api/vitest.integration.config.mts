import { defineConfig } from 'vitest/config';

// Real PostgreSQL, one cloned database per test file, files in parallel (ADR 0005).
export default defineConfig({
  test: {
    dir: 'src',
    include: ['**/*.integration.spec.ts'],
    globalSetup: ['src/testing/integration-global-setup.ts'],
    setupFiles: ['src/testing/integration-setup.ts'],
  },
});
