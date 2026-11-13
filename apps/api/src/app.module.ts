import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ClockAndRandomModule } from './common/clock-and-random.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import {
  EnvironmentInternalKeySettings,
  InternalKeyGuard,
  InternalKeySettings,
} from './common/internal-key.guard';
import { createValidationPipe } from './common/validation';
import { AnimeModule } from './anime/anime.module';
import { AppConfigModule } from './config/app-config.module';
import { DebugModule, debugRoutesEnabled } from './debug/debug.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    AppConfigModule,
    ClockAndRandomModule,
    HealthModule,
    AnimeModule,
    ConditionalModule.registerWhen(DebugModule, debugRoutesEnabled),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: InternalKeySettings, useClass: EnvironmentInternalKeySettings },
    // Every route, before pipes and handlers; @PublicRoute() opts a handler out (ADR 0019).
    { provide: APP_GUARD, useClass: InternalKeyGuard },
  ],
})
export class AppModule {}
