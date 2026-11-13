import { createHash } from 'node:crypto';
import { HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { redactText } from '@otakuleague/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentVariables } from '../config/environment';
import { ApiException } from './api.exception';
import {
  EnvironmentInternalKeySettings,
  INTERNAL_API_KEY_HEADER,
  type InternalKeyCheck,
  InternalKeyGuard,
  InternalKeySettings,
  isAcceptedKey,
  MAX_INTERNAL_KEY_HEADER_LENGTH,
  PublicRoute,
} from './internal-key.guard';

// Obvious fakes of a valid shape (64 characters, like `openssl rand -hex 32`).
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIOUS_KEY = 'fake-previous-api-key-'.padEnd(64, '0');

class FixedKeySettings extends InternalKeySettings {
  constructor(private readonly check: InternalKeyCheck) {
    super();
  }

  get(): InternalKeyCheck {
    return this.check;
  }
}

class SampleController {
  @PublicRoute()
  health(): void {}

  search(): void {}
}

const ENFORCED: InternalKeyCheck = {
  kind: 'enforced',
  acceptedKeys: [FAKE_KEY, FAKE_PREVIOUS_KEY],
};

function guardFor(check: InternalKeyCheck): InternalKeyGuard {
  return new InternalKeyGuard(new Reflector(), new FixedKeySettings(check));
}

function contextFor(
  handler: 'health' | 'search',
  headers: Record<string, string | string[]>,
): ExecutionContextHost {
  const method: unknown = Reflect.get(SampleController.prototype, handler);
  if (typeof method !== 'function') throw new Error(`no handler ${handler}`);
  return new ExecutionContextHost(
    [{ headers }, {}, () => undefined],
    SampleController,
    method,
  );
}

function refusal(
  guard: InternalKeyGuard,
  context: ExecutionContextHost,
): ApiException {
  try {
    guard.canActivate(context);
  } catch (error) {
    if (error instanceof ApiException) return error;
    throw error;
  }
  throw new Error('expected the guard to refuse');
}

describe('InternalKeyGuard', () => {
  it.each([
    ['the current key', FAKE_KEY],
    ['the previous key, during a rotation', FAKE_PREVIOUS_KEY],
  ])('lets %s through', (_, key) => {
    expect(
      guardFor(ENFORCED).canActivate(
        contextFor('search', { [INTERNAL_API_KEY_HEADER]: key }),
      ),
    ).toBe(true);
  });

  it.each<[string, Record<string, string | string[]>]>([
    ['a missing header', {}],
    ['an empty header', { [INTERNAL_API_KEY_HEADER]: '' }],
    [
      'a wrong key of the same length',
      { [INTERNAL_API_KEY_HEADER]: 'f'.repeat(64) },
    ],
    [
      'the key minus its last character',
      { [INTERNAL_API_KEY_HEADER]: FAKE_KEY.slice(0, -1) },
    ],
    ['the key plus a character', { [INTERNAL_API_KEY_HEADER]: `${FAKE_KEY}0` }],
    [
      'the key in upper case',
      { [INTERNAL_API_KEY_HEADER]: FAKE_KEY.toUpperCase() },
    ],
    [
      'the key with a space before it',
      { [INTERNAL_API_KEY_HEADER]: ` ${FAKE_KEY}` },
    ],
    [
      'a repeated header (array)',
      { [INTERNAL_API_KEY_HEADER]: [FAKE_KEY, FAKE_KEY] },
    ],
    [
      'a repeated header (joined by Node)',
      { [INTERNAL_API_KEY_HEADER]: `${FAKE_KEY}, ${FAKE_KEY}` },
    ],
    [
      'one character over the cap',
      {
        [INTERNAL_API_KEY_HEADER]: 'k'.repeat(
          MAX_INTERNAL_KEY_HEADER_LENGTH + 1,
        ),
      },
    ],
    [
      'the key padded to 513 characters',
      {
        [INTERNAL_API_KEY_HEADER]: FAKE_KEY.padEnd(
          MAX_INTERNAL_KEY_HEADER_LENGTH + 1,
          ' ',
        ),
      },
    ],
    ['the key under another header', { authorization: `Bearer ${FAKE_KEY}` }],
  ])('refuses %s with the same 403 envelope', (_, headers) => {
    const error = refusal(guardFor(ENFORCED), contextFor('search', headers));

    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(error.error).toEqual({
      code: 'INTERNAL_KEY_REQUIRED',
      message: 'This API answers only the OtakuLeague web server.',
    });
  });

  it('refuses the previous key once it is no longer configured', () => {
    const guard = guardFor({ kind: 'enforced', acceptedKeys: [FAKE_KEY] });
    const context = contextFor('search', {
      [INTERNAL_API_KEY_HEADER]: FAKE_PREVIOUS_KEY,
    });

    expect(refusal(guard, context).getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it.each<[string, Record<string, string>]>([
    ['no key', {}],
    ['a wrong key', { [INTERNAL_API_KEY_HEADER]: 'f'.repeat(64) }],
  ])('lets a @PublicRoute() handler answer with %s', (_, headers) => {
    expect(guardFor(ENFORCED).canActivate(contextFor('health', headers))).toBe(
      true,
    );
  });

  it('refuses a value too short to be a key, even if such a key were accepted', () => {
    const digest = (value: string) =>
      createHash('sha256').update(value, 'utf8').digest();

    expect(isAcceptedKey('', [digest('')])).toBe(false);
    expect(isAcceptedKey('k'.repeat(42), [digest('k'.repeat(42))])).toBe(false);
    expect(isAcceptedKey('k'.repeat(43), [digest('k'.repeat(43))])).toBe(true);
  });

  it('lets every request through while no key is configured', () => {
    const guard = guardFor({ kind: 'open' });

    expect(guard.canActivate(contextFor('search', {}))).toBe(true);
    expect(
      guard.canActivate(
        contextFor('search', { [INTERNAL_API_KEY_HEADER]: 'f'.repeat(64) }),
      ),
    ).toBe(true);
  });
});

function settingsFrom(
  environment: Partial<Record<keyof EnvironmentVariables, string>>,
): EnvironmentInternalKeySettings {
  // Every variable the settings read is given, so nothing falls back to process.env.
  return new EnvironmentInternalKeySettings(
    new ConfigService<EnvironmentVariables, true>({
      NODE_ENV: 'development',
      INTERNAL_API_KEY: '',
      INTERNAL_API_KEY_PREVIOUS: '',
      ...environment,
    }),
  );
}

describe('EnvironmentInternalKeySettings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['unset', {}],
    [
      'empty (KEY= in .env)',
      { INTERNAL_API_KEY: '', INTERNAL_API_KEY_PREVIOUS: '' },
    ],
  ])('is open when the key is %s', (_, environment) => {
    expect(settingsFrom(environment).get()).toEqual({ kind: 'open' });
  });

  it('accepts the key, then the previous key when one is set', () => {
    expect(settingsFrom({ INTERNAL_API_KEY: FAKE_KEY }).get()).toEqual({
      kind: 'enforced',
      acceptedKeys: [FAKE_KEY],
    });
    expect(
      settingsFrom({
        INTERNAL_API_KEY: FAKE_KEY,
        INTERNAL_API_KEY_PREVIOUS: FAKE_PREVIOUS_KEY,
      }).get(),
    ).toEqual({
      kind: 'enforced',
      acceptedKeys: [FAKE_KEY, FAKE_PREVIOUS_KEY],
    });
  });

  it('warns once at start in production when no key is set', () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    settingsFrom({ NODE_ENV: 'production' }).onApplicationBootstrap();

    expect(warn).toHaveBeenCalledTimes(1);
    const warning = 'INTERNAL_API_KEY is not set: the API answers any caller';
    expect(warn).toHaveBeenCalledWith(warning);
    // The JSON logger redacts lines; this one must reach the logs readable.
    expect(redactText(warning)).toBe(warning);
  });

  it.each([
    ['in development without a key', { NODE_ENV: 'development' }],
    [
      'in production with a key',
      { NODE_ENV: 'production', INTERNAL_API_KEY: FAKE_KEY },
    ],
  ])('stays silent %s', (_, environment) => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    settingsFrom(environment).onApplicationBootstrap();

    expect(warn).not.toHaveBeenCalled();
  });
});
