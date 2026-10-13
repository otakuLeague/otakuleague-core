import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    setupFiles: ['src/testing/use-test-database.ts'],
  },
});
