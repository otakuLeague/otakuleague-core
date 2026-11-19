import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  redactText,
  redactValue,
  scrubBreadcrumb,
  scrubErrorEvent,
} from '@otakuleague/shared-types';

void describe('redactText', () => {
  void it('leaves text with nothing sensitive unchanged', () => {
    assert.equal(
      redactText('GET /anime/42 answered 200'),
      'GET /anime/42 answered 200',
    );
  });

  void it('returns an empty string unchanged', () => {
    assert.equal(redactText(''), '');
  });

  void it('masks credentials in a connection string but keeps the host', () => {
    assert.equal(
      redactText('connect postgresql://otaku:s3cret@db.internal:5432/app'),
      'connect postgresql://[redacted]@db.internal:5432/app',
    );
  });

  void it('masks Bearer and Basic credentials', () => {
    assert.equal(
      redactText('Authorization: Bearer abc.def-123'),
      'Authorization: [redacted] [redacted]',
    );
    assert.equal(redactText('Basic dXNlcjpwYXNz'), 'Basic [redacted]');
  });

  void it('keeps "Basic" and "Bearer" used as ordinary words', () => {
    assert.equal(
      redactText('Basic validation failed for field title'),
      'Basic validation failed for field title',
    );
  });

  void it('masks a URL password that contains an unencoded @', () => {
    assert.equal(
      redactText('postgres://user:p@ss@db.internal/app'),
      'postgres://[redacted]@db.internal/app',
    );
  });

  void it('masks a whole quoted value, spaces included', () => {
    assert.equal(
      redactText('{"password": "correct horse battery"}'),
      '{"password": "[redacted]"}',
    );
    assert.equal(redactText("otp='12 34'"), "otp='[redacted]'");
  });

  void it('masks a JSON Web Token anywhere in the text', () => {
    assert.equal(
      redactText('see x eyJhbGciOi.eyJzdWIiOjF9.c2lnbmF0dXJl end'),
      'see x [redacted] end',
    );
  });

  void it('masks key=value, key: value, quoted and JSON pairs', () => {
    assert.equal(
      redactText("WHERE password = 'hunter2'"),
      "WHERE password = '[redacted]'",
    );
    assert.equal(
      redactText('{"password":"hunter2","name":"Frieren"}'),
      '{"password":"[redacted]","name":"Frieren"}',
    );
    assert.equal(
      redactText('/callback?access_token=abc123&page=2'),
      '/callback?access_token=[redacted]&page=2',
    );
    assert.equal(redactText('api_key: k-123'), 'api_key: [redacted]');
    assert.equal(
      redactText('sessionId=s1; theme=dark'),
      'sessionId=[redacted]; theme=dark',
    );
  });

  void it('masks compound key names and the Token scheme', () => {
    assert.equal(
      redactText('passwordHash: "$argon2id$v=19$abc" secretKey=abc123'),
      'passwordHash: "[redacted]" secretKey=[redacted]',
    );
    assert.equal(
      redactText('refresh_token_hash=zz private_key=k'),
      'refresh_token_hash=[redacted] private_key=[redacted]',
    );
    assert.equal(
      redactText('Authorization: Token abc12345'),
      'Authorization: [redacted] [redacted]',
    );
  });

  void it('cuts text over 8 KB', () => {
    const redacted = redactText('a'.repeat(10_000));
    assert.equal(redacted.length, 8192 + '[truncated]'.length);
    assert.ok(redacted.endsWith('[truncated]'));
  });

  void it('stays near-linear on request paths built to backtrack (ReDoS)', () => {
    // Floor for time(n): below this, timer resolution makes the ratio noise.
    const MIN_BASELINE_MS = 0.05;
    const timeMs = (path: string): number => {
      const started = performance.now();
      redactText(path);
      return performance.now() - started;
    };

    // `-eyJ` and `a.` guard the WORD_RUN split; the others guard their own pattern.
    for (const [unit, count] of [
      ['-eyJ', 500],
      ['Bearer ', 285],
      ['a://', 500],
      ['password="', 200],
      ['a.', 1000],
    ] as const) {
      const smallPath = `/${unit.repeat(count)}`;
      const largePath = `/${unit.repeat(count * 4)}`;
      timeMs(smallPath);
      timeMs(largePath);
      let small = Infinity;
      let large = Infinity;
      // Interleaved best-of-25: a busy neighbour hits both sizes alike.
      for (let round = 0; round < 25; round += 1) {
        small = Math.min(small, timeMs(smallPath));
        large = Math.min(large, timeMs(largePath));
      }
      const ratio = large / Math.max(small, MIN_BASELINE_MS);
      // 4x the input: linear is ~4 (p95 ~4.5), injected quadratics are ~9-15x.
      assert.ok(
        ratio < 8,
        `${unit}: 4x input took ${ratio.toFixed(2)}x longer (${small.toFixed(2)} ms -> ${large.toFixed(2)} ms)`,
      );
    }
  });

  void it('masks email addresses', () => {
    assert.equal(
      redactText('user frieren.elf+test@mage.example.com not found'),
      'user [email] not found',
    );
  });

  void it('masks every local-part character sign-up accepts', () => {
    for (const address of [
      "o'neil@example.com",
      'a!b#c$d%e&f*g/h=i?j^k`l{m|n}o~p@example.com',
    ]) {
      assert.equal(redactText(`sent to ${address} ok`), 'sent to [email] ok');
    }
  });

  void it('keeps package versions in stack trace paths', () => {
    const frame =
      'at file:///repo/node_modules/.pnpm/@nestjs+core@12.1.3_@babel+core@7.29.7/node_modules/x.js:44:37';
    assert.equal(redactText(frame), frame);
  });

  void it('stays fast on a long string with no match', () => {
    const started = performance.now();
    redactText(`${'a'.repeat(500_000)}@`);
    assert.ok(performance.now() - started < 1000);
  });
});

