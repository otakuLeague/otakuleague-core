import { Injectable } from '@nestjs/common';
import { mapJikanAnime } from './jikan.mapper';
import { record } from './parse';
import { RateLimiter } from './rate-limiter';
import { requestJson, type SourceHttpOptions } from './source-http';
import { AnimeSourceSettings } from './source-settings';
import {
  AnimeSourceAdapter,
  type AnimeRef,
  type SourceResult,
  SourceUnavailableError,
} from './source.types';

/** Jikan (MyAnimeList data), the gap-filler: MAL score, rank, members, missing core fields. */
@Injectable()
export class JikanAdapter extends AnimeSourceAdapter {
  readonly source = 'jikan';
  readonly idSource = 'myanimelist';
  readonly lookups = ['myanimelist'] as const;
  private readonly baseUrl: string;
  private readonly http: SourceHttpOptions;

  constructor(settings: AnimeSourceSettings) {
    super();
    const config = settings.get('jikan');
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.http = {
      source: 'jikan',
      limiter: new RateLimiter(config.minIntervalMs),
      ...config,
    };
  }

  isDown(): boolean {
    return this.http.limiter.isDown();
  }

  async fetchAnime(ref: AnimeRef): Promise<SourceResult> {
    if (ref.source !== 'myanimelist') return { kind: 'not_found' };
    const { status, body } = await requestJson(
      `${this.baseUrl}/anime/${ref.externalId}`,
      { method: 'GET' },
      this.http,
    );
    if (status === 404) return { kind: 'not_found' };
    const snapshot = mapJikanAnime(record(body).data);
    if (snapshot === null) {
      throw new SourceUnavailableError('jikan', 'response has no usable data');
    }
    return { kind: 'found', snapshot };
  }
}
