import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock-and-random.module';
import type { AnimeRef } from './sources/source.types';

/** How long an id every source answered "not found" (or adult) is not asked about again. */
export const NOT_FOUND_TTL_MS = 3_600_000;
/** Cold imports allowed at once, and the most the bucket ever holds. */
export const IMPORT_BURST = 10;
/** One import token comes back every this many milliseconds. */
export const IMPORT_REFILL_MS = 20_000;

function missingKey(ref: AnimeRef): string {
  return `${ref.source}:${ref.externalId}`;
}

/**
 * Guards first-visit imports against id enumeration (ADR 0006 update, OTA-173): a global
 * token bucket for imports of anime we do not have, and a one-hour memory of ids no source
 * knows. In memory, per process: a restart refills the bucket and forgets the ids.
 */
@Injectable()
export class ImportLimits {
  /** Expiry time per key; Map order is insertion order, so the oldest expire first. */
  private readonly missing = new Map<string, number>();
  private tokens = IMPORT_BURST;
  private refilledAt: number;

  constructor(private readonly clock: Clock) {
    this.refilledAt = clock.now().getTime();
  }

  isKnownMissing(ref: AnimeRef): boolean {
    const until = this.missing.get(missingKey(ref));
    return until !== undefined && until > this.clock.now().getTime();
  }

  rememberMissing(ref: AnimeRef): void {
    const now = this.clock.now().getTime();
    for (const [key, until] of this.missing) {
      if (until > now) break;
      this.missing.delete(key);
    }
    const key = missingKey(ref);
    this.missing.delete(key);
    this.missing.set(key, now + NOT_FOUND_TTL_MS);
  }

  /** Takes one import token; false when the bucket is empty. */
  takeImportToken(): boolean {
    const now = this.clock.now().getTime();
    const steps = Math.floor(
      Math.max(0, now - this.refilledAt) / IMPORT_REFILL_MS,
    );
    if (this.tokens === IMPORT_BURST) {
      // Idle time on a full bucket must not bank a partial step towards the next token.
      this.refilledAt = Math.max(this.refilledAt, now);
    } else if (steps > 0) {
      this.tokens = Math.min(IMPORT_BURST, this.tokens + steps);
      this.refilledAt =
        this.tokens === IMPORT_BURST
          ? now
          : this.refilledAt + steps * IMPORT_REFILL_MS;
    }
    if (this.tokens === 0) return false;
    this.tokens -= 1;
    return true;
  }
}
