// @vitest-environment node
import type { ApiErrorCode } from '@otakuleague/shared-types';
import { notFound } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import type { SessionToken } from '../api/session-token';
import { deleteSession } from './delete-session';
import type { SessionRequest } from './session-call';

const mocks = vi.hoisted(() => ({
  sessionCall: vi.fn<(request: SessionRequest<unknown>) => Promise<unknown>>(),
  report: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn(), after: vi.fn() }));
vi.mock('./session-call', () => ({ sessionCall: mocks.sessionCall }));
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
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
          isExpectedBody: expect.any(Function) as unknown,
        },
      ],
    ]);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('counts only an empty 204 body as revoked: a 2xx with a body fails the guard', async () => {
    await deleteSession(TOKEN);
    const isExpectedBody = mocks.sessionCall.mock.calls[0]?.[0].isExpectedBody;

    expect(
      [undefined, null, {}, ''].map((body) => isExpectedBody?.(body)),
    ).toEqual([true, false, false, false]);
  });

  it.each([
    ['a 401 (expired or replayed: already gone)', api(401, 'UNAUTHORIZED')],
    ['a preview refusal', { kind: 'refused', reason: 'preview_deployment' }],
  ])('resolves on %s, once, never retried or reported', async (_, outcome) => {
    mocks.sessionCall.mockResolvedValue(outcome);

    await expect(deleteSession(TOKEN)).resolves.toBeUndefined();
    expect(mocks.sessionCall).toHaveBeenCalledTimes(1);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it.each([
    ['a timeout', failed({ kind: 'timeout' })],
    ['a network failure', failed({ kind: 'network' })],
    ['a 429 envelope', api(429, 'TOO_MANY_REQUESTS')],
    ['a 503 envelope', api(503, 'SERVICE_UNAVAILABLE')],
    ['a non-envelope 5xx', failed({ kind: 'invalid_response', status: 502 })],
    ['a 404 envelope', api(404, 'NOT_FOUND')],
    ['a 401 envelope other than UNAUTHORIZED', api(401, 'INVALID_CREDENTIALS')],
  ])(
    'resolves on %s, once, never retried, reported once as revocation_unconfirmed',
    async (_, outcome) => {
      mocks.sessionCall.mockResolvedValue(outcome);

      await expect(deleteSession(TOKEN)).resolves.toBeUndefined();
      expect(mocks.sessionCall).toHaveBeenCalledTimes(1);
      expect(mocks.report.mock.calls).toEqual([
        ['sign-out', 'revocation_unconfirmed'],
      ]);
    },
  );

  // A 403 INTERNAL_KEY_REQUIRED, and a non-envelope 200 or 401: the fault only, never both.
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
