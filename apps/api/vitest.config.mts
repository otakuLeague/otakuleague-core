import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests: no database. *.integration.spec.ts run with vitest.integration.config.mts.
export default defineConfig({
  test: {
    dir: 'src',
    exclude: [...configDefaults.exclude, '**/*.integration.spec.ts'],
    setupFiles: ['src/testing/unit-setup.ts'],
  },
});
