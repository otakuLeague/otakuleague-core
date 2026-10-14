import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../testing/test-app';
import { JsonLogger } from './json-logger';

type LogLine = Record<string, unknown>;

let written: string[];

function logLines(): LogLine[] {
  return written
    .join('')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LogLine);
}

beforeEach(() => {
  written = [];
  const capture = (chunk: string | Uint8Array): boolean => {
    written.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('JsonLogger', () => {
  it('writes one JSON object per line, without a request id outside a request', () => {
    new JsonLogger().log('started', 'Bootstrap');

    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'log',
        context: 'Bootstrap',
        message: 'started',
      }),
    ]);
    expect(logLines()[0]).not.toHaveProperty('requestId');
  });

  it('redacts secrets in the message, structured params and error stack', () => {
    const logger = new JsonLogger();
    const error = new Error(
      'connect postgresql://otaku:db-secret@db:5432/app failed',
    );

    logger.log('login by frieren@example.com with password=hunter2', {
      headers: { authorization: 'Bearer header-secret' },
    });
    logger.error(error.message, error.stack, 'Prisma');

    const output = written.join('');
    for (const secret of [
      'hunter2',
      'frieren@example.com',
      'header-secret',
      'db-secret',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(logLines()[0]).toMatchObject({
      message: 'login by [email] with password=[redacted]',
      params: { headers: { authorization: '[redacted]' } },
    });
  });
});

describe('API logs over HTTP', () => {
  it('puts the response X-Request-Id on every line written for the request', async () => {
    const app = await createTestApp({ logger: new JsonLogger() });
    try {
      const response = await request(app.getHttpServer())
        .get('/debug/error?token=query-secret')
        .expect(500);
      const requestId = response.get('X-Request-Id');

      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      await vi.waitFor(() => {
        expect(logLines().map((line) => line.message)).toContain(
          'request completed',
        );
      });
      const requestLines = logLines().filter((line) => 'requestId' in line);
      expect(requestLines.map((line) => line.context)).toEqual([
        'ApiExceptionFilter',
        'HTTP',
      ]);
      expect(requestLines.every((line) => line.requestId === requestId)).toBe(
        true,
      );
      expect(requestLines[1]?.params).toEqual({
        method: 'GET',
        path: '/debug/error',
        statusCode: 500,
        durationMs: expect.any(Number) as number,
        aborted: false,
      });
      expect(written.join('')).not.toContain('query-secret');
    } finally {
      await app.close();
    }
  });

  it('gives two requests two different ids', async () => {
    const app = await createTestApp({ logger: new JsonLogger() });
    try {
      const server = app.getHttpServer();
      const [first, second] = await Promise.all([
        request(server).get('/no-such-route'),
        request(server).get('/no-such-route'),
      ]);

      expect(first.get('X-Request-Id')).not.toBe(second.get('X-Request-Id'));
    } finally {
      await app.close();
    }
  });

  it('gives an id to a request the body parser rejects', async () => {
    const app = await createTestApp({ logger: new JsonLogger() });
    try {
      const response = await request(app.getHttpServer())
        .post('/debug/error')
        .set('Content-Type', 'application/json')
        .send('{"broken":')
        .expect(400);

      expect(response.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await app.close();
    }
  });
});
