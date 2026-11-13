import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app';
import {
  type InternalKeyCheck,
  InternalKeySettings,
  PUBLIC_ROUTE_METADATA,
} from './internal-key.guard';

// Obvious fakes of a valid shape (64 characters, like `openssl rand -hex 32`).
const FAKE_KEY = 'fake-internal-api-key-'.padEnd(64, '0');
const FAKE_PREVIOUS_KEY = 'fake-previous-api-key-'.padEnd(64, '0');
const REFUSED = {
  error: {
    code: 'INTERNAL_KEY_REQUIRED',
    message: 'This API answers only the OtakuLeague web server.',
  },
};

function appWith(check: InternalKeyCheck): Promise<INestApplication<App>> {
  return createTestApp({
    overrides: [
      { provide: InternalKeySettings, useValue: { get: () => check } },
    ],
  });
}

/** Own and inherited methods of a controller, closest class first. */
function methodsOf(prototype: object): Map<string, unknown> {
  const methods = new Map<string, unknown>();
  for (
    let current: object | null = prototype;
    current !== null && current !== Object.prototype;
    current = Reflect.getPrototypeOf(current)
  ) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor' || methods.has(name)) continue;
      methods.set(name, Object.getOwnPropertyDescriptor(current, name)?.value);
    }
  }
  return methods;
}

/** `Controller.method` for every handler that carries @PublicRoute(), inherited ones included. */
function publicHandlers(app: INestApplication<App>): string[] {
  const names: string[] = [];
  for (const moduleRef of app.get(ModulesContainer).values()) {
    for (const { metatype } of moduleRef.controllers.values()) {
      if (metatype === null) continue;
      const prototype: unknown = Reflect.get(metatype, 'prototype');
      if (typeof prototype !== 'object' || prototype === null) continue;
      for (const [method, handler] of methodsOf(prototype)) {
        if (
          typeof handler === 'function' &&
          Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler) === true
        ) {
          names.push(`${String(Reflect.get(metatype, 'name'))}.${method}`);
        }
      }
    }
  }
  return names;
}

describe('internal API key, with a key configured', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await appWith({
      kind: 'enforced',
      acceptedKeys: [FAKE_KEY, FAKE_PREVIOUS_KEY],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['the key', FAKE_KEY],
    ['the previous key', FAKE_PREVIOUS_KEY],
  ])('answers a caller with %s', async (_, key) => {
    await request(app.getHttpServer())
      .get('/anime/search?q=a')
      .set('X-Internal-Api-Key', key)
      .expect(200);
  });

  it.each<[string, Record<string, string | string[]>]>([
    ['no header', {}],
    ['a wrong key', { 'X-Internal-Api-Key': 'f'.repeat(64) }],
    ['the header twice', { 'X-Internal-Api-Key': [FAKE_KEY, FAKE_KEY] }],
    ['513 characters', { 'X-Internal-Api-Key': 'k'.repeat(513) }],
  ])('refuses %s with 403 INTERNAL_KEY_REQUIRED', async (_, headers) => {
    const response = await request(app.getHttpServer())
      .get('/anime/search?q=a')
      .set(headers)
      .expect(403);

    expect(response.body).toEqual(REFUSED);
  });

  it('refuses before validation: a bad query still answers 403, not 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/anime/search')
      .expect(403);

    expect(response.body).toEqual(REFUSED);
  });

  it.each<[string, Record<string, string>]>([
    ['no key', {}],
    ['a wrong key', { 'X-Internal-Api-Key': 'f'.repeat(64) }],
  ])('answers GET /health with %s', async (_, headers) => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set(headers)
      .expect(200);

    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('marks no handler public except GET /health', () => {
    expect(publicHandlers(app)).toEqual(['HealthController.getHealth']);
  });
});

describe('internal API key, with none configured', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await appWith({ kind: 'open' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers a caller without the header, as before ADR 0019', async () => {
    await request(app.getHttpServer()).get('/anime/search?q=a').expect(200);
  });
});
