import type { INestApplication, LoggerService, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { ApiExpressAdapter } from '../common/api-express.adapter';
import { Clock, CryptoRandom, Random } from '../common/clock-and-random.module';
import { createRequestContext } from '../observability/request-context';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** Always returns the same instant. */
export class FixedClock extends Clock {
  private readonly instant: Date;

  constructor(instant: Date) {
    super();
    this.instant = new Date(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }
}

/**
 * uuid(): 00000000-0000-4000-8000-000000000001, then ...0002, and so on.
 * bytes(n): n zero bytes ending in its own call count, big-endian (00..01, then 00..02).
 */
export class SequentialRandom extends Random {
  private uuidCalls = 0;
  private bytesCalls = 0;

  uuid(): string {
    this.uuidCalls += 1;
    return `00000000-0000-4000-8000-${String(this.uuidCalls).padStart(12, '0')}`;
  }

  bytes(byteCount: number): Buffer {
    this.bytesCalls += 1;
    const bytes = Buffer.alloc(byteCount);
    let rest = this.bytesCalls;
    for (let index = byteCount - 1; index >= 0 && rest > 0; index -= 1) {
      bytes[index] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    return bytes;
  }
}

interface TestAppOptions {
  readonly controllers?: readonly Type[];
  readonly prisma?: PrismaService;
  readonly logger?: LoggerService;
  readonly clock?: Clock;
  readonly random?: Random;
  /** Any other provider to replace, e.g. a feature's settings. */
  readonly overrides?: readonly {
    readonly provide: unknown;
    readonly useValue: unknown;
  }[];
}

/** The real AppModule over HTTP, wired like main.ts. */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({
    // PrismaModule: test-only controllers query the database like a feature module would.
    imports: [AppModule, PrismaModule],
    controllers: [...(options.controllers ?? [])],
  });
  if (options.prisma) {
    builder = builder.overrideProvider(PrismaService).useValue(options.prisma);
  }
  if (options.clock) {
    builder = builder.overrideProvider(Clock).useValue(options.clock);
  }
  if (options.random) {
    builder = builder.overrideProvider(Random).useValue(options.random);
  }
  for (const override of options.overrides ?? []) {
    builder = builder
      .overrideProvider(override.provide)
      .useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>(
    new ApiExpressAdapter(),
    { logger: options.logger ?? false },
  );
  // Its own Random: request ids must not shift the ids a test pinned with SequentialRandom.
  app.use(createRequestContext(new CryptoRandom()));
  await app.init();
  return app;
}
