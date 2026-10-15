import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter';
import {
  requestJson,
  retryAfterMs,
  type SourceHttpOptions,
} from './source-http';
import { SourceUnavailableError } from './source.types';

type Reply =
  { status: number; headers?: Record<string, string>; body?: string } | 'hang';

/** A local stand-in for a source: answers each request with the next reply. */
async function fakeSource(
  replies: Reply[],
): Promise<{ url: string; calls: () => number }> {
  let calls = 0;
  server = createServer((_request, response) => {
    const reply = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    if (reply === undefined || reply === 'hang') return;
    response.writeHead(reply.status, reply.headers).end(reply.body ?? '{}');
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/`, calls: () => calls };
}

let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) =>
    server ? server.close(resolve) : resolve(undefined),
  );
  server = undefined;
});

function options(
  overrides: Partial<SourceHttpOptions> = {},
): SourceHttpOptions {
  return {
    source: 'jikan',
    limiter: new RateLimiter(0),
    timeoutMs: 1_000,
    maxRetryAfterMs: 5_000,
    coolDownMs: 60_000,
    maxQueueMs: 5_000,
    ...overrides,
  };
}

describe('retryAfterMs', () => {
  const now = Date.parse('2026-10-15T10:00:00Z');

  it.each([
    ['30', 30_000],
    ['0', 0],
    ['Thu, 15 Oct 2026 10:00:45 GMT', 45_000],
    ['soon', 60_000],
    [null, 60_000],
  ])('%j -> %j ms', (header, expected) => {
    expect(retryAfterMs(header, now)).toBe(expected);
  });
});

describe('requestJson', () => {
  it('returns the JSON body of a 200 and of a 404', async () => {
    const source = await fakeSource([
      { status: 200, body: '{"data":1}' },
      { status: 404, body: '{"error":"nope"}' },
    ]);

    await expect(requestJson(source.url, {}, options())).resolves.toEqual({
      status: 200,
      body: { data: 1 },
    });
    await expect(requestJson(source.url, {}, options())).resolves.toEqual({
      status: 404,
      body: { error: 'nope' },
    });
  });

  it('waits for Retry-After on a 429 and tries once more', async () => {
    const source = await fakeSource([
      { status: 429, headers: { 'Retry-After': '0' } },
      { status: 200, body: '{"ok":true}' },
    ]);

    await expect(requestJson(source.url, {}, options())).resolves.toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(source.calls()).toBe(2);
  });

  it('stays down until a long Retry-After ends, even with a short cool-down', async () => {
    const source = await fakeSource([
      { status: 429, headers: { 'Retry-After': '3600' } },
    ]);
    const shared = options({ coolDownMs: 0 });

    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'rate limited for 3600000 ms',
    );
    // Without the longer cool-down this call would sleep for an hour in the queue.
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'cooling down',
    );
    expect(source.calls()).toBe(1);
  });

  it('refuses a call that would wait in the queue longer than maxQueueMs', async () => {
    const source = await fakeSource([{ status: 200, body: '{}' }]);
    const shared = options({
      limiter: new RateLimiter(60_000),
      maxQueueMs: 100,
    });

    await requestJson(source.url, {}, shared);
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'queue full',
    );
    expect(source.calls()).toBe(1);
  });

  it('gives up at once when Retry-After is longer than it may wait', async () => {
    const source = await fakeSource([
      { status: 429, headers: { 'Retry-After': '120' } },
    ]);

    await expect(requestJson(source.url, {}, options())).rejects.toThrow(
      'jikan unavailable: rate limited for 120000 ms',
    );
    expect(source.calls()).toBe(1);
  });

  it('fails on a 5xx, then fails fast during the cool-down without calling again', async () => {
    const source = await fakeSource([{ status: 503 }]);
    const shared = options();

    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'HTTP 503',
    );
    await expect(requestJson(source.url, {}, shared)).rejects.toThrow(
      'cooling down',
    );
    expect(source.calls()).toBe(1);
  });

  it('turns a timeout into SourceUnavailableError', async () => {
    const source = await fakeSource(['hang']);

    await expect(
      requestJson(source.url, {}, options({ timeoutMs: 100 })),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('turns a body that is not JSON into SourceUnavailableError', async () => {
    const source = await fakeSource([
      { status: 200, body: '<html>maintenance</html>' },
    ]);

    await expect(requestJson(source.url, {}, options())).rejects.toThrow(
      'not JSON',
    );
  });
});
