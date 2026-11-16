import { HttpStatus } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { describe, expect, it } from 'vitest';
import {
  type ApiCaller,
  OPEN_CALLER,
  PREVIEW_CALLER,
  recordCaller,
  visitorKeyFromClientIp,
} from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import {
  CLIENT_IP_REQUIRED_MESSAGE,
  clientIpOf,
  CredentialGuard,
} from './credential.guard';

const webCaller = (clientIp: unknown): ApiCaller => ({
  kind: 'web',
  visitorKey: visitorKeyFromClientIp(clientIp),
});

function run(caller: ApiCaller | null) {
  const request = { method: 'POST', headers: {} };
  if (caller !== null) recordCaller(request, caller);
  const context = new ExecutionContextHost([request, {}, () => undefined]);
  const attempt = (): boolean => new CredentialGuard().canActivate(context);
  return { request, attempt };
}

function refusal(attempt: () => boolean): ApiException {
  try {
    attempt();
  } catch (caught: unknown) {
    if (caught instanceof ApiException) return caught;
    throw caught;
  }
  throw new Error('The guard let the request through');
}

describe('CredentialGuard', () => {
  it.each([
    ['an IPv4', '203.0.113.7', '203.0.113.7'],
    ['an IPv6, cut to its /64', '2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
  ])('records the client IP of a web caller with %s', (_, header, key) => {
    const { request, attempt } = run(webCaller(header));

    expect(attempt()).toBe(true);
    expect(clientIpOf(request)).toBe(key);
  });

  it.each([
    ['no X-Client-Ip', undefined],
    ['text', 'not-an-ip'],
    ['a list', '203.0.113.7, 198.51.100.1'],
    ['a port', '203.0.113.7:443'],
  ])('answers 400 to a web caller with %s and records nothing', (_, header) => {
    const { request, attempt } = run(webCaller(header));

    const error = refusal(attempt);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.error).toEqual({
      code: 'BAD_REQUEST',
      message: CLIENT_IP_REQUIRED_MESSAGE,
    });
    expect(() => clientIpOf(request)).toThrow();
  });

  it.each([
    ['open', OPEN_CALLER],
    ['preview', PREVIEW_CALLER],
  ])('answers 403 INTERNAL_KEY_REQUIRED to an %s caller', (_, caller) => {
    const { request, attempt } = run(caller);

    const error = refusal(attempt);
    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(error.error.code).toBe('INTERNAL_KEY_REQUIRED');
    expect(() => clientIpOf(request)).toThrow();
  });

  it('fails (500), never lets through, when no caller was recorded', () => {
    const { attempt } = run(null);

    expect(attempt).toThrow('No ApiCaller recorded for this request');
  });
});
