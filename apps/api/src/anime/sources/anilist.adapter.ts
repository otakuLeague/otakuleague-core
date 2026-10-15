import { Injectable } from '@nestjs/common';
import { mapAniListMedia } from './anilist.mapper';
import { ANILIST_ANIME_QUERY } from './anilist.query';
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

/** AniList GraphQL, the primary source. Looks anime up by AniList id or MAL id (idMal). */
@Injectable()
export class AniListAdapter extends AnimeSourceAdapter {
  readonly source = 'anilist';
  readonly idSource = 'anilist';
  readonly lookups = ['anilist', 'myanimelist'] as const;
  private readonly baseUrl: string;
  private readonly http: SourceHttpOptions;

  constructor(settings: AnimeSourceSettings) {
    super();
    const config = settings.get('anilist');
    this.baseUrl = config.baseUrl;
    this.http = {
      source: 'anilist',
      limiter: new RateLimiter(config.minIntervalMs),
      ...config,
    };
  }

  isDown(): boolean {
    return this.http.limiter.isDown();
  }

  async fetchAnime(ref: AnimeRef): Promise<SourceResult> {
    const variables =
      ref.source === 'anilist'
        ? { id: ref.externalId }
        : { idMal: ref.externalId };
    const { status, body } = await requestJson(
      this.baseUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ANILIST_ANIME_QUERY, variables }),
      },
      this.http,
    );
    // AniList answers an unknown id with HTTP 404 and { data: { Media: null } }.
    if (status === 404) return { kind: 'not_found' };
    const media = record(record(body).data).Media;
    if (media === null) return { kind: 'not_found' };
    const snapshot = mapAniListMedia(media);
    if (snapshot === null) {
      throw new SourceUnavailableError(
        'anilist',
        'response has no usable Media',
      );
    }
    return { kind: 'found', snapshot };
  }
}
