import { Injectable } from '@nestjs/common';

/** Hashes running at once: the libuv pool has 4 threads, shared with DNS and file I/O (ADR 0015). */
export const MAX_RUNNING_HASHES = 2;
/** Hashes queued for a slot; one more is refused at once. */
export const MAX_WAITING_HASHES = 8;

export type HashRun<Value> =
  { readonly kind: 'busy' } | { readonly kind: 'done'; readonly value: Value };

/** Optional work (the rehash) never queues: it runs in a slot free right now or is skipped. */
export type HashTry<Value> =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'done'; readonly value: Value };

/**
 * A cap on argon2 work in this process, in memory like the thread pool it protects. Over the
 * running cap a hash waits in FIFO order; over the waiting cap it is refused without running.
 */
@Injectable()
export class HashSlots {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  /** Runs the task in a slot, or answers `busy` without calling it. The slot is always given back. */
  async run<Value>(task: () => Promise<Value>): Promise<HashRun<Value>> {
    if (this.running < MAX_RUNNING_HASHES) {
      this.running += 1;
    } else if (this.waiting.length < MAX_WAITING_HASHES) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    } else {
      return { kind: 'busy' };
    }
    return this.runHeld(task);
  }

  /** Runs the task only when a slot is free and nobody waits, else `skipped` without calling it. */
  tryRun<Value>(task: () => Promise<Value>): Promise<HashTry<Value>> {
    if (this.running >= MAX_RUNNING_HASHES || this.waiting.length > 0) {
      return Promise.resolve({ kind: 'skipped' });
    }
    this.running += 1;
    return this.runHeld(task);
  }

  /** The caller holds a slot; it is always given back. */
  private async runHeld<Value>(
    task: () => Promise<Value>,
  ): Promise<{ readonly kind: 'done'; readonly value: Value }> {
    try {
      return { kind: 'done', value: await task() };
    } finally {
      this.release();
    }
  }

  /** Hands the slot straight to the oldest waiter, so a newcomer cannot jump the queue. */
  private release(): void {
    const next = this.waiting.shift();
    if (next === undefined) this.running -= 1;
    else next();
  }
}
