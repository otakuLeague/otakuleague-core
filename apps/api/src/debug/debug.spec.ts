import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugRoutesEnabled } from './debug.module';

// ConditionalModule.registerWhen reads NODE_ENV once, when app.module is first imported,
// so each case sets NODE_ENV and then imports a fresh copy of the app.
async function createAppWith(
  nodeEnv: 'production' | 'development' | 'test',
): Promise<INestApplication<App>> {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  const { createTestApp } = await import('../testing/test-app.js');
  return createTestApp();
}

describe('debugRoutesEnabled', () => {
  it.each(['development', 'test'])('allows NODE_ENV=%s', (nodeEnv) => {
    expect(debugRoutesEnabled({ NODE_ENV: nodeEnv })).toBe(true);
  });

  // The API refuses to boot with an unknown NODE_ENV today; the allowlist still holds if one is added.
  it.each(['production', 'staging', 'Development', '', undefined])(
    'refuses NODE_ENV=%s',
    (nodeEnv) => {
      expect(debugRoutesEnabled({ NODE_ENV: nodeEnv })).toBe(false);
    },
  );
});

describe('GET /debug/error', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is not registered when NODE_ENV=production: 404 envelope', async () => {
    const app = await createAppWith('production');
    try {
      const response = await request(app.getHttpServer())
        .get('/debug/error')
        .expect(404);

      expect(response.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Cannot GET /debug/error' },
      });
    } finally {
      await app.close();
    }
  });

  it.each(['development', 'test'] as const)(
    'throws when NODE_ENV=%s, so the 404 above comes from the guard',
    async (nodeEnv) => {
      const app = await createAppWith(nodeEnv);
      try {
        await request(app.getHttpServer()).get('/debug/error').expect(500);
      } finally {
        await app.close();
      }
    },
  );
});
