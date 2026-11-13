import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hostname } from 'node:os';
import { gunzipSync } from 'node:zlib';
import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentInternalKeySettings } from '../common/internal-key.guard';
import type { EnvironmentVariables } from '../config/environment';
import { createTestApp } from '../testing/test-app';
import { initSentry } from './sentry';

// An obvious fake of a valid shape (64 characters, like `openssl rand -hex 32`).
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');

// Registered only in this test module, never in production code.
@Controller('test-only')
class FailingLoginController {
  @Post('login')
  logIn(@Body() body: Record<string, unknown>): never {
    throw new Error(
      `login failed for frieren@example.com with password=${String(body.password)}`,
    );
  }

  @Get('database-down')
  failWithDatabaseDown(): never {
    throw new ServiceUnavailableException();
  }
}

/** Stands in for Sentry's ingest endpoint: records envelopes, or accepts and never answers. */
async function startFakeSentry(mode: 'answer' | 'hang'): Promise<{
  readonly server: Server;
  readonly dsn: string;
  readonly envelopes: string[];
}> {
  const envelopes: string[] = [];
  const server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const body = Buffer.concat(chunks);
      envelopes.push(
        (incoming.headers['content-encoding'] === 'gzip'
          ? gunzipSync(body)
          : body
        ).toString('utf8'),
      );
      if (mode === 'answer') outgoing.writeHead(200).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, dsn: `http://publickey@127.0.0.1:${port}/1`, envelopes };
}

// The SDK also sends session and client-report envelopes; only error events matter here.
function errorEvents(envelopes: readonly string[]): string[] {
  return envelopes.filter((envelope) =>
    envelope.split('\n')[1]?.includes('"type":"event"'),
  );
}

const SECRETS = {
  header: 'header-secret',
  cookie: 'cookie-secret',
  apiKey: 'apikey-secret',
  query: 'query-secret',
  body: 'body-secret',
  email: 'frieren@example.com',
};

describe('Sentry in the API', () => {
  let fakeSentry: Server | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await Sentry.close(100);
    fakeSentry?.closeAllConnections();
    fakeSentry?.close();
    fakeSentry = undefined;
  });

  it('stays off without a DSN, and the API keeps answering', async () => {
    expect(
      initSentry({ dsn: undefined, environment: 'test', release: undefined }),
    ).toBe(false);
    expect(Sentry.isInitialized()).toBe(false);

    const app = await createTestApp();
    try {
      await request(app.getHttpServer()).get('/debug/error').expect(500);
    } finally {
      await app.close();
    }
  });

  it('sends a 500 with environment, release and request id, and nothing sensitive', async () => {
    const { server, dsn, envelopes } = await startFakeSentry('answer');
    fakeSentry = server;
    initSentry({
      dsn,
      environment: 'ota79-check',
      release: 'release-under-test',
    });
    const app = await createTestApp({ controllers: [FailingLoginController] });
    try {
      const response = await request(app.getHttpServer())
        .post(`/test-only/login?token=${SECRETS.query}`)
        .set('Authorization', `Bearer ${SECRETS.header}`)
        .set('Cookie', `sid=${SECRETS.cookie}`)
        .set('X-Api-Key', SECRETS.apiKey)
        .send({ email: SECRETS.email, password: SECRETS.body })
        .expect(500);
      await Sentry.flush(2000);

      const [envelope = '', ...others] = errorEvents(envelopes);
      expect(others).toEqual([]);
      const event = JSON.parse(envelope.split('\n')[2] ?? '{}') as {
        environment?: string;
        release?: string;
        tags?: Record<string, string>;
        contexts?: Record<string, unknown>;
        exception?: { values?: { value?: string }[] };
      };
      expect(event.environment).toBe('ota79-check');
      expect(event.release).toBe('release-under-test');
      expect(event.tags?.request_id).toBe(response.get('X-Request-Id'));
      expect(event.contexts?.request).toEqual({
        method: 'POST',
        path: '/test-only/login',
      });
      expect(event.exception?.values?.[0]?.value).toBe(
        'login failed for [email] with password=[redacted]',
      );
      for (const secret of [...Object.values(SECRETS), hostname()]) {
        expect(envelopes.join('\n')).not.toContain(secret);
      }
    } finally {
      await app.close();
    }
  });

  it('does not report client errors nor 503s (one per request during an outage)', async () => {
    const { server, dsn, envelopes } = await startFakeSentry('answer');
    fakeSentry = server;
    initSentry({ dsn, environment: 'test', release: undefined });
    const app = await createTestApp({ controllers: [FailingLoginController] });
    try {
      await request(app.getHttpServer()).get('/no-such-route').expect(404);
      await request(app.getHttpServer())
        .get('/test-only/database-down')
        .expect(503);
      await Sentry.flush(2000);

      expect(errorEvents(envelopes)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it.each<
    [string, Partial<Record<keyof EnvironmentVariables, string>>, number]
  >([
    ['once in production without a key', { NODE_ENV: 'production' }, 1],
    ['never in development without a key', { NODE_ENV: 'development' }, 0],
    [
      'never in production with a key',
      { NODE_ENV: 'production', INTERNAL_API_KEY: FAKE_KEY },
      0,
    ],
  ])(
    'sends the open-API warning at start %s',
    async (_, environment, expected) => {
      const { server, dsn, envelopes } = await startFakeSentry('answer');
      fakeSentry = server;
      initSentry({ dsn, environment: 'test', release: undefined });
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const settings = new EnvironmentInternalKeySettings(
        new ConfigService<EnvironmentVariables, true>({
          INTERNAL_API_KEY: '',
          INTERNAL_API_KEY_PREVIOUS: '',
          INTERNAL_API_KEY_PREVIEW: '',
          ...environment,
        }),
      );

      settings.onApplicationBootstrap();
      await Sentry.flush(2000);

      const events = errorEvents(envelopes).map((envelope) => {
        const { level, message } = JSON.parse(
          envelope.split('\n')[2] ?? '{}',
        ) as { level?: string; message?: string };
        return { level, message };
      });
      expect(events).toEqual(
        Array.from({ length: expected }, () => ({
          level: 'error',
          message: 'INTERNAL_API_KEY is not set: the API answers any caller',
        })),
      );
    },
  );

  it.each([
    ['accepts the connection and never answers', 'hang'],
    ['refuses the connection', 'closed-port'],
  ] as const)(
    'answers the 500 at once when Sentry %s',
    async (_description, mode) => {
      let dsn = 'http://publickey@127.0.0.1:1/1';
      if (mode === 'hang') {
        const hanging = await startFakeSentry('hang');
        fakeSentry = hanging.server;
        dsn = hanging.dsn;
      }
      initSentry({ dsn, environment: 'test', release: undefined });
      const app = await createTestApp();
      try {
        const started = performance.now();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await request(app.getHttpServer()).get('/debug/error').expect(500);
        }

        expect(performance.now() - started).toBeLessThan(1000);
      } finally {
        await app.close();
      }
    },
  );
});
