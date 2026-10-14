// @vitest-environment node
import { existsSync } from 'node:fs';
// A fake Sentry ingest server for the tests, not a network call of the app (ADR 0003).
// eslint-disable-next-line no-restricted-imports
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SENTRY_TUNNEL_PATH } from './sentry';
import { forwardSentryEnvelope } from './sentry-tunnel';

interface FakeSentry {
  readonly server: Server;
  readonly dsn: string;
  readonly received: { url: string; body: string }[];
}

/** Stands in for Sentry's ingest: records what it gets, answers with `reply`, or never answers. */
async function startFakeSentry(
  reply: 'never' | { status: number; headers?: Record<string, string> },
): Promise<FakeSentry> {
  const received: { url: string; body: string }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        url: request.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      });
      if (reply !== 'never') {
        // Sentry answers with a JSON body; the tunnel must not leave it unread.
        response.writeHead(reply.status, reply.headers).end('{"id":"x"}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, dsn: `http://publickey@127.0.0.1:${port}/42`, received };
}

function envelope(dsn: unknown): string {
  return [
    JSON.stringify({ event_id: 'a'.repeat(32), dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ message: 'hello' }),
  ].join('\n');
}

function post(body: BodyInit, headers?: HeadersInit): Request {
  return new Request('http://localhost:3000/hikari', {
    method: 'POST',
    body,
    headers,
    // Required by Node for a streamed body.
    duplex: 'half',
  } as RequestInit);
}

let fake: FakeSentry | undefined;
afterEach(async () => {
  fake?.server.closeAllConnections();
  await new Promise(
    (resolve) => fake?.server.close(resolve) ?? resolve(undefined),
  );
  fake = undefined;
});

describe('forwardSentryEnvelope', () => {
  it('forwards an envelope for our DSN unchanged to our project, with the rate-limit headers', async () => {
    fake = await startFakeSentry({
      status: 429,
      headers: { 'Retry-After': '60', 'X-Sentry-Rate-Limits': '60:error' },
    });
    const body = envelope(fake.dsn);

    const response = await forwardSentryEnvelope(post(body), { dsn: fake.dsn });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('x-sentry-rate-limits')).toBe('60:error');
    expect(fake.received).toEqual([{ url: '/api/42/envelope/', body }]);
  });

  it('keeps a DSN path prefix (self-hosted Sentry)', async () => {
    fake = await startFakeSentry({ status: 200 });
    const dsn = fake.dsn.replace('/42', '/sentry/42');

    const response = await forwardSentryEnvelope(post(envelope(dsn)), { dsn });

    expect(response.status).toBe(200);
    expect(fake.received.map((request) => request.url)).toEqual([
      '/sentry/api/42/envelope/',
    ]);
  });

  it.each([
    ['another project id', (dsn: string) => dsn.replace('/42', '/43')],
    ['another host', (dsn: string) => dsn.replace('127.0.0.1', 'evil.example')],
    ['another port', (dsn: string) => dsn.replace(/:\d+\//, ':1/')],
  ])(
    'rejects an envelope for %s with 403 and sends nothing',
    async (_, foreign) => {
      fake = await startFakeSentry({ status: 200 });

      const response = await forwardSentryEnvelope(
        post(envelope(foreign(fake.dsn))),
        {
          dsn: fake.dsn,
        },
      );

      expect(response.status).toBe(403);
      expect(fake.received).toEqual([]);
    },
  );

  it('rejects a body over the limit with 413, by Content-Length or by bytes read', async () => {
    fake = await startFakeSentry({ status: 200 });
    const body = envelope(fake.dsn) + '\n' + 'x'.repeat(2000);
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      });

    const declared = await forwardSentryEnvelope(post(body), {
      dsn: fake.dsn,
      maxBytes: 1000,
    });
    // A stream has no Content-Length: the cap must hold while reading.
    const undeclared = await forwardSentryEnvelope(post(stream()), {
      dsn: fake.dsn,
      maxBytes: 1000,
    });

    expect([declared.status, undeclared.status]).toEqual([413, 413]);
    expect(fake.received).toEqual([]);
  });

  it.each([
    ['no newline', () => JSON.stringify({ dsn: fake?.dsn })],
    ['a header that is not JSON', () => '{dsn:\n{}'],
    ['a header that is not an object', () => '"text"\n{}'],
    ['no DSN in the header', () => '{"event_id":"x"}\n{}'],
    ['a DSN that is not a string', () => envelope(42)],
    ['a DSN that is not a URL', () => envelope('not a dsn')],
    [
      'a DSN without a public key',
      () => envelope(fake?.dsn.replace('publickey@', '')),
    ],
    [
      'a DSN with a non-numeric project',
      () => envelope(fake?.dsn.replace('/42', '/abc')),
    ],
    ['an empty body', () => ''],
  ])('rejects a malformed envelope (%s) with 400', async (_, makeBody) => {
    fake = await startFakeSentry({ status: 200 });

    const response = await forwardSentryEnvelope(post(makeBody()), {
      dsn: fake.dsn,
    });

    expect(response.status).toBe(400);
    expect(fake.received).toEqual([]);
  });

  it('answers 404 when no DSN is configured, and sends nothing', async () => {
    fake = await startFakeSentry({ status: 200 });

    const response = await forwardSentryEnvelope(post(envelope(fake.dsn)), {
      dsn: undefined,
    });

    expect(response.status).toBe(404);
    expect(fake.received).toEqual([]);
  });

  it('answers 504 within the timeout when Sentry never answers', async () => {
    fake = await startFakeSentry('never');
    const started = performance.now();

    const response = await forwardSentryEnvelope(post(envelope(fake.dsn)), {
      dsn: fake.dsn,
      timeoutMs: 200,
    });

    expect(response.status).toBe(504);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('answers 502 when Sentry is unreachable', async () => {
    const closed = await startFakeSentry({ status: 200 });
    const { dsn } = closed;
    await new Promise((resolve) => closed.server.close(resolve));

    const response = await forwardSentryEnvelope(post(envelope(dsn)), { dsn });

    expect(response.status).toBe(502);
  });

  it('does not follow a redirect from Sentry (502), so the envelope goes nowhere else', async () => {
    fake = await startFakeSentry({
      status: 307,
      headers: { Location: '/elsewhere/' },
    });

    const response = await forwardSentryEnvelope(post(envelope(fake.dsn)), {
      dsn: fake.dsn,
    });

    expect(response.status).toBe(502);
    expect(fake.received.map((request) => request.url)).toEqual([
      '/api/42/envelope/',
    ]);
  });

  it('answers 408 to a body trickled slower than the read timeout', async () => {
    fake = await startFakeSentry({ status: 200 });
    const neverEnds = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(envelope(fake?.dsn)));
      },
    });
    const started = performance.now();

    const response = await forwardSentryEnvelope(post(neverEnds), {
      dsn: fake.dsn,
      readTimeoutMs: 200,
    });

    expect(response.status).toBe(408);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(fake.received).toEqual([]);
  });

  it('answers 503 above the in-flight limit, and frees the slot afterwards', async () => {
    fake = await startFakeSentry('never');
    const { dsn } = fake;

    const first = forwardSentryEnvelope(post(envelope(dsn)), {
      dsn,
      timeoutMs: 300,
      maxInFlight: 1,
    });
    const second = await forwardSentryEnvelope(post(envelope(dsn)), {
      dsn,
      maxInFlight: 1,
    });
    const afterFirst = (await first).status;
    const third = await forwardSentryEnvelope(post('no newline'), {
      dsn,
      maxInFlight: 1,
    });

    expect([afterFirst, second.status, third.status]).toEqual([504, 503, 400]);
  });

  it('is served by a route at SENTRY_TUNNEL_PATH', () => {
    expect(
      existsSync(
        new URL(`../../app${SENTRY_TUNNEL_PATH}/route.ts`, import.meta.url),
      ),
    ).toBe(true);
  });
});