void describe('redactValue', () => {
  void it('masks the value of sensitive keys at any depth, whatever its type', () => {
    assert.deepEqual(
      redactValue({
        headers: { Authorization: 'Bearer x', cookie: { sid: '1' } },
        user: { password: 42, name: 'Frieren' },
        API_KEY: 'k',
        credentials: ['a'],
        privateKey: 'pk',
        auth: 'a',
        jwt: 'j',
      }),
      {
        headers: { Authorization: '[redacted]', cookie: '[redacted]' },
        user: { password: '[redacted]', name: 'Frieren' },
        API_KEY: '[redacted]',
        credentials: '[redacted]',
        privateKey: '[redacted]',
        auth: '[redacted]',
        jwt: '[redacted]',
      },
    );
  });

  void it('masks the internal API key under its header and env names (ADR 0015, 0019)', () => {
    const key = 'fake-internal-api-key-'.padEnd(64, '0');
    const masked = redactValue({
      headers: { 'x-internal-api-key': key },
      env: {
        INTERNAL_API_KEY: key,
        INTERNAL_API_KEY_PREVIOUS: key,
        INTERNAL_API_KEY_PREVIEW: key,
      },
      line: `X-Internal-Api-Key: ${key}`,
    });

    assert.doesNotMatch(JSON.stringify(masked), /fake-internal-api-key/);
  });

  void it('masks the auth HMAC key under its env name, as a field and in a line (ADR 0015)', () => {
    const key = 'fake-auth-hmac-key-'.padEnd(64, '0');
    const masked = redactValue({
      env: { AUTH_HMAC_KEY: key, authHmacKey: key },
      line: `AUTH_HMAC_KEY=${key}`,
      json: JSON.stringify({ AUTH_HMAC_KEY: key }),
    });

    assert.deepEqual(masked.env, {
      AUTH_HMAC_KEY: '[redacted]',
      authHmacKey: '[redacted]',
    });
    assert.doesNotMatch(JSON.stringify(masked), /fake-auth-hmac-key/);
  });

  void it('redacts strings inside arrays and nested objects', () => {
    assert.deepEqual(redactValue({ list: ['mail me at a@b.co', 1, null] }), {
      list: ['mail me at [email]', 1, null],
    });
  });

  void it('keeps primitives, empty containers and dates as they are', () => {
    const date = new Date(0);
    assert.equal(redactValue(7), 7);
    assert.equal(redactValue(undefined), undefined);
    assert.deepEqual(redactValue({}), {});
    assert.deepEqual(redactValue([]), []);
    assert.equal(redactValue(date), date);
  });

  void it('walks class instances such as a validated DTO', () => {
    class SignUpDto {
      readonly email = 'frieren@example.com';
      readonly password = 'hunter2';
      readonly name = 'Frieren';
    }
    assert.deepEqual(redactValue({ params: new SignUpDto() }), {
      params: { email: '[email]', password: '[redacted]', name: 'Frieren' },
    });
  });

  void it('turns a nested error into its redacted stack', () => {
    const error = new Error('login failed with password=hunter2');
    error.stack =
      'Error: login failed with password=hunter2\n    at login (auth.ts:1:1)';
    assert.deepEqual(redactValue({ cause: error }), {
      cause:
        'Error: login failed with password=[redacted]\n    at login (auth.ts:1:1)',
    });
  });

  void it('never mutates its input', () => {
    const input = { password: 'hunter2', nested: { note: 'token=abc' } };
    redactValue(input);
    assert.deepEqual(input, {
      password: 'hunter2',
      nested: { note: 'token=abc' },
    });
  });

  void it('replaces a cycle instead of recursing forever', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;
    assert.deepEqual(redactValue(node), { name: 'root', self: '[circular]' });
  });

  void it('does not mistake a repeated, non-cyclic reference for a cycle', () => {
    const shared = { name: 'Madhouse' };
    assert.deepEqual(redactValue({ a: shared, b: shared }), {
      a: { name: 'Madhouse' },
      b: { name: 'Madhouse' },
    });
  });
});

