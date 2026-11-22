import { HttpStatus } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { describe, expect, it, vi } from 'vitest';
import {
  type ApiCaller,
  OPEN_CALLER,
  PREVIEW_CALLER,
  recordCaller,
  visitorKeyFromClientIp,
} from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import { toErrorResponse } from '../common/filters/api-exception.filter';
import { Prisma } from '../generated/prisma/client';
import { currentSessionOf, SessionGuard } from './session.guard';
import type { SessionResolution, SessionService } from './session.service';

// An obvious fake of the real shape (43 base64url characters).
const TOKEN = 'fake-session-token-'.padEnd(43, 'A');
const WEB: ApiCaller = {
  kind: 'web',
  visitorKey: visitorKeyFromClientIp('203.0.113.7'),
};
const SESSION = {
  sessionId: 's-1',
  userId: 'u-1',
  username: 'Frieren',
  sessionEpoch: 0,
};
const SIGNED_IN: SessionResolution = { kind: 'signed_in', session: SESSION };

function setup(resolve: () => Promise<SessionResolution>) {
  const resolveSpy = vi.fn(resolve);
  const guard = new SessionGuard({
    resolve: resolveSpy,
  } as unknown as SessionService);
  const run = (caller: ApiCaller, authorization?: string) => {
    const request = { method: 'GET', headers: { authorization } };
    recordCaller(request, caller);
    const context = new ExecutionContextHost([request, {}, () => undefined]);
    return { request, result: guard.canActivate(context) };
  };
  return { resolveSpy, run };
}

async function expectRefused(
  result: Promise<boolean>,
  status: HttpStatus = HttpStatus.UNAUTHORIZED,
): Promise<void> {
  const error: unknown = await result.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiException);
  expect(toErrorResponse(error).status).toBe(status);
}

describe('SessionGuard', () => {
  it('records the session of a web caller with a valid token', async () => {
    const { resolveSpy, run } = setup(() => Promise.resolve(SIGNED_IN));
    const { request, result } = run(WEB, `Bearer ${TOKEN}`);

    await expect(result).resolves.toBe(true);
    expect(resolveSpy).toHaveBeenCalledWith(TOKEN);
    expect(currentSessionOf(request)).toEqual(SESSION);
  });

  it.each([
    ['no header', undefined],
    ['another scheme', `Basic ${TOKEN}`],
    ['a short token', `Bearer ${TOKEN.slice(1)}`],
  ])('answers 401 to %s without a database call', async (_, header) => {
    const { resolveSpy, run } = setup(() => Promise.resolve(SIGNED_IN));

    await expectRefused(run(WEB, header).result);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it.each([
    [OPEN_CALLER, HttpStatus.FORBIDDEN],
    [PREVIEW_CALLER, HttpStatus.UNAUTHORIZED],
  ])(
    'refuses a %o caller with %i, without a database call',
    async (caller, status) => {
      const { resolveSpy, run } = setup(() => Promise.resolve(SIGNED_IN));

      await expectRefused(run(caller, `Bearer ${TOKEN}`).result, status);
      expect(resolveSpy).not.toHaveBeenCalled();
    },
  );

  it('answers 401 to a signed-out token and records nothing', async () => {
    const { run } = setup(() => Promise.resolve({ kind: 'signed_out' }));
    const { request, result } = run(WEB, `Bearer ${TOKEN}`);

    await expectRefused(result);
    expect(() => currentSessionOf(request)).toThrow();
  });

  it.each([
    [
      'database down',
      new Prisma.PrismaClientInitializationError(
        "Can't reach database server",
        '7.10.1',
      ),
    ],
    ['pool wait', new Error('timeout exceeded when trying to connect')],
  ])('lets a %s through as 503, never 401', async (_, outage) => {
    const { run } = setup(() => Promise.reject(outage));

    const error: unknown = await run(WEB, `Bearer ${TOKEN}`).result.catch(
      (caught: unknown) => caught,
    );
    expect(error).toBe(outage);
    expect(toErrorResponse(error).status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
