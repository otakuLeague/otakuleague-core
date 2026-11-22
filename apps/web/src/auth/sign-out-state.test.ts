// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTION_THROTTLED_TEXT } from './action-throttle-text';
import { signOutStateFromThrow } from './sign-out-state';

describe('signOutStateFromThrow', () => {
  it('is throttled for an Error whose message is exactly the 429 body', () => {
    expect(signOutStateFromThrow(new Error(ACTION_THROTTLED_TEXT))).toEqual({
      kind: 'throttled',
    });
  });

  it.each([
    ['an Error with another message', new Error('Server Action unavailable.')],
    ['the 429 body with whitespace', new Error(`${ACTION_THROTTLED_TEXT}\n`)],
    ['a non-Error with the 429 body', { message: ACTION_THROTTLED_TEXT }],
    ['a string', ACTION_THROTTLED_TEXT],
    ['undefined', undefined],
  ])('is failed for %s', (_label, thrown) => {
    expect(signOutStateFromThrow(thrown)).toEqual({ kind: 'failed' });
  });
});

describe("Next's client turns a text/plain error body into the thrown message", () => {
  // Read as text, not imported, so no next/dist import enters the bundle or the lint gate. If this
  // fails after a Next upgrade, re-check `signOutStateFromThrow`: a throttled sign-out may read `failed`.
  it('still reads the body of a failed text/plain action response', () => {
    const reducer = readFileSync(
      new URL(
        '../../node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js',
        import.meta.url,
      ),
      'utf8',
    );
    expect(reducer).toContain(
      "res.status >= 400 && contentType === 'text/plain' ? await res.text()",
    );
  });
});
