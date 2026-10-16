import { Injectable } from '@nestjs/common';
import type { AnimeDataSource } from '@otakuleague/shared-types';
import { Clock } from '../common/clock-and-random.module';
import { DAY_MS } from './cache-ttl';
import type { AnimeRef } from './sources/source.types';

const HOUR_MS = 60 * 60 * 1000;
/**
 * How long an entry is not asked about again, by repeated bad answer (owner decision): one
 * bad answer during a short incident costs an hour, an entry that keeps failing ends up
 * asked once a week. A good answer resets it.
 */
export const BACKOFF_STEPS_MS: readonly number[] = [
  HOUR_MS,
  6 * HOUR_MS,
  DAY_MS,
  7 * DAY_MS,
];
/** The last step: past it, every backoff has ended. */
export const BACKOFF_MAX_MS = BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1]!;
/** Entries held at most; expired ones are dropped first. */
const MAX_ENTRIES = 10_000;

/**
 * `clear`: ask the source; `retrying`: backed off on an early step, a good answer may come
 * soon; `settled`: backed off on the last step, the source keeps answering badly.
 */
export type BackoffStage = 'clear' | 'retrying' | 'settled';

interface Backoff {
  readonly until: number;
  readonly step: number;
}

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
 * Per-entry "do not ask before" times (ADR 0008 item 11), one mechanism for every answer that
 * is neither found nor a clean "not found": AniList answering an anime without a usable
 * isAdult, or leaving an id out of a relations answer. Each repeated bad answer moves the
 * entry one step up BACKOFF_STEPS_MS; a good answer clears it. An expired entry keeps its step,
 * so the next bad answer waits longer. In memory: a restart starts every entry at the first
 * step again (up to 4 requests and about 31 h of `partial` for an id AniList never returns).
 * ponytail: per process and lost on restart; persist the step if that ever shows in practice.
 */
@Injectable()
export class SourceBackoff {
  private readonly entries = new Map<string, Backoff>();

  constructor(private readonly clock: Clock) {}

  stage(key: string): BackoffStage {
    const entry = this.entries.get(key);
    if (entry === undefined || entry.until <= this.clock.now().getTime()) {
      return 'clear';
    }
    return entry.step < BACKOFF_STEPS_MS.length - 1 ? 'retrying' : 'settled';
  }

  isBackedOff(key: string): boolean {
    return this.stage(key) !== 'clear';
  }

  backOff(key: string): void {
    const now = this.clock.now().getTime();
    const previous = this.entries.get(key);
    const step =
      previous === undefined
        ? 0
        : Math.min(previous.step + 1, BACKOFF_STEPS_MS.length - 1);
    // Backed off again: moves to the end, the newest.
    this.entries.delete(key);
    if (this.entries.size >= MAX_ENTRIES) {
      for (const [entryKey, entry] of this.entries) {
        if (entry.until <= now) this.entries.delete(entryKey);
      }
    }
    // Still full of live entries: forget the oldest (Map keeps insertion order).
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { until: now + BACKOFF_STEPS_MS[step]!, step });
  }

  /** A good answer: the next bad one starts again at the first step. */
  clear(key: string): void {
    this.entries.delete(key);
  }
}
