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
import { AnimeListService } from './anime-list.service';
import { AnimeSearchService } from './anime-search.service';
import { AnimeController } from './anime.controller';
import { AnimeService } from './anime.service';
import { FranchiseWalker } from './franchise-walker.service';
import { AnimeFranchiseService } from './franchise.service';
import { ImportLimits } from './import-limits';
import { SourceBackoff } from './source-backoff';
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

  constructor(
    private readonly importer: AnimeImportService,
    private readonly walker: FranchiseWalker,
    private readonly lists: AnimeListService,
  ) {}

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
    this.walker
      .purgeUnused()
      .then((count) =>
        this.logger.log(`Purged ${count} unused franchise entries`),
      )
      .catch((error: unknown) =>
        this.logger.warn(`Franchise purge failed: ${String(error)}`),
      );
    this.lists
      .purgeStale()
      .then((count) => this.logger.log(`Purged ${count} stale list pages`))
      .catch((error: unknown) =>
        this.logger.warn(`List page purge failed: ${String(error)}`),
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
    AnimeListService,
    AnimeSearchService,
    FranchiseWalker,
    SourceBackoff,
    ImportLimits,
    AnimeFranchiseService,
    AnimePurgeScheduler,
  ],
})
export class AnimeModule {}
