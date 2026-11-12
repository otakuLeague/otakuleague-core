import type { INestApplication } from '@nestjs/common';
import type {
  AnimeDataSource,
  AnimeSearchPage,
} from '@otakuleague/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../testing/test-app';
import { SEARCH_SEED } from './anime-search.seed';
import {
  AnimeSourceSettings,
  type SourceSettings,
} from './sources/source-settings';

/** Never reached: search must not call a source, so any call would fail the connection. */
class SwitchableSettings extends AnimeSourceSettings {
  readonly enabled: Record<AnimeDataSource, boolean> = {
    anilist: true,
    jikan: true,
  };

  get(source: AnimeDataSource): SourceSettings {
    return {
      enabled: this.enabled[source],
      baseUrl: 'http://127.0.0.1:9',
      minIntervalMs: 0,
      timeoutMs: 200,
      maxRetryAfterMs: 0,
      coolDownMs: 0,
      maxQueueMs: 0,
    };
  }
}

const NOW = new Date('2026-10-15T12:00:00.000Z');
const LONG_AGO = new Date('2026-09-01T12:00:00.000Z');
const animeId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
const COWBOY_BEBOP = SEARCH_SEED.findIndex(
  ({ slug }) => slug === 'cowboy-bebop',
);

/** Expectations checked against PostgreSQL 16 with pg_trgm before they were written here. */
const RANKING: readonly (readonly [
  query: string,
  slug: string,
  kind: string,
  matched: string,
])[] = [
  ['aot', 'attack-on-titan', 'synonym', 'AoT'],
  ['AoT', 'attack-on-titan', 'synonym', 'AoT'],
  ['jjk', 'jujutsu-kaisen', 'synonym', 'JJK'],
  ['fmab', 'fullmetal-alchemist-brotherhood', 'synonym', 'FMAB'],
  ['shingeki', 'attack-on-titan', 'romaji', 'Shingeki no Kyojin'],
  ['進撃', 'attack-on-titan', 'native', '進撃の巨人'],
  ['attack on titan', 'attack-on-titan', 'english', 'Attack on Titan'],
  ['atack on titn', 'attack-on-titan', 'english', 'Attack on Titan'],
  ['titan', 'attack-on-titan', 'english', 'Attack on Titan'],
  ['re zero', 're-zero-starting-life-in-another-world', 'synonym', 'Re: Zero'],
  ['re:zero', 're-zero-starting-life-in-another-world', 'synonym', 'Re: Zero'],
  ['rezero', 're-zero-starting-life-in-another-world', 'synonym', 'ReZero'],
  [
    'hunter x hunter',
    'hunter-x-hunter-2011',
    'english',
    'Hunter x Hunter (2011)',
  ],
  ['hunterxhunter', 'hunter-x-hunter-2011', 'romaji', 'HUNTER×HUNTER (2011)'],
  ['jojos', 'jojos-bizarre-adventure', 'english', "JoJo's Bizarre Adventure"],
  ['jojo', 'jojos-bizarre-adventure', 'synonym', 'JoJo'],
  ['86', '86-eighty-six', 'synonym', '86'],
  ['k', 'k', 'english', 'K'],
  ['pokemon', 'pokemon', 'english', 'Pokémon'],
  ['deth note', 'death-note', 'english', 'Death Note'],
  ['shingeki no kyojn', 'attack-on-titan', 'romaji', 'Shingeki no Kyojin'],
];

