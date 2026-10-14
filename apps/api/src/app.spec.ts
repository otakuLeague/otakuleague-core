import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ApiError, ValidationIssue } from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma/prisma.service';
import { createTestApp } from './testing/test-app';

class TestStudioDto {
  @IsString()
  readonly name!: string;
}

class CreateTestEntryDto {
  @IsString()
  @IsNotEmpty()
  readonly title!: string;

  @IsInt()
  @Min(1)
  readonly episodes!: number;

  // ValidateNested alone accepts a missing object.
  @IsDefined()
  @ValidateNested()
  @Type(() => TestStudioDto)
  readonly studio!: TestStudioDto;
}

// Registered only in this test module, never in production code.
@Controller('test-only')
class TestOnlyController {
  @Post('entries')
  createEntry(@Body() entry: CreateTestEntryDto): CreateTestEntryDto {
    return entry;
  }

  @Get('entries/:title')
  findEntry(@Param('title') title: string): { readonly title: string } {
    return { title };
  }

  @Get('unexpected-failure')
  failUnexpectedly(): never {
    throw new Error(
      'relation "users" does not exist: SELECT * FROM users WHERE password = \'hunter2\' (/srv/apps/api/src/users.ts:42)',
    );
  }
}

function validationDetails(body: unknown): readonly ValidationIssue[] {
  const { error } = body as ApiError;
  if (error.code !== 'VALIDATION_FAILED') {
    throw new Error(`expected VALIDATION_FAILED, got ${error.code}`);
  }
  return error.details;
}

const VALID_ENTRY = {
  title: 'Frieren',
  episodes: 28,
  studio: { name: 'Madhouse' },
};

// No database here (unit suite): GET /health with the database up is in health.integration.spec.ts.
describe('API over HTTP', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [TestOnlyController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('no longer serves the placeholder GET /', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(404);

    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Cannot GET /' },
    });
  });

  it('answers an unknown route with the 404 envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/no-such-route')
      .expect(404)
      .expect('Content-Type', /application\/json/);

    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Cannot GET /no-such-route' },
    });
  });

  it('answers a malformed JSON body with 400 MALFORMED_REQUEST', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .set('Content-Type', 'application/json')
      .send('{"title": "Frieren",')
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'MALFORMED_REQUEST',
        message: 'Request body must be valid JSON (an object or an array).',
      },
    });
  });

  it('answers a body over the parser limit with 413, not 500', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ title: 'x'.repeat(200_000) }))
      .expect(413);

    expect((response.body as ApiError).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers an unsupported body charset with 415, not 500', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .set('Content-Type', 'application/json; charset=klingon')
      .send(JSON.stringify(VALID_ENTRY))
      .expect(415);

    expect((response.body as ApiError).error.code).toBe('CLIENT_ERROR');
  });

  it('treats an empty JSON body as missing fields, not as malformed', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .set('Content-Type', 'application/json')
      .send('')
      .expect(400);

    expect((response.body as ApiError).error.code).toBe('VALIDATION_FAILED');
  });

  it('answers a route param with an invalid percent-encoding with 400, not 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/entries/%FF')
      .expect(400);

    expect((response.body as ApiError).error.code).toBe('BAD_REQUEST');
  });

  it('decodes a valid percent-encoded route param', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/entries/Sousou%20no%20Frieren')
      .expect(200);

    expect(response.body).toEqual({ title: 'Sousou no Frieren' });
  });

  it('accepts a valid DTO and returns it transformed', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .send(VALID_ENTRY)
      .expect(201);

    expect(response.body).toEqual(VALID_ENTRY);
  });

  it('rejects an unknown field with 400 VALIDATION_FAILED and details', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .send({ ...VALID_ENTRY, isAdmin: true })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [
          { field: 'isAdmin', message: 'property isAdmin should not exist' },
        ],
      },
    });
  });

  it('reports every invalid field, including nested ones, with a dotted path', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .send({ title: '', episodes: 0, studio: { name: 7, extra: 'x' } })
      .expect(400);

    expect(validationDetails(response.body)).toEqual(
      expect.arrayContaining([
        { field: 'title', message: 'title should not be empty' },
        { field: 'episodes', message: 'episodes must not be less than 1' },
        { field: 'studio.name', message: 'name must be a string' },
        { field: 'studio.extra', message: 'property extra should not exist' },
      ]),
    );
  });

  it('rejects an empty body with one issue per required field', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/entries')
      .send({})
      .expect(400);

    const fields = validationDetails(response.body).map((issue) => issue.field);
    expect(new Set(fields)).toEqual(new Set(['title', 'episodes', 'studio']));
  });

  it('answers an unexpected error with a generic 500 that leaks nothing', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/unexpected-failure')
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.text).not.toMatch(/hunter2|SELECT|\/srv\/|users\.ts/);
  });
});

describe('API over HTTP with the database down', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Port 1 is closed: connections are refused immediately.
    const closedPort = new PrismaService(
      new ConfigService({
        DATABASE_URL:
          'postgresql://otakuleague:unused@127.0.0.1:1/otakuleague_test',
      }),
    );
    app = await createTestApp({ prisma: closedPort });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responds 503 with the database down', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect('Content-Type', /application\/json/);

    expect(response.body).toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });

  it('keeps serving after the failed check instead of crashing', async () => {
    await request(app.getHttpServer()).get('/health').expect(503);
    await request(app.getHttpServer()).get('/health').expect(503);
    await request(app.getHttpServer()).get('/no-such-route').expect(404);
  });
});
