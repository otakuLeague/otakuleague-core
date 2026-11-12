import { Injectable } from '@nestjs/common';
import {
  mapAniListListBlock,
  mapAniListMedia,
  mapAniListRelationNodes,
} from './anilist.mapper';
import {
  ANILIST_ANIME_QUERY,
  ANILIST_LIST_QUERY,
  LIST_PAGE_SIZE,
  ANILIST_RELATIONS_QUERY,
} from './anilist.query';
import { isRecord, record } from './parse';
import { RateLimiter } from './rate-limiter';
import { requestJson, type SourceHttpOptions } from './source-http';
import { AnimeSourceSettings } from './source-settings';
import {
  AnimeSourceAdapter,
  type AnimeRef,
  type ListBlock,
  type RelationNode,
  type SourceResult,
  SourceUnavailableError,
  UnusableAnswerError,
} from './source.types';

/** AniList's `perPage` maximum (larger values are silently capped): ids per walk request. */
export const RELATIONS_PAGE_SIZE = 50;

/** What a catalog list asks AniList for (ADR 0016). */
export interface ListQuery {
  readonly sort: readonly (
    'TRENDING_DESC' | 'POPULARITY_DESC' | 'SCORE_DESC'
  )[];
  readonly status?: 'RELEASING' | 'NOT_YET_RELEASED';
}

/**
 * 'visitor': a request is waiting, so the normal queue budget applies. 'background': only a
 * slot that is free right now, so a refresh never delays a visitor or an import.
 */
export type ListFetchWait = 'visitor' | 'background';

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
      throw new UnusableAnswerError('anilist', 'response has no usable Media');
    }
    return { kind: 'found', snapshot };
  }

  /**
   * ADR 0008: summaries and relations of 1 to 50 AniList anime in one request; the walker
   * splits a larger level. Unknown or adult ids are simply absent. Background work: it takes
   * a slot only when one is free right now, so a page request never waits behind it, and
   * throws "queue full" instead (also right after a 429: the pause holds the next slot); the
   * caller tries later. Like fetchAnime it does not check the kill switch: the caller does.
   * A GraphQL error next to a usable Page is accepted; no Page, or a page AniList truncated,
   * fails like an HTTP error and starts the cool-down.
   */
  async fetchRelations(ids: readonly number[]): Promise<RelationNode[]> {
    if (ids.length === 0 || ids.length > RELATIONS_PAGE_SIZE) {
      throw new RangeError(
        `fetchRelations takes 1 to ${RELATIONS_PAGE_SIZE} ids, got ${ids.length}`,
      );
    }
    const variables = { ids, perPage: RELATIONS_PAGE_SIZE };
    const { status, body } = await requestJson(
      this.baseUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ANILIST_RELATIONS_QUERY, variables }),
      },
      { ...this.http, maxQueueMs: 0 },
    );
    const data = record(body).data;
    const page = record(data).Page;
    // 1 to 50 ids with perPage 50 cannot paginate: hasNextPage only reveals a lowered cap.
    if (
      status !== 200 ||
      !isRecord(page) ||
      record(page.pageInfo).hasNextPage === true
    ) {
      this.http.limiter.markDown(this.http.coolDownMs);
      throw new SourceUnavailableError(
        'anilist',
        `relations answered HTTP ${status} without a complete Page`,
      );
    }
    return mapAniListRelationNodes(data);
  }

  /**
   * ADR 0016: block `page` (1-based, 50 entries) of a catalog list. Like the other fetches it
   * does not check the kill switch: the caller does. An answer that is not a trustworthy page
   * (GraphQL errors next to it, no Page, or nothing usable in it) is an UnusableAnswerError
   * and does not start the shared cool-down: one bad list query must not keep imports at 503.
   */
  async fetchList(
    query: ListQuery,
    page: number,
    wait: ListFetchWait,
  ): Promise<ListBlock> {
    const variables = { page, perPage: LIST_PAGE_SIZE, ...query };
    const { status, body } = await requestJson(
      this.baseUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ANILIST_LIST_QUERY, variables }),
      },
      wait === 'background' ? { ...this.http, maxQueueMs: 0 } : this.http,
    );
    const errors = record(body).errors;
    const block =
      status === 200 && !(Array.isArray(errors) && errors.length > 0)
        ? mapAniListListBlock(record(body).data)
        : null;
    if (block === null) {
      throw new UnusableAnswerError(
        'anilist',
        `list answered HTTP ${status} without a trustworthy Page`,
      );
    }
    return block;
  }
}
