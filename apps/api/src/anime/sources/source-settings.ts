import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnimeDataSource } from '@otakuleague/shared-types';
import type { EnvironmentVariables } from '../../config/environment';

export interface SourceSettings {
  readonly enabled: boolean;
  readonly baseUrl: string;
  /** Minimum gap between two request starts. */
  readonly minIntervalMs: number;
  readonly timeoutMs: number;
  readonly maxRetryAfterMs: number;
  readonly coolDownMs: number;
  /** Longest wait for a free request slot; beyond it the call is refused. */
  readonly maxQueueMs: number;
}

/** Per-source configuration; tests replace this provider with their own values. */
export abstract class AnimeSourceSettings {
  abstract get(source: AnimeDataSource): SourceSettings;
}

@Injectable()
export class EnvironmentAnimeSourceSettings extends AnimeSourceSettings {
  private readonly settings: Readonly<Record<AnimeDataSource, SourceSettings>>;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    this.settings = {
      anilist: {
        enabled:
          config.get('ANIME_SOURCE_ANILIST_ENABLED', { infer: true }) !==
          'false',
        baseUrl:
          config.get('ANILIST_API_URL', { infer: true }) ??
          'https://graphql.anilist.co',
        // Degraded mode today: 30 requests per minute (docs.anilist.co/guide/rate-limiting).
        minIntervalMs: 2_000,
        // A visitor waits on this one when the anime is new to us.
        timeoutMs: 8_000,
        maxRetryAfterMs: 10_000,
        // Short: one failure should not turn new anime into 503s for long.
        coolDownMs: 5_000,
        // About two slots: a visitor never waits behind a long queue of refreshes.
        maxQueueMs: 4_000,
      },
      jikan: {
        enabled:
          config.get('ANIME_SOURCE_JIKAN_ENABLED', { infer: true }) !== 'false',
        baseUrl:
          config.get('JIKAN_API_URL', { infer: true }) ??
          'https://api.jikan.moe/v4',
        // 3 per second and 60 per minute: one per second keeps under both.
        minIntervalMs: 1_000,
        // Background only, so it may wait longer.
        timeoutMs: 10_000,
        maxRetryAfterMs: 60_000,
        // Jikan was down for hours during OTA-90: retry at most every 5 minutes.
        coolDownMs: 300_000,
        // Background only: a minute of queue is fine; beyond, skip and retry on a later view.
        maxQueueMs: 60_000,
      },
    };
  }

  get(source: AnimeDataSource): SourceSettings {
    return this.settings[source];
  }
}
