import { describe, expect, it, vi } from 'vitest';
import {
  HashSlots,
  MAX_RUNNING_HASHES,
  MAX_WAITING_HASHES,
} from './hash-slots';

/** A task that stays running until `finish` or `fail`; `started` lists the tasks called, in order. */
function tasks() {
  const started: string[] = [];
  const make = (name: string) => {
    let finish: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const promise = new Promise<string>((resolve, reject) => {
      finish = () => resolve(name);
      fail = reject;
    });
    const task = () => {
      started.push(name);
      return promise;
    };
    return { task, finish: () => finish(), fail: (error: Error) => fail(error) };
  };
  return { started, make };
}

/** Lets every pending promise callback run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('HashSlots', () => {
  it('leaves libuv threads free for DNS and file I/O', () => {
    expect(MAX_RUNNING_HASHES).toBeLessThan(4);
  });

  it('runs two at once and holds the third until a slot frees', async () => {
    const slots = new HashSlots();
    const { started, make } = tasks();
    const [a, b, c] = ['a', 'b', 'c'].map(make);
    const runs = [a, b, c].map((held) => held && slots.run(held.task));

    await settle();
    expect(started).toEqual(['a', 'b']);

    a?.finish();
    await settle();
    expect(started).toEqual(['a', 'b', 'c']);

    b?.finish();
    c?.finish();
    await expect(Promise.all(runs)).resolves.toEqual(
      ['a', 'b', 'c'].map((value) => ({ kind: 'done', value })),
    );
  });

  it('starts the waiting tasks in arrival order', async () => {
    const slots = new HashSlots();
    const { started, make } = tasks();
    const held = ['a', 'b', 'c', 'd', 'e'].map(make);
    const runs = held.map(({ task }) => slots.run(task));

    for (const { finish } of held) {
      finish();
      await settle();
    }

    expect(started).toEqual(['a', 'b', 'c', 'd', 'e']);
    await Promise.all(runs);
  });

  it('refuses one more than it can run and queue, without calling it', async () => {
    const slots = new HashSlots();
    const { make } = tasks();
    const held = Array.from(
      { length: MAX_RUNNING_HASHES + MAX_WAITING_HASHES },
      (_, index) => make(String(index)),
    );
    const runs = held.map(({ task }) => slots.run(task));
    const extra = vi.fn(() => Promise.resolve('extra'));

    await expect(slots.run(extra)).resolves.toEqual({ kind: 'busy' });
    expect(extra).not.toHaveBeenCalled();

    for (const { finish } of held) finish();
    await Promise.all(runs);
    await expect(slots.run(extra)).resolves.toEqual({
      kind: 'done',
      value: 'extra',
    });
  });

  it('gives the slot of a failed task to the next one', async () => {
    const slots = new HashSlots();
    const { started, make } = tasks();
    const [a, b, c] = ['a', 'b', 'c'].map(make);
    const failed = a && slots.run(a.task);
    const runs = [b, c].map((held) => held && slots.run(held.task));

    a?.fail(new Error('argon2 failed'));

    await expect(failed).rejects.toThrow('argon2 failed');
    await settle();
    expect(started).toEqual(['a', 'b', 'c']);
    b?.finish();
    c?.finish();
    await Promise.all(runs);
  });
});
