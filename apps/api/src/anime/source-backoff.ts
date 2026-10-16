import { Injectable } from '@nestjs/common';
import type { AnimeDataSource } from '@otakuleague/shared-types';
import { Clock } from '../common/clock-and-random.module';
import { DAY_MS } from './cache-ttl';
import type { AnimeRef } from './sources/source.types';

/** How long an entry a source keeps answering badly is not asked about again. */
export const BACKOFF_MS = 7 * DAY_MS;
/** Entries held at most; expired ones are dropped first. */
const MAX_ENTRIES = 10_000;

/**
 * One namespace per kind of answer, so an id left out of a relations answer never blocks
 * importing that anime, and an anime answered without isAdult never blocks its relations.
 */
export function backoffKey(
  kind: 'anime' | 'relations',
  source: AnimeDataSource,
  ref: AnimeRef,
): string {
  return `${kind}:${source}:${ref.source}:${ref.externalId}`;
}

/**
 * Per-entry "do not ask before" times (ADR 0008), one mechanism for every answer that is
 * neither found nor a clean "not found": AniList answering an anime without a usable isAdult,
 * or leaving an id out of a relations answer. Without it each page view would cost a request
 * for that entry. In memory: a restart forgets it (one extra request per entry).
 * ponytail: per process; a shared table if several API instances ever run.
 */
@Injectable()
export class SourceBackoff {
  private readonly until = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  isBackedOff(key: string): boolean {
    const until = this.until.get(key);
    return until !== undefined && until > this.clock.now().getTime();
  }

  backOff(key: string): void {
    const now = this.clock.now().getTime();
    // Backed off again: moves to the end, the newest.
    this.until.delete(key);
    if (this.until.size >= MAX_ENTRIES) {
      for (const [entry, until] of this.until) {
        if (until <= now) this.until.delete(entry);
      }
    }
    // Still full of live entries: forget the oldest (Map keeps insertion order).
    if (this.until.size >= MAX_ENTRIES) {
      const oldest = this.until.keys().next();
      if (oldest.done !== true) this.until.delete(oldest.value);
    }
    this.until.set(key, now + BACKOFF_MS);
  }
}
