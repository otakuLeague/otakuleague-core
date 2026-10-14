import type { INestApplication, LoggerService, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { ApiExpressAdapter } from '../common/api-express.adapter';
import { requestContext } from '../observability/request-context';
import { PrismaService } from '../prisma/prisma.service';

interface TestAppOptions {
  readonly controllers?: readonly Type[];
  readonly prisma?: PrismaService;
  readonly logger?: LoggerService;
}

/** The real AppModule over HTTP, wired like main.ts. */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: [...(options.controllers ?? [])],
  });
  if (options.prisma) {
    builder = builder.overrideProvider(PrismaService).useValue(options.prisma);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>(
    new ApiExpressAdapter(),
    { logger: options.logger ?? false },
  );
  app.use(requestContext);
  await app.init();
  return app;
}

/** Fails fast with an actionable message instead of a wall of 503 assertions. */
export async function requireTestDatabase(
  app: INestApplication<App>,
): Promise<void> {
  try {
    await app.get(PrismaService).$queryRaw`SELECT 1`;
  } catch {
    const { host } = new URL(process.env.DATABASE_URL ?? '');
    throw new Error(
      `PostgreSQL test database is not reachable at ${host}. Run \`pnpm db:up\` at the repo root.`,
    );
  }
}
