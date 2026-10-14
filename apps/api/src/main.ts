import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExpressAdapter } from './common/api-express.adapter';
import type { EnvironmentVariables } from './config/environment';
import { JsonLogger } from './observability/json-logger';
import { requestContext } from './observability/request-context';
import { initSentry } from './observability/sentry';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ApiExpressAdapter(), {
    logger: new JsonLogger(),
  });
  // Before listen, so it runs ahead of the body parser that init() registers.
  app.use(requestContext);
  // Runs onModuleDestroy (Prisma $disconnect) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  initSentry({
    dsn: config.get('SENTRY_DSN', { infer: true }),
    environment:
      config.get('SENTRY_ENVIRONMENT', { infer: true }) ??
      config.get('NODE_ENV', { infer: true }),
    release: config.get('SENTRY_RELEASE', { infer: true }),
  });
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupOpenApi(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
