import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMAIL_VERIFICATION_LINK, redactText } from '@otakuleague/shared-types';

void describe('EMAIL_VERIFICATION_LINK (ADR 0015 Addendum 1f-vi)', () => {
  void it('pins the path the web serves and the parameter the email writes', () => {
    assert.deepEqual(EMAIL_VERIFICATION_LINK, {
      path: '/auth/verify',
      tokenParam: 'token',
    });
  });

  void it('names a parameter the redaction masks in any text', () => {
    const token = 'A'.repeat(43);
    const { path, tokenParam } = EMAIL_VERIFICATION_LINK;
    const redacted = redactText(`GET ${path}?${tokenParam}=${token}`);

    assert.equal(redacted.includes(token), false);
  });
});
