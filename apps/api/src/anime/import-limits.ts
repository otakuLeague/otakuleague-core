import { Injectable } from '@nestjs/common';
import type { VisitorKey } from '../common/api-caller';
import { Clock } from '../common/clock-and-random.module';
import {
  refillBucket,
  type TokenBucket,
  VisitorBuckets,
  type VisitorTake,
} from '../common/visitor-buckets';
import type { AnimeRef } from './sources/source.types';

/** How long an id every source answered "not found" (or adult) is not asked about again. */
export const NOT_FOUND_TTL_MS = 3_600_000;
/** Cold imports allowed at once, and the most the bucket ever holds. */
export const IMPORT_BURST = 10;
/** One import token comes back every this many milliseconds. */
export const IMPORT_REFILL_MS = 20_000;
/** Cold imports one visitor may start at once: half the global burst (ADR 0019 item 8). */
export const VISITOR_IMPORT_BURST = 5;
/** One visitor token comes back every this many milliseconds: half the global refill. */
export const VISITOR_IMPORT_REFILL_MS = 40_000;
/** The most visitors remembered at once (about 1.5 MB); the least recently used goes first. */
export const MAX_VISITOR_ENTRIES = 10_000;

function missingKey(ref: AnimeRef): string {
  return `${ref.source}:${ref.externalId}`;
}

/**
 * Guards first-visit imports against id enumeration (ADR 0006 update, OTA-173; ADR 0019): a
 * global token bucket for imports of anime we do not have, one smaller bucket per visitor in
 * front of it, and a one-hour memory of ids no source knows. In memory, per process: a restart
 * refills every bucket and forgets the ids. Visitor keys are never logged.
 */
@Injectable()
export class ImportLimits {
  /** Expiry time per key; Map order is insertion order, so the oldest expire first. */
  private readonly missing = new Map<string, number>();
  private global: TokenBucket;
  private readonly visitors: VisitorBuckets;

  constructor(private readonly clock: Clock) {
    this.visitors = new VisitorBuckets(
      {
        burst: VISITOR_IMPORT_BURST,
        refillMs: VISITOR_IMPORT_REFILL_MS,
        maxEntries: MAX_VISITOR_ENTRIES,
      },
      clock,
    );
    this.global = { tokens: IMPORT_BURST, refilledAt: this.now() };
  }

  isKnownMissing(ref: AnimeRef): boolean {
    const until = this.missing.get(missingKey(ref));
    return until !== undefined && until > this.now();
  }

  rememberMissing(ref: AnimeRef): void {
    const now = this.now();
    for (const [key, until] of this.missing) {
      if (until > now) break;
      this.missing.delete(key);
    }
    const key = missingKey(ref);
    this.missing.delete(key);
    this.missing.set(key, now + NOT_FOUND_TTL_MS);
  }

  /** Takes one global import token; false when the bucket is empty. */
  takeImportToken(): boolean {
    const bucket = this.refilledGlobal();
    if (bucket.tokens === 0) {
      this.global = bucket;
      return false;
    }
    this.global = { ...bucket, tokens: bucket.tokens - 1 };
    return true;
  }

  /** Returns a global token no source request was spent on; never above the burst. */
  giveBackImportToken(): void {
    const bucket = this.refilledGlobal();
    this.global = {
      ...bucket,
      tokens: Math.min(IMPORT_BURST, bucket.tokens + 1),
    };
  }

  /** Takes one of this visitor's tokens (see VisitorBuckets for eviction and ordering). */
  takeVisitorToken(key: VisitorKey): VisitorTake {
    return this.visitors.take(key);
  }

  /** Returns a visitor token no request was spent on: never above 5, nothing for a dropped entry. */
  giveBackVisitorToken(key: VisitorKey): void {
    this.visitors.giveBack(key);
  }

  /** Visitors remembered right now (tests and the memory bound of ADR 0019). */
  visitorCount(): number {
    return this.visitors.size();
  }

  /** Forgets visitors idle long enough to hold a full bucket again (OTA-197). */
  forgetIdleVisitors(): void {
    this.visitors.forgetIdle();
  }

  private refilledGlobal(): TokenBucket {
    return refillBucket(
      this.global,
      this.now(),
      IMPORT_BURST,
      IMPORT_REFILL_MS,
    );
  }

  private now(): number {
    return this.clock.now().getTime();
  }
}
