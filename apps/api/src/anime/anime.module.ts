import {
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  ANIME_SOURCE_ADAPTERS,
  AnimeImportService,
} from './anime-import.service';
import { AnimeController } from './anime.controller';
import { AnimeService } from './anime.service';
import { AniListAdapter } from './sources/anilist.adapter';
import { JikanAdapter } from './sources/jikan.adapter';
import {
  AnimeSourceSettings,
  EnvironmentAnimeSourceSettings,
} from './sources/source-settings';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_PURGE_DELAY_MS = 60 * 1000;

/**
 * Runs the 30-day cache purge a minute after boot, then daily (ADR 0006): a process restarted
 * more often than daily still purges. The timers never keep the process alive.
 */
@Injectable()
export class AnimePurgeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnimePurgeScheduler.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly importer: AnimeImportService) {}

  onModuleInit(): void {
    this.timers = [
      setTimeout(() => this.purge(), FIRST_PURGE_DELAY_MS).unref(),
      setInterval(() => this.purge(), PURGE_INTERVAL_MS).unref(),
    ];
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  private purge(): void {
    this.importer
      .purgeUnviewed()
      .then((count) =>
        this.logger.log(`Purged ${count} anime not opened for 30 days`),
      )
      .catch((error: unknown) =>
        this.logger.warn(`Purge failed: ${String(error)}`),
      );
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [AnimeController],
  providers: [
    { provide: AnimeSourceSettings, useClass: EnvironmentAnimeSourceSettings },
    AniListAdapter,
    JikanAdapter,
    {
      provide: ANIME_SOURCE_ADAPTERS,
      useFactory: (anilist: AniListAdapter, jikan: JikanAdapter) => [
        anilist,
        jikan,
      ],
      inject: [AniListAdapter, JikanAdapter],
    },
    AnimeImportService,
    AnimeService,
    AnimePurgeScheduler,
  ],
})
export class AnimeModule {}
