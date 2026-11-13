import type {
  AnimeListCard,
  AnimeListCardPage,
} from '@otakuleague/shared-types';
import { describe, expect, it } from 'vitest';
import type { ApiFailure, ApiResult } from '../api/client';
import { listEntries, listEntry } from '../home/fixtures';
import { collectGridPages, type LoadGridPage } from './anime-grid';

type Answer = ApiResult<AnimeListCardPage>;

function page(
  entries: readonly AnimeListCard[],
  nextCursor: string | null,
): Answer {
  return { ok: true, data: { kind: 'seasonal', entries, nextCursor } };
}

function failure(failed: ApiFailure): Answer {
  return { ok: false, failure: failed };
}

/** A fake API answering in order, recording each request. */
function fakeLoader(answers: readonly Answer[]) {
  const requests: { cursor: string | null; limit: number }[] = [];
  const loadPage: LoadGridPage = (request) => {
    requests.push({ ...request });
    const answer = answers[requests.length - 1];
    if (answer === undefined) throw new Error('unexpected call');
    return Promise.resolve(answer);
  };
  return { loadPage, requests };
}

const ids = (count: number, from = 1) =>
  listEntries(count + from - 1).slice(from - 1);

describe('collectGridPages', () => {
  it('asks once for 24 on page 1', async () => {
    const { loadPage, requests } = fakeLoader([page(ids(24), 'c1')]);

    const state = await collectGridPages(loadPage, 1);

    expect(requests).toEqual([{ cursor: null, limit: 24 }]);
    expect(state).toMatchObject({ kind: 'loaded', more: 'available' });
  });

  it('walks the cursors for page 3: 48, then 24', async () => {
    const { loadPage, requests } = fakeLoader([
      page(ids(48), 'c1'),
      page(ids(24, 49), 'c2'),
    ]);

    const state = await collectGridPages(loadPage, 3);

    expect(requests).toEqual([
      { cursor: null, limit: 48 },
      { cursor: 'c1', limit: 24 },
    ]);
    expect(state.kind === 'loaded' && state.entries).toHaveLength(72);
  });

  it('ends on a null cursor, even mid-walk', async () => {
    const { loadPage, requests } = fakeLoader([page(ids(30), null)]);

    expect(await collectGridPages(loadPage, 3)).toMatchObject({
      kind: 'loaded',
      more: 'end',
    });
    expect(requests).toHaveLength(1);
  });

  it('caps at page 10', async () => {
    const answers = Array.from({ length: 5 }, (_, call) =>
      page(ids(48, call * 48 + 1), `c${call + 1}`),
    );
    const { loadPage } = fakeLoader(answers);

    const state = await collectGridPages(loadPage, 10);

    expect(state).toMatchObject({ kind: 'loaded', more: 'capped' });
    expect(state.kind === 'loaded' && state.entries).toHaveLength(240);
  });

  it('fails the grid when the first call fails; 429 is busy', async () => {
    const busy = fakeLoader([
      failure({
        kind: 'api_error',
        status: 429,
        error: { error: { code: 'CLIENT_ERROR', message: 'Slow down' } },
      }),
    ]);
    const down = fakeLoader([failure({ kind: 'timeout' })]);

    expect(await collectGridPages(busy.loadPage, 1)).toEqual({
      kind: 'failed',
      reason: 'busy',
    });
    expect(await collectGridPages(down.loadPage, 1)).toEqual({
      kind: 'failed',
      reason: 'unavailable',
    });
  });

  it('keeps the loaded cards when a later call fails', async () => {
    const { loadPage } = fakeLoader([
      page(ids(48), 'c1'),
      failure({ kind: 'network' }),
    ]);

    const state = await collectGridPages(loadPage, 3);

    expect(state).toMatchObject({ kind: 'loaded', more: 'failed' });
    expect(state.kind === 'loaded' && state.entries).toHaveLength(48);
  });

  it('drops a repeat across a page boundary', async () => {
    const { loadPage } = fakeLoader([
      page(ids(48), 'c1'),
      page([listEntry({ anilistId: 48 }), ...ids(23, 49)], 'c2'),
    ]);

    const state = await collectGridPages(loadPage, 3);

    expect(state.kind === 'loaded' && state.entries).toHaveLength(71);
  });

  it('is empty when the first page has no entries', async () => {
    const { loadPage } = fakeLoader([page([], null)]);

    expect(await collectGridPages(loadPage, 1)).toEqual({ kind: 'empty' });
  });

  it('shows a single anime with no more to load', async () => {
    const { loadPage } = fakeLoader([page(ids(1), null)]);

    expect(await collectGridPages(loadPage, 1)).toMatchObject({
      kind: 'loaded',
      entries: [{ anilistId: 1 }],
      more: 'end',
    });
  });

  it('makes at most one call per page when pages come back short', async () => {
    const { loadPage, requests } = fakeLoader([
      page(ids(2), 'c1'),
      page(ids(2, 3), 'c2'),
    ]);

    expect(await collectGridPages(loadPage, 2)).toMatchObject({
      kind: 'loaded',
      more: 'available',
    });
    expect(requests).toHaveLength(2);
  });
});
