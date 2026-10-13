import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExpressAdapter } from './common/api-express.adapter';
import type { EnvironmentVariables } from './config/environment';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ApiExpressAdapter());
  // Runs onModuleDestroy (Prisma $disconnect) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupOpenApi(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
