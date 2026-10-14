import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Post,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Clock, Random } from '../common/clock-and-random.module';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, FixedClock, SequentialRandom } from './test-app';
import { truncateAllTables } from './test-database';

// The pattern to copy for an integration test: the real app over HTTP, this file's own
// database, a pinned clock and pinned randomness, and a clean table before each test.
// Real features get their tables from migrations; this one exists only in this file's database.

class CreateExampleNoteDto {
  @IsString()
  @IsNotEmpty()
  readonly body!: string;
}

interface ExampleNote {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
}

// Registered only in this test module. Real code would put the queries in a service.
@Controller('test-only/notes')
class ExampleNoteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  @Post()
  async create(@Body() note: CreateExampleNoteDto): Promise<ExampleNote> {
    const [created] = await this.prisma.$queryRaw<[ExampleNote]>`
      INSERT INTO example_note (id, body, created_at)
      VALUES (${this.random.uuid()}::uuid, ${note.body}, ${this.clock.now()})
      RETURNING id, body, created_at AS "createdAt"`;
    return created;
  }

  @Get()
  list(): Promise<ExampleNote[]> {
    return this.prisma.$queryRaw<ExampleNote[]>`
      SELECT id, body, created_at AS "createdAt" FROM example_note ORDER BY created_at, id`;
  }
}

const NOW = new Date('2026-10-14T09:30:00.000Z');

describe('integration test pattern', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [ExampleNoteController],
      clock: new FixedClock(NOW),
      random: new SequentialRandom(),
    });
    prisma = app.get(PrismaService);
    await prisma.$executeRaw`
      CREATE TABLE example_note (id uuid PRIMARY KEY, body text NOT NULL, created_at timestamptz NOT NULL)`;
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores a note with the pinned id and time', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-only/notes')
      .send({ body: 'Frieren episode 1' })
      .expect(201);

    expect(response.body).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      body: 'Frieren episode 1',
      createdAt: '2026-10-14T09:30:00.000Z',
    });
    const rows = await prisma.$queryRaw<{ created_at: Date }[]>`
      SELECT created_at FROM example_note`;
    expect(rows).toEqual([{ created_at: NOW }]);
  });

  it('starts from an empty table whatever ran before', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/notes')
      .expect(200);

    expect(response.body).toEqual([]);
  });
});
