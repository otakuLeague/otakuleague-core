import type { ApiErrorCode } from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/client';
import type { SessionCallResult } from './session-call';
import { viewerFrom, type Viewer } from './viewer';

type Result = SessionCallResult<unknown>;
const ME = { id: 'u1', username: 'Frieren_99' };
const ok = (data: unknown): Result => ({
  kind: 'called',
  result: { ok: true, data },
});
const fail = (failure: ApiFailure): Result => ({
  kind: 'called',
  result: { ok: false, failure },
});
const api = (
  status: number,
  code: Exclude<ApiErrorCode, 'VALIDATION_FAILED'>,
) =>
  fail({ kind: 'api_error', status, error: { error: { code, message: 'x' } } });
const IN: Viewer = { kind: 'signed_in', username: ME.username };
const OUT: Viewer = { kind: 'signed_out' };
const NONE: Viewer = { kind: 'unavailable' };
const PREVIEW: Result = { kind: 'refused', reason: 'preview_deployment' };

describe('viewerFrom', () => {
  it.each([
    ['a 200 /me', ok(ME), IN],
    ['a 200 off contract', ok({ ...ME, username: '<b>' }), NONE],
    ['a 401 UNAUTHORIZED', api(401, 'UNAUTHORIZED'), OUT],
    ['a preview refusal', PREVIEW, OUT],
    ['a 401 of another code', api(401, 'INVALID_CREDENTIALS'), NONE],
    ['a 403 INTERNAL_KEY_REQUIRED', api(403, 'INTERNAL_KEY_REQUIRED'), NONE],
    [
      'a 401 not an envelope',
      fail({ kind: 'invalid_response', status: 401 }),
      NONE,
    ],
    ['a timeout', fail({ kind: 'timeout' }), NONE],
    ['a 429', api(429, 'TOO_MANY_REQUESTS'), NONE],
  ])('maps %s', (_label, callResult, viewer) => {
    expect(viewerFrom(callResult)).toEqual(viewer);
  });
});
