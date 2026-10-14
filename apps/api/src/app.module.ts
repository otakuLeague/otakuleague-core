import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { createValidationPipe } from './common/validation';
import { AppConfigModule } from './config/app-config.module';
import { DebugModule } from './debug/debug.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    AppConfigModule,
    HealthModule,
    ConditionalModule.registerWhen(
      DebugModule,
      (env) => env.NODE_ENV !== 'production',
    ),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
