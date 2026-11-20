// @vitest-environment node
import type { ApiErrorCode } from '@otakuleague/shared-types';
import { notFound } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import type { SessionToken } from '../api/session-token';
import { deleteSession } from './delete-session';

const mocks = vi.hoisted(() => ({ sessionCall: vi.fn(), report: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn(), after: vi.fn() }));
vi.mock('./session-call', () => ({ sessionCall: mocks.sessionCall }));
vi.mock('./report-credential-refusal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./report-credential-refusal')>()),
  reportAuthCallFault: mocks.report,
}));

const TOKEN = `${'aZ09_-'.repeat(7)}x` as SessionToken;
const called = (result: unknown) => ({ kind: 'called', result });
const failed = (failure: ApiFailure) => called({ ok: false, failure });
const api = (
  status: number,
  code: Exclude<ApiErrorCode, 'VALIDATION_FAILED'>,
) =>
  failed({
    kind: 'api_error',
    status,
    error: { error: { code, message: 'x' } },
  });
const NEXT_SIGNAL: unknown = (() => {
  try {
    notFound();
  } catch (signal) {
    return signal;
  }
})();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sessionCall.mockResolvedValue(called({ ok: true, data: undefined }));
});

describe('deleteSession', () => {
  it('makes exactly one POST /auth/sign-out with the session and a 2 s timeout, unreported on 204', async () => {
    await expect(deleteSession(TOKEN)).resolves.toBeUndefined();

    expect(mocks.sessionCall.mock.calls).toEqual([
      [
        {
          session: TOKEN,
          path: '/auth/sign-out',
          method: 'POST',
          timeoutMs: 2000,
        },
      ],
    ]);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it.each([
    ['a 401 (expired or replayed: already gone)', api(401, 'UNAUTHORIZED')],
    ['a timeout', failed({ kind: 'timeout' })],
    ['a network failure', failed({ kind: 'network' })],
    ['a 503 envelope', api(503, 'SERVICE_UNAVAILABLE')],
    ['a non-envelope 5xx', failed({ kind: 'invalid_response', status: 502 })],
    ['a 404 envelope', api(404, 'NOT_FOUND')],
    ['a preview refusal', { kind: 'refused', reason: 'preview_deployment' }],
  ])('resolves on %s, once, never retried or reported', async (_, outcome) => {
    mocks.sessionCall.mockResolvedValue(outcome);

    await expect(deleteSession(TOKEN)).resolves.toBeUndefined();
    expect(mocks.sessionCall).toHaveBeenCalledTimes(1);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  // A 403 INTERNAL_KEY_REQUIRED, and a non-envelope 200 or 401.
  it.each([
    ['internal_key_refused', api(403, 'INTERNAL_KEY_REQUIRED')],
    ['invalid_response', failed({ kind: 'invalid_response', status: 200 })],
    ['invalid_response', failed({ kind: 'invalid_response', status: 401 })],
  ])('resolves and reports %s once as sign-out: %o', async (fault, outcome) => {
    mocks.sessionCall.mockResolvedValue(outcome);

    await expect(deleteSession(TOKEN)).resolves.toBeUndefined();
    expect(mocks.report.mock.calls).toEqual([['sign-out', fault]]);
  });

  it('resolves when the call throws (a missing key), reported as configuration', async () => {
    mocks.sessionCall.mockRejectedValue(new Error('no key'));

    await expect(deleteSession(TOKEN)).resolves.toBeUndefined();
    expect(mocks.report.mock.calls).toEqual([['sign-out', 'configuration']]);
  });

  it("rethrows Next's control-flow signals, unreported", async () => {
    mocks.sessionCall.mockRejectedValue(NEXT_SIGNAL);

    await expect(deleteSession(TOKEN)).rejects.toBe(NEXT_SIGNAL);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
