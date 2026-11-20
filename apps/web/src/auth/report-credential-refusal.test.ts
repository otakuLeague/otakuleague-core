// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRefusalReportDue } from './report-credential-refusal';

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
    tags: { credential_route: 'sign-in' },
    fingerprint: ['credential-call-client-ip-unknown'],
  },
];

/** A fresh module, so the per-instance throttle starts empty. */
async function freshReporter() {
  vi.resetModules();
  const { reportClientIpUnknown } = await import('./report-credential-refusal');
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
