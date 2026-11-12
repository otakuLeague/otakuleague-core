import { describe, expect, it } from 'vitest';
import { Clock } from '../common/clock-and-random.module';
import type { PrismaService } from '../prisma/prisma.service';
import { FranchiseWalker, relationsKey } from './franchise-walker.service';
import { SourceBackoff } from './source-backoff';
import type { AniListAdapter } from './sources/anilist.adapter';
import type { AnimeSourceSettings } from './sources/source-settings';
import {
  type RelationNode,
  SourceUnavailableError,
  UnusableAnswerError,
} from './sources/source.types';

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-10-16T12:00:00.000Z');
  }
}

function summary(anilistId: number): Omit<RelationNode, 'edges'> {
  return {
    anilistId,
    mediaType: 'ANIME',
    format: 'TV',
    status: 'FINISHED',
    startDate: null,
    titleEnglish: null,
    titleRomaji: null,
    coverImageUrl: null,
  };
}

function node(
  anilistId: number,
  sequels: readonly number[] = [],
): RelationNode {
  return {
    ...summary(anilistId),
    edges: sequels.map((target) => ({
      relation: 'SEQUEL',
      target: summary(target),
    })),
  };
}

function walkerFor(
  fetchRelations: (ids: readonly number[]) => Promise<RelationNode[]>,
) {
  const clock = new FixedClock();
  const backoff = new SourceBackoff(clock);
  const prisma = {
    animeFranchiseOverride: { findMany: () => Promise.resolve([]) },
    animeRelationNode: {
      findMany: () => Promise.resolve([]),
      upsert: () => Promise.resolve({}),
    },
  } as unknown as PrismaService;
  const settings = {
    get: () => ({ enabled: true, minIntervalMs: 0 }),
  } as unknown as AnimeSourceSettings;
  const anilist = {
    isDown: () => false,
    fetchRelations,
  } as unknown as AniListAdapter;
  return {
    backoff,
    walker: new FranchiseWalker(prisma, clock, settings, anilist, backoff),
  };
}

describe('FranchiseWalker oversized answer', () => {
  it('backs a single overflowing id off and ends the walk without it', async () => {
    const { walker, backoff } = walkerFor(() =>
      Promise.reject(new UnusableAnswerError('anilist', 'too large')),
    );

    await expect(walker.walk(16498)).resolves.toBe('missing');
    expect(backoff.isBackedOff(relationsKey(16498))).toBe(true);
  });

  it('does not back off for another source failure', async () => {
    const { walker, backoff } = walkerFor(() =>
      Promise.reject(new SourceUnavailableError('anilist', 'HTTP 503')),
    );

    await expect(walker.walk(16498)).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(backoff.isBackedOff(relationsKey(16498))).toBe(false);
  });

  it('splits an oversized batch and backs off only the id that overflows', async () => {
    const asked: (readonly number[])[] = [];
    const { walker, backoff } = walkerFor((ids) => {
      asked.push(ids);
      if (ids.length === 1 && ids[0] === 1) {
        return Promise.resolve([node(1, [2, 3, 4, 5])]);
      }
      if (ids.length > 1 || ids[0] === 3) {
        return Promise.reject(new UnusableAnswerError('anilist', 'too large'));
      }
      return Promise.resolve(ids.map((id) => node(id)));
    });

    await walker.walk(1);

    expect(asked).toContainEqual([2, 3, 4, 5]);
    expect(asked).toContainEqual([2, 3]);
    expect(asked).toContainEqual([4, 5]);
    expect(backoff.isBackedOff(relationsKey(3))).toBe(true);
    for (const id of [1, 2, 4, 5]) {
      expect(backoff.isBackedOff(relationsKey(id))).toBe(false);
    }
  });
});
