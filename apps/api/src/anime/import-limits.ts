import { Injectable } from '@nestjs/common';
import type { VisitorKey } from '../common/api-caller';
import { Clock } from '../common/clock-and-random.module';
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
/** A visitor's bucket is full again this long after its last take, so its entry goes (200 s). */
export const VISITOR_IDLE_MS = VISITOR_IMPORT_BURST * VISITOR_IMPORT_REFILL_MS;
/** The most visitors remembered at once (about 1.5 MB); the least recently used goes first. */
export const MAX_VISITOR_ENTRIES = 10_000;

/** Tokens left, and the instant the last whole refill step was counted from. */
export interface TokenBucket {
  readonly tokens: number;
  readonly refilledAt: number;
}

interface VisitorEntry extends TokenBucket {
  /** The last granted take: entries are kept in this order and dropped VISITOR_IDLE_MS after it. */
  readonly takenAt: number;
}

/** Whether a visitor may start an import, and if not, when to try again (ADR 0019 item 12). */
export type VisitorTake =
  | { readonly taken: true }
  | { readonly taken: false; readonly retryAfterSeconds: number };

/**
 * The bucket as it stands at `now`: one token per whole `refillMs` since `refilledAt`, never more
 * than `burst`. A full bucket banks no idle time, so the next token after a drain always takes a
 * whole step; a clock that moves backwards adds nothing. Pure, shared by both kinds of bucket.
 */
export function refillBucket(
  bucket: TokenBucket,
  now: number,
  burst: number,
  refillMs: number,
): TokenBucket {
  if (bucket.tokens >= burst) {
    return { tokens: burst, refilledAt: Math.max(bucket.refilledAt, now) };
  }
  const steps = Math.floor(Math.max(0, now - bucket.refilledAt) / refillMs);
  if (steps === 0) return bucket;
  const tokens = Math.min(burst, bucket.tokens + steps);
  return {
    tokens,
    refilledAt: tokens === burst ? now : bucket.refilledAt + steps * refillMs,
  };
}

/** Whole seconds until an empty bucket's next token: 1 to refillMs / 1000, also if the clock jumped. */
export function secondsUntilNextToken(
  bucket: TokenBucket,
  now: number,
  refillMs: number,
): number {
  const waitMs = bucket.refilledAt + refillMs - now;
  return Math.min(refillMs / 1000, Math.max(1, Math.ceil(waitMs / 1000)));
}

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
  /** Map order is last-granted-take order: the front is the least recently used. */
  private readonly visitors = new Map<VisitorKey, VisitorEntry>();

  constructor(private readonly clock: Clock) {
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

  /**
   * Takes one of this visitor's tokens. Only a granted take stamps the entry and moves it to the
   * end; each one first drops the idle entries at the front, then the oldest over the cap.
   */
  takeVisitorToken(key: VisitorKey): VisitorTake {
    const now = this.now();
    const stored = this.visitors.get(key);
    const bucket = refillBucket(
      stored ?? { tokens: VISITOR_IMPORT_BURST, refilledAt: now },
      now,
      VISITOR_IMPORT_BURST,
      VISITOR_IMPORT_REFILL_MS,
    );
    if (bucket.tokens === 0) {
      return {
        taken: false,
        retryAfterSeconds: secondsUntilNextToken(
          bucket,
          now,
          VISITOR_IMPORT_REFILL_MS,
        ),
      };
    }
    this.dropIdleVisitors(now);
    this.visitors.delete(key);
    this.visitors.set(key, {
      tokens: bucket.tokens - 1,
      refilledAt: bucket.refilledAt,
      takenAt: now,
    });
    for (const oldest of this.visitors.keys()) {
      if (this.visitors.size <= MAX_VISITOR_ENTRIES) break;
      this.visitors.delete(oldest);
    }
    return { taken: true };
  }

  /** Returns a visitor token no request was spent on: never above 5, nothing for a dropped entry. */
  giveBackVisitorToken(key: VisitorKey): void {
    const stored = this.visitors.get(key);
    if (stored === undefined) return;
    const bucket = refillBucket(
      stored,
      this.now(),
      VISITOR_IMPORT_BURST,
      VISITOR_IMPORT_REFILL_MS,
    );
    // Same place in the order and same takenAt: a give-back is not a use.
    this.visitors.set(key, {
      tokens: Math.min(VISITOR_IMPORT_BURST, bucket.tokens + 1),
      refilledAt: bucket.refilledAt,
      takenAt: stored.takenAt,
    });
  }

  /** Visitors remembered right now (tests and the memory bound of ADR 0019). */
  visitorCount(): number {
    return this.visitors.size;
  }

  private refilledGlobal(): TokenBucket {
    return refillBucket(
      this.global,
      this.now(),
      IMPORT_BURST,
      IMPORT_REFILL_MS,
    );
  }

  /** Idle entries are full buckets: dropping them changes no answer. */
  private dropIdleVisitors(now: number): void {
    for (const [key, entry] of this.visitors) {
      if (now - entry.takenAt < VISITOR_IDLE_MS) break;
      this.visitors.delete(key);
    }
  }

  private now(): number {
    return this.clock.now().getTime();
  }
}
