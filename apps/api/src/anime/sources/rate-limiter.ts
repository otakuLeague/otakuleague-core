import { setTimeout as sleep } from 'node:timers/promises';

export type Sleep = (ms: number) => Promise<unknown>;

/**
 * One per source, shared by every request in this process. Requests start at least
 * minIntervalMs apart (AniList: 30/min today; Jikan: 3/s and 60/min). After a 429 nothing
 * is sent before Retry-After; after a failure, callers fail at once for a cool-down instead
 * of each waiting for its own timeout. A caller never waits longer than its budget: when the
 * queue is longer than that, it is refused instead of piling up behind the others.
 */
export class RateLimiter {
  private nextSlot = 0;
  private downUntil = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly wait: Sleep = sleep,
  ) {}

  /**
   * Resolves when the caller may send, or returns false without reserving a slot when that
   * would take longer than maxWaitMs. Slots are reserved synchronously, so callers queue in order.
   */
  async acquire(maxWaitMs: number): Promise<boolean> {
    const now = this.now();
    const start = Math.max(now, this.nextSlot);
    if (start - now > maxWaitMs) return false;
    this.nextSlot = start + this.minIntervalMs;
    if (start > now) await this.wait(start - now);
    return true;
  }

  /** After a 429: no request before `until` (epoch ms). */
  pauseUntil(until: number): void {
    this.nextSlot = Math.max(this.nextSlot, until);
  }

  markDown(forMs: number): void {
    this.downUntil = Math.max(this.downUntil, this.now() + forMs);
  }

  isDown(): boolean {
    return this.now() < this.downUntil;
  }
}
