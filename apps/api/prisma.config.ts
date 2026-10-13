import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// The CLI does not read .env itself. Real environment variables win over the file.
try {
  process.loadEnvFile(resolve(__dirname, '../../.env'));
} catch (error) {
  // No .env file (CI, clean clone): rely on the real environment.
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Not env(): it throws when the variable is unset, which would break
  // `prisma generate` on a clean clone that has no .env yet.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
