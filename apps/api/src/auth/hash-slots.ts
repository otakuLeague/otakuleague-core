import { Injectable } from '@nestjs/common';

/** Hashes running at once: the libuv pool has 4 threads, shared with DNS and file I/O (ADR 0015). */
export const MAX_RUNNING_HASHES = 2;
/** Hashes queued for a slot; one more is refused at once. */
export const MAX_WAITING_HASHES = 8;

export type HashRun<Value> =
  { readonly kind: 'busy' } | { readonly kind: 'done'; readonly value: Value };

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