describe('GET /anime/search', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const settings = new SwitchableSettings();

  const search = (params: Record<string, string | number>) =>
    request(app.getHttpServer()).get('/anime/search').query(params);
  const ok = async (params: Record<string, string | number>) => {
    const response = await search(params).expect(200);
    return response.body as AnimeSearchPage;
  };

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: AnimeSourceSettings, useValue: settings }],
    });
    prisma = app.get(PrismaService);
    for (const [index, seed] of SEARCH_SEED.entries()) {
      await prisma.anime.create({
        data: {
          id: animeId(index),
          createdAt: NOW,
          lastViewedAt: LONG_AGO,
          externalIds: {
            create: [{ source: 'ANILIST', externalId: seed.anilistId }],
          },
          snapshots: {
            create: [
              {
                source: 'ANILIST',
                fetchedAt: NOW,
                sourceUrl: `https://anilist.co/anime/${seed.anilistId}`,
                titleEnglish: seed.english,
                titleRomaji: seed.romaji,
                titleNative: seed.native,
                synonyms: [...seed.synonyms],
                members: seed.members,
              },
            ],
          },
        },
      });
      if (seed.slug !== null) {
        await prisma.animeIdentity.create({
          data: {
            anilistId: seed.anilistId,
            canonicalSlug: seed.slug,
            createdAt: NOW,
          },
        });
      }
    }
    // A title only MyAnimeList's snapshot knows: it must vanish when Jikan is switched off.
    await prisma.animeSourceSnapshot.create({
      data: {
        animeId: animeId(COWBOY_BEBOP),
        source: 'JIKAN',
        fetchedAt: NOW,
        sourceUrl: 'https://myanimelist.net/anime/1',
        titleRomaji: 'Cowboy Bebop',
        synonyms: ['Spike Spiegel Story'],
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(RANKING)('ranks %j first as %s', async (q, slug, kind, matched) => {
    const { hits } = await ok({ q });

    expect(hits[0]?.slug).toBe(slug);
    expect(hits[0]?.matchedTitle).toEqual({ kind, text: matched });
  });

  it('puts the exact title before a later season', async () => {
    const { hits, total } = await ok({ q: 'attack on titan' });

    expect(hits.map(({ slug }) => slug)).toEqual([
      'attack-on-titan',
      'attack-on-titan-season-2',
    ]);
    expect(total).toBe(2);
  });

  it('finds nothing for a typo too far from any title', async () => {
    expect(await ok({ q: 'freiren' })).toEqual({
      hits: [],
      page: 1,
      pageSize: 24,
      total: 0,
    });
  });

  it('finds nothing, and does not fail, for a query without letters or digits', async () => {
    expect((await ok({ q: '!!!' })).total).toBe(0);
  });

  it('describes the anime on the card', async () => {
    const { hits } = await ok({ q: 'frieren' });

    expect(hits[0]).toMatchObject({
      slug: 'frieren-beyond-journeys-end',
      ref: { source: 'anilist', id: '154587' },
      title: "Frieren: Beyond Journey's End",
      matchedTitle: { kind: 'english', text: "Frieren: Beyond Journey's End" },
      score: null,
    });
  });

  it('pages the results and keeps the total past the last page', async () => {
    const first = await ok({ q: 'titan', pageSize: 1 });
    const second = await ok({ q: 'titan', pageSize: 1, page: 2 });
    const beyond = await ok({ q: 'titan', pageSize: 1, page: 3 });

    expect(first.hits.map(({ slug }) => slug)).toEqual(['attack-on-titan']);
    expect(second.hits.map(({ slug }) => slug)).toEqual([
      'attack-on-titan-season-2',
    ]);
    expect([first.total, second.total, beyond.total]).toEqual([2, 2, 2]);
    expect(beyond).toMatchObject({ hits: [], page: 3, pageSize: 1 });
  });

  it('hides the titles of a switched-off source', async () => {
    expect((await ok({ q: 'spike spiegel' })).hits).toHaveLength(1);

    settings.enabled.jikan = false;
    try {
      expect((await ok({ q: 'spike spiegel' })).total).toBe(0);
      expect((await ok({ q: 'cowboy bebop' })).hits[0]?.slug).toBe(
        'cowboy-bebop',
      );
      settings.enabled.anilist = false;
      expect(await ok({ q: 'cowboy bebop' })).toMatchObject({
        hits: [],
        total: 0,
      });
    } finally {
      settings.enabled.anilist = true;
      settings.enabled.jikan = true;
    }
  });

  it('links an anime without an identity by its source id', async () => {
    const { hits } = await ok({ q: 'naruto' });

    expect(hits[0]).toMatchObject({
      slug: null,
      ref: { source: 'anilist', id: '20' },
    });
  });

  it('is not a view: the 30-day purge clock does not move', async () => {
    await ok({ q: 'death note' });

    const anime = await prisma.anime.findUnique({
      where: {
        id: animeId(SEARCH_SEED.findIndex(({ slug }) => slug === 'death-note')),
      },
    });
    expect(anime?.lastViewedAt).toEqual(LONG_AGO);
  });

  it.each([
    ['q missing', {}],
    ['q empty', { q: '' }],
    ['q only spaces', { q: '   ' }],
    ['q over 100 characters', { q: 'a'.repeat(101) }],
    ['page 0', { q: 'aot', page: 0 }],
    ['page over 100', { q: 'aot', page: 101 }],
    ['page not a number', { q: 'aot', page: 'two' }],
    ['pageSize 0', { q: 'aot', pageSize: 0 }],
    ['pageSize over 50', { q: 'aot', pageSize: 51 }],
    ['an unknown parameter', { q: 'aot', sort: 'popularity' }],
  ])('rejects %s with a 400 error envelope', async (_name, params) => {
    const response = await search(params).expect(400);

    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('accepts the largest allowed query and page size', async () => {
    const page = await ok({ q: 'a'.repeat(100), page: 100, pageSize: 50 });

    expect(page).toMatchObject({ page: 100, pageSize: 50, hits: [] });
  });
});
