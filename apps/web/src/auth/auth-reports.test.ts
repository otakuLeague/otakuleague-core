// @vitest-environment node
import { scrubErrorEvent, type ApiErrorCode } from '@otakuleague/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../api/client';
import {
  authCallFaultOf,
  isRefusalReportDue,
  type AuthCallFault,
} from './auth-reports';

const mocks = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
  after: vi.fn<(callback: () => unknown) => void>(),
}));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: mocks.captureMessage,
  flush: mocks.flush,
}));
vi.mock('next/server', () => ({ after: mocks.after }));

const REPORT = [
  'Credential call refused: client IP unknown',
  {
    level: 'error',
    tags: { auth_route: 'sign-in' },
    fingerprint: ['credential-call-client-ip-unknown'],
  },
];

/** A fresh module, so the per-instance throttle starts empty. */
async function freshReporter() {
  vi.resetModules();
  const { reportClientIpUnknown } = await import('./auth-reports');
  return reportClientIpUnknown;
}

describe('isRefusalReportDue', () => {
  it.each([
    [undefined, 0, true],
    [1_000, 1_000, false],
    [1_000, 1_000 + 599_999, false],
    [1_000, 1_000 + 600_000, true],
  ])('last report %o, now %i: due %o', (lastReportedAtMs, nowMs, due) => {
    expect(isRefusalReportDue(lastReportedAtMs, nowMs)).toBe(due);
  });
});

describe('reportClientIpUnknown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures one error with the route tag and a fixed fingerprint only, flushed after the response', async () => {
    const report = await freshReporter();
    report('sign-in', 5_000);
    expect(mocks.captureMessage.mock.calls).toEqual([REPORT]);
    expect(mocks.flush).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.lastCall?.[0]();
    expect(mocks.flush.mock.calls).toEqual([[2000]]);
  });

  it('captures nothing more inside the window, then once again after it', async () => {
    const report = await freshReporter();
    report('sign-in', 5_000);
    report('sign-in', 5_000 + 599_999);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    report('sign-in', 5_000 + 600_000);
    expect(mocks.captureMessage.mock.calls).toEqual([REPORT, REPORT]);
  });
});

type Code = Exclude<ApiErrorCode, 'VALIDATION_FAILED'>;
const api = (status: number, code: Code): ApiFailure => ({
  kind: 'api_error',
  status,
  error: { error: { code, message: 'x' } },
});
const invalid = (status: number): ApiFailure => ({
  kind: 'invalid_response',
  status,
});

describe('authCallFaultOf', () => {
  it.each([
    [api(403, 'INTERNAL_KEY_REQUIRED'), 'internal_key_refused'],
    [invalid(200), 'invalid_response'],
    [invalid(401), 'invalid_response'],
    [invalid(502), undefined],
    [api(403, 'SIGN_UP_CLOSED'), undefined],
    [api(401, 'INTERNAL_KEY_REQUIRED'), undefined],
    [api(429, 'TOO_MANY_REQUESTS'), undefined],
    [{ kind: 'timeout' }, undefined],
  ] satisfies [ApiFailure, AuthCallFault | undefined][])(
    '%j is %s',
    (failure, fault) => {
      expect(authCallFaultOf(failure)).toBe(fault);
    },
  );
});

describe('reportAuthCallFault', () => {
  const faultReport = (auth_route: string, auth_fault: string) => [
    'Auth call fault',
    {
      level: 'error',
      tags: { auth_route, auth_fault },
      fingerprint: ['auth-call-fault', auth_fault],
    },
  ];

  it('throttles per report kind across routes, with only the tags and a fixed fingerprint', async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const reporters = await import('./auth-reports');
    reporters.reportAuthCallFault('me', 'invalid_response', 5_000);
    reporters.reportAuthCallFault('sign-out', 'invalid_response', 604_999);
    reporters.reportAuthCallFault('me', 'configuration', 5_001);
    reporters.reportClientIpUnknown('sign-in', 5_002);
    reporters.reportAuthCallFault('sign-in', 'invalid_response', 605_000);

    expect(mocks.captureMessage.mock.calls).toEqual([
      faultReport('me', 'invalid_response'),
      faultReport('me', 'configuration'),
      REPORT,
      faultReport('sign-in', 'invalid_response'),
    ]);
    await mocks.after.mock.calls[0]?.[0]();
    expect(mocks.flush.mock.calls).toEqual([[2000]]);
  });

  it('throttles revocation_unconfirmed on its own: an outage never hides configuration or the reverse', async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { reportAuthCallFault } = await import('./auth-reports');
    reportAuthCallFault('sign-out', 'revocation_unconfirmed', 5_000);
    reportAuthCallFault('sign-out', 'configuration', 5_001);
    reportAuthCallFault('sign-out', 'revocation_unconfirmed', 604_999);
    reportAuthCallFault('sign-out', 'configuration', 604_999);
    reportAuthCallFault('sign-out', 'revocation_unconfirmed', 605_000);

    expect(mocks.captureMessage.mock.calls).toEqual([
      faultReport('sign-out', 'revocation_unconfirmed'),
      faultReport('sign-out', 'configuration'),
      faultReport('sign-out', 'revocation_unconfirmed'),
    ]);
  });

  it("sends tags and a fingerprint that Sentry's beforeSend scrubber keeps unchanged", async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const reporters = await import('./auth-reports');
    reporters.reportClientIpUnknown('sign-in', 5_000);
    reporters.reportAuthCallFault('sign-in', 'internal_key_refused', 5_000);
    reporters.reportAuthCallFault('me', 'invalid_response', 5_000);
    reporters.reportAuthCallFault('sign-out', 'configuration', 5_000);
    reporters.reportAuthCallFault('sign-out', 'revocation_unconfirmed', 5_000);

    const sent = mocks.captureMessage.mock.calls.map(
      ([, context]: unknown[]) => context,
    );
    expect(sent).toHaveLength(5);
    expect(
      sent.map((context) => scrubErrorEvent({ ...(context as object) })),
    ).toEqual(sent);
  });

  it('never throws, even when after() does (outside a request)', async () => {
    vi.resetModules();
    const { reportAuthCallFault } = await import('./auth-reports');
    mocks.after.mockImplementationOnce(() => {
      throw new Error('after() outside a request scope');
    });

    expect(() =>
      reportAuthCallFault('me', 'configuration', 5_000),
    ).not.toThrow();
  });
});