void describe('scrubErrorEvent', () => {
  void it('keeps only the method and the URL without query or fragment', () => {
    const scrubbed = scrubErrorEvent({
      request: {
        method: 'POST',
        url: 'https://api.example.com/quiz?token=abc#top',
        headers: { cookie: 'sid=1' },
        cookies: { sid: '1' },
        query_string: 'token=abc',
        data: { password: 'hunter2' },
      },
    });
    assert.deepEqual(scrubbed.request, {
      method: 'POST',
      url: 'https://api.example.com/quiz',
    });
  });

  void it('drops the user and redacts the rest of the event', () => {
    const scrubbed = scrubErrorEvent({
      user: { ip_address: '203.0.113.7', email: 'a@b.co' },
      exception: {
        values: [{ value: 'login failed for a@b.co with password=hunter2' }],
      },
      breadcrumbs: [{ message: 'GET postgres://u:p@db/app' }],
    });
    assert.equal(scrubbed.user, undefined);
    assert.equal(
      scrubbed.exception.values[0]?.value,
      'login failed for [email] with password=[redacted]',
    );
    assert.equal(
      scrubbed.breadcrumbs[0]?.message,
      'GET postgres://[redacted]@db/app',
    );
  });

  void it('accepts an event without a request', () => {
    assert.deepEqual(scrubErrorEvent({ message: 'boom', user: { id: '7' } }), {
      message: 'boom',
      user: undefined,
      request: undefined,
    });
  });
});

void describe('scrubBreadcrumb', () => {
  void it('drops console breadcrumbs', () => {
    assert.equal(
      scrubBreadcrumb({ category: 'console', message: 'user a@b.co' }),
      null,
    );
  });

  void it('drops the query and fragment of navigation and fetch URLs', () => {
    assert.deepEqual(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/search?q=frieren', to: '/anime/1#top', other: 'x?y' },
      }),
      {
        category: 'navigation',
        data: { from: '/search', to: '/anime/1', other: 'x?y' },
      },
    );
    assert.deepEqual(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: '/x?token=1', status_code: 200 },
      }),
      { category: 'fetch', data: { url: '/x', status_code: 200 } },
    );
  });

  void it('keeps a breadcrumb without data as it is', () => {
    const click = { category: 'ui.click', message: 'button' };
    assert.equal(scrubBreadcrumb(click), click);
  });
});
