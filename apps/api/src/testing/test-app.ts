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

/** Returns 00000000-0000-4000-8000-000000000001, then ...0002, and so on. */
export class SequentialRandom extends Random {
  private calls = 0;

  uuid(): string {
    this.calls += 1;
    return `00000000-0000-4000-8000-${String(this.calls).padStart(12, '0')}`;
  }
}

interface TestAppOptions {
  readonly controllers?: readonly Type[];
  readonly prisma?: PrismaService;
  readonly logger?: LoggerService;
  readonly clock?: Clock;
  readonly random?: Random;
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
