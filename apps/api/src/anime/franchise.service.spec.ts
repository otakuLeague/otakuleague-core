import { describe, expect, it } from 'vitest';
import { AnimeFranchiseService } from './franchise.service';

function currentSeasons(coverImageUrl: string | null) {
  const prisma = {
    animeSourceSnapshot: {
      findFirst: () =>
        Promise.resolve({
          titleEnglish: 'Frieren',
          titleRomaji: null,
          format: 'TV',
          status: 'FINISHED',
          startYear: 2023,
          startMonth: 9,
          startDay: 29,
          coverImageUrl,
        }),
    },
  };
  const service = new AnimeFranchiseService(
    prisma as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
  // The private fallback used when the relation graph is not cached.
  return (
    service as unknown as {
      currentFromCore(
        anilistId: number,
        slug: string,
      ): Promise<{ coverImageUrl: string | null }[]>;
    }
  ).currentFromCore(154587, 'frieren');
}

describe('AnimeFranchiseService current season cover', () => {
  it('keeps an AniList https cover', async () => {
    const [season] = await currentSeasons('https://s4.anilist.co/c.jpg');
    expect(season?.coverImageUrl).toBe('https://s4.anilist.co/c.jpg');
  });

  it.each([null, 'https://evil.example/c.jpg', 'https:/s4.anilist.co/c.jpg'])(
    'has no cover for %j',
    async (cover) => {
      const [season] = await currentSeasons(cover);
      expect(season?.coverImageUrl).toBeNull();
    },
  );
});
