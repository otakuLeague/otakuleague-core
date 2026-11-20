import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { normaliseIdentifier } from './credential-rules';
import { isReservedUsername, RESERVED_USERNAMES } from './reserved-usernames';
import { USERNAME_PATTERN } from './sign-up-rules';
import { UsernameAvailabilityController } from './username-availability.controller';

const SRC = join(__dirname, '..');

/** Nest's path metadata on a controller or a handler: a string or a list; none for a plain method. */
function pathsOf(target: object): string[] {
  const path: unknown = Reflect.getMetadata(PATH_METADATA, target);
  if (typeof path === 'string') return [path];
  if (Array.isArray(path)) {
    return path.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

/** Own and inherited methods of a class, closest first. */
function handlersOf(controller: object): object[] {
  const handlers: object[] = [];
  for (
    let current: unknown = Reflect.get(controller, 'prototype');
    typeof current === 'object' &&
    current !== null &&
    current !== Object.prototype;
    current = Reflect.getPrototypeOf(current)
  ) {
    for (const name of Object.getOwnPropertyNames(current)) {
      const value: unknown = Object.getOwnPropertyDescriptor(
        current,
        name,
      )?.value;
      if (name !== 'constructor' && typeof value === 'function') {
        handlers.push(value);
      }
    }
  }
  return handlers;
}

/**
 * Route segments right after `/users/` that a username could spell (USERNAME_PATTERN) but the
 * list does not reserve: a future `/users/:username` would collide with them. A parameter
 * (`:username`) or a segment with `-` cannot be a username, so it needs no entry.
 */
function unreservedUserSegments(controller: object): string[] {
  const found: string[] = [];
  for (const base of pathsOf(controller)) {
    for (const handler of handlersOf(controller)) {
      for (const route of pathsOf(handler)) {
        const [first, second] = `${base}/${route}`
          .split('/')
          .filter((segment) => segment !== '');
        if (
          first === 'users' &&
          second !== undefined &&
          USERNAME_PATTERN.test(second) &&
          !isReservedUsername(normaliseIdentifier(second))
        ) {
          found.push(second);
        }
      }
    }
  }
  return found;
}

/** Every class with Nest path metadata exported by a source file (specs apart) that declares one. */
async function controllersInSource(): Promise<object[]> {
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    (file) =>
      file.endsWith('.ts') &&
      !file.endsWith('.spec.ts') &&
      !file.startsWith('generated') &&
      readFileSync(join(SRC, file), 'utf8').includes('@Controller('),
  );
  const controllers: object[] = [];
  for (const file of files) {
    const exported: unknown = await import(join(SRC, file));
    if (typeof exported !== 'object' || exported === null) continue;
    for (const value of Object.values(exported as Record<string, unknown>)) {
      if (typeof value === 'function' && pathsOf(value).length > 0) {
        controllers.push(value);
      }
    }
  }
  return controllers;
}

describe('RESERVED_USERNAMES', () => {
  it('holds only names sign-up could otherwise accept, in their normalised (lower-case) form', () => {
    for (const name of RESERVED_USERNAMES) {
      expect(name).toMatch(USERNAME_PATTERN);
      expect(name).toBe(normaliseIdentifier(name));
    }
  });

  it('reserves `availability`, the route a /users/:username would collide with', () => {
    expect(RESERVED_USERNAMES.has('availability')).toBe(true);
  });
});

describe('isReservedUsername', () => {
  it.each(['admin', 'Admin', 'ADMIN', 'Availability', 'otaku_league'])(
    'reserves %s, whatever its letter case',
    (name) => {
      expect(isReservedUsername(normaliseIdentifier(name))).toBe(true);
    },
  );

  it.each(['admin_1', 'adm1n', 'administrators', 'frieren', 'otakuleague1'])(
    'leaves %s free: a whole-key match, never a prefix or a lookalike',
    (name) => {
      expect(isReservedUsername(normaliseIdentifier(name))).toBe(false);
    },
  );
});

describe('routes under /users/', () => {
  it('reserves every static segment of every controller route under /users/', async () => {
    const controllers = await controllersInSource();

    // The scan must see the one /users/ controller that exists, or it proves nothing.
    expect(controllers).toContain(UsernameAvailabilityController);
    expect(controllers.flatMap(unreservedUserSegments)).toEqual([]);
  });

  it('catches an unreserved segment, from the controller path or the handler path', () => {
    // Registered nowhere: only its metadata is read.
    @Controller('users')
    class FakeUsersController {
      @Get('frieren')
      byName(): void {}

      @Get(':username')
      profile(): void {}

      @Get('sign-up')
      dashed(): void {}

      @Get('availability')
      availability(): void {}
    }
    @Controller()
    class FakeRootController {
      @Get('users/himmel/watchlist')
      nested(): void {}
    }

    expect(unreservedUserSegments(FakeUsersController)).toEqual(['frieren']);
    expect(unreservedUserSegments(FakeRootController)).toEqual(['himmel']);
  });
});
