import { createRequire } from 'node:module';
import path from 'node:path';
import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_SENTRY_OPTIONS, SENTRY_TUNNEL_PATH } from './sentry';

// Vitest resolves @sentry/nextjs to its Node build; the browser bundle gets the "browser" export.
// Load that same file here, for this test and for ./sentry.
// The CommonJS entry of the package's own "browser" export: Node cannot load the ESM one
// (extensionless `next/router` import). Read from the exports map so an SDK upgrade follows it.
vi.mock('@sentry/nextjs', () => {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve('@sentry/nextjs/package.json');
  const { exports } = require(packageJsonPath) as {
    exports: { '.': { browser: { require: string } } };
  };
  return require(
    path.join(path.dirname(packageJsonPath), exports['.'].browser.require),
  ) as Record<string, unknown>;
});

const SECRETS = {
  email: 'ota87.visitor@example.com',
  password: 'hunter2-ota87',
  bearer: 'eyJota87BearerSecretValue',
  console: 'console-secret-ota87',
  userId: 'user-id-ota87',
};

afterEach(async () => {
  await Sentry.close(0);
  vi.unstubAllGlobals();
});

describe('browser Sentry options', () => {
  it('send envelopes to the tunnel, already scrubbed (OTA-79 scrubbing runs in the browser)', async () => {
    const sent: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        sent.push({
          url: input instanceof Request ? input.url : input.toString(),
          body: typeof init?.body === 'string' ? init.body : '',
        });
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );
    Sentry.init({
      ...BROWSER_SENTRY_OPTIONS,
      dsn: 'https://publickey@o1.ingest.de.sentry.io/42',
    });

    Sentry.setUser({ id: SECRETS.userId, email: SECRETS.email });
    console.log(`debug ${SECRETS.console}`);
    Sentry.captureException(
      new Error(
        `login failed for ${SECRETS.email} with password=${SECRETS.password} Bearer ${SECRETS.bearer}`,
      ),
    );
    await Sentry.flush(2000);

    const events = sent.filter((request) =>
      request.body.includes('"type":"event"'),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.url).toBe(SENTRY_TUNNEL_PATH);
    // The tunnel finds the project in the envelope header.
    expect(JSON.parse(events[0]?.body.split('\n')[0] ?? '{}')).toMatchObject({
      dsn: 'https://publickey@o1.ingest.de.sentry.io/42',
    });
    expect(events[0]?.body).toContain('[redacted]');
    for (const secret of Object.values(SECRETS)) {
      expect(sent.map((request) => request.body).join('\n')).not.toContain(
        secret,
      );
    }
  });
});
