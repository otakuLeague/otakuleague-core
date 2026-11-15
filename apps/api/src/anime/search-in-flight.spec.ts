import { describe, expect, it, vi } from 'vitest';
import { DATABASE_POOL_MAX } from '../prisma/prisma.service';
import { SEARCH_MAX_IN_FLIGHT, SearchInFlight } from './search-in-flight';

/** A task that stays running until `finish` or `fail` is called. */
function deferred() {
  let finish: (value: string) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const promise = new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return { promise, finish, fail };
}

describe('SearchInFlight', () => {
  it('leaves connections of the pool for other routes', () => {
    expect(SEARCH_MAX_IN_FLIGHT).toBeLessThan(DATABASE_POOL_MAX);
  });

  const fill = (inFlight: SearchInFlight) =>
    Array.from({ length: SEARCH_MAX_IN_FLIGHT }, () => {
      const task = deferred();
      const run = inFlight.run(() => task.promise);
      return { task, run };
    });

  it('runs a single task and returns its value', async () => {
    await expect(
      new SearchInFlight().run(() => Promise.resolve(7)),
    ).resolves.toEqual({
      kind: 'done',
      value: 7,
    });
  });

  it('refuses the task after the cap without calling it', async () => {
    const inFlight = new SearchInFlight();
    const running = fill(inFlight);
    const extra = vi.fn(() => Promise.resolve('extra'));

    await expect(inFlight.run(extra)).resolves.toEqual({ kind: 'busy' });
    expect(extra).not.toHaveBeenCalled();

    for (const { task } of running) task.finish('ok');
    await Promise.all(running.map(({ run }) => run));
  });

  it('lets exactly one more in after a slot is released', async () => {
    const inFlight = new SearchInFlight();
    const running = fill(inFlight);
    running[0]?.task.finish('ok');
    await running[0]?.run;

    const next = deferred();
    const accepted = inFlight.run(() => next.promise);
    await expect(inFlight.run(() => Promise.resolve('late'))).resolves.toEqual({
      kind: 'busy',
    });

    next.finish('ok');
    await expect(accepted).resolves.toEqual({ kind: 'done', value: 'ok' });
    for (const { task } of running.slice(1)) task.finish('ok');
    await Promise.all(running.map(({ run }) => run));
  });

  it('gives the slot back when the task rejects', async () => {
    const inFlight = new SearchInFlight();
    const running = fill(inFlight);
    running[0]?.task.fail(new Error('boom'));
    await expect(running[0]?.run).rejects.toThrow('boom');

    await expect(inFlight.run(() => Promise.resolve(1))).resolves.toEqual({
      kind: 'done',
      value: 1,
    });
    for (const { task } of running.slice(1)) task.finish('ok');
    await Promise.all(running.slice(1).map(({ run }) => run));
  });

  it('gives the slot back when the task throws synchronously', async () => {
    const inFlight = new SearchInFlight();
    for (let attempt = 0; attempt < SEARCH_MAX_IN_FLIGHT + 1; attempt += 1) {
      await expect(
        inFlight.run(() => {
          throw new Error('sync');
        }),
      ).rejects.toThrow('sync');
    }
    await expect(inFlight.run(() => Promise.resolve(1))).resolves.toEqual({
      kind: 'done',
      value: 1,
    });
  });
});
