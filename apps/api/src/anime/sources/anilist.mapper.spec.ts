import { describe, expect, it } from 'vitest';
import { mapAniListMedia, mapAniListRelationNodes } from './anilist.mapper';
import { fixture } from './fixtures';
import { record } from './parse';

function media(name: string): Record<string, unknown> {
  return record(record(record(fixture(name)).data).Media);
}

describe('mapAniListMedia', () => {
  it('maps Attack on Titan, trimming the tab AniList puts after the trailer id', () => {
    const snapshot = mapAniListMedia(media('anilist-attack-on-titan'));

    expect(snapshot).toMatchObject({
      ids: [
        { source: 'anilist', externalId: 16498 },
        { source: 'myanimelist', externalId: 16498 },
      ],
      sourceUrl: 'https://anilist.co/anime/16498',
      adult: false,
      titleRomaji: 'Shingeki no Kyojin',
      titleEnglish: 'Attack on Titan',
      titleNative: '進撃の巨人',
      format: 'TV',
      status: 'FINISHED',
      startDate: { year: 2013, month: 4, day: 7 },
      season: 'SPRING',
      seasonYear: 2013,
      episodes: 25,
      durationMinutes: 24,
      trailer: { site: 'youtube', id: 'LHtdKWJdif4' },
      nextEpisode: null,
    });
    expect(snapshot?.studios).toContainEqual({
      name: 'WIT STUDIO',
      main: true,
    });
    expect(
      snapshot?.studios.filter((studio) => !studio.main).length,
    ).toBeGreaterThan(0);
    expect(snapshot?.links).toContainEqual(
      expect.objectContaining({ site: 'Crunchyroll', kind: 'streaming' }),
    );
    expect(snapshot?.links).toContainEqual(
      expect.objectContaining({ site: 'Official Site', kind: 'other' }),
    );
    expect(snapshot?.tags.length).toBeGreaterThan(0);
    expect(snapshot?.tags.some((tag) => tag.spoiler)).toBe(true);
    expect(snapshot?.score).toBe(85);
  });

  it('turns the HTML description into plain text', () => {
    const raw = media('anilist-attack-on-titan');
    const synopsis = mapAniListMedia(raw)?.synopsis ?? '';

    expect(String(raw.description)).toMatch(/<br\s*\/?>/);
    expect(synopsis).not.toMatch(/[<>]/);
    expect(synopsis).toContain('\n\n');
  });

  it('keeps a missing English title as null (Minami-ke has none)', () => {
    const snapshot = mapAniListMedia(media('anilist-minami-ke'));

    expect(snapshot?.titleEnglish).toBeNull();
    expect(snapshot?.titleRomaji).toBe('Minami-ke');
  });

  it('maps the next airing episode of an airing show to a date', () => {
    const snapshot = mapAniListMedia(media('anilist-one-piece'));

    expect(snapshot?.status).toBe('RELEASING');
    expect(snapshot?.nextEpisode).toEqual({
      episode: 1181,
      airingAt: new Date(1798985760 * 1000),
    });
  });

  it('returns null when there is no media (unknown id)', () => {
    expect(
      mapAniListMedia(record(record(fixture('anilist-not-found')).data).Media),
    ).toBeNull();
  });

  it('turns a field that changed type into null or empty, and keeps the rest', () => {
    const raw = {
      ...media('anilist-frieren'),
      episodes: '28',
      format: 'HOLOGRAM',
      tags: 'not a list',
      startDate: { year: 'soon' },
      trailer: { id: '   ', site: 'youtube' },
      externalLinks: [
        { site: 'Bad', url: 'javascript:alert(1)', type: 'STREAMING' },
      ],
    };

    expect(mapAniListMedia(raw)).toMatchObject({
      episodes: null,
      format: null,
      tags: [],
      startDate: null,
      trailer: null,
      links: [],
      titleRomaji: 'Sousou no Frieren',
    });
  });

  it('flags adult entries', () => {
    expect(
      mapAniListMedia({ ...media('anilist-frieren'), isAdult: true })?.adult,
    ).toBe(true);
  });
});

const WALKS = [
  'attack-on-titan',
  'demon-slayer',
  'fate-zero',
  'frieren',
  'fullmetal-alchemist-2003',
  'fullmetal-alchemist-brotherhood',
  'gintama',
  'monogatari',
  'one-piece',
];

/** The `data` of each recorded walk level (fixtures README). */
function walkLevels(name: string): Record<string, unknown>[] {
  const levels = fixture(`anilist-walk-${name}`);
  return (Array.isArray(levels) ? levels : []).map((level) =>
    record(record(record(level).response).data),
  );
}

describe('mapAniListRelationNodes', () => {
  it('maps a node, its edges and their targets, manga source included', () => {
    const [aot] = mapAniListRelationNodes(walkLevels('attack-on-titan')[0]);

    expect(aot).toMatchObject({
      anilistId: 16498,
      mediaType: 'ANIME',
      format: 'TV',
      status: 'FINISHED',
      startDate: { year: 2013, month: 4, day: 7 },
      titleEnglish: 'Attack on Titan',
      titleRomaji: 'Shingeki no Kyojin',
    });
    expect(aot?.coverImageUrl).toMatch(/^https:\/\//);
    const edge = (targetId: number) =>
      aot?.edges.find(({ target }) => target.anilistId === targetId);
    expect(edge(20958)).toMatchObject({
      relation: 'SEQUEL',
      target: { format: 'TV', mediaType: 'ANIME' },
    });
    expect(edge(53390)).toMatchObject({
      relation: 'SOURCE',
      target: { mediaType: 'MANGA', format: 'MANGA' },
    });
  });

  it('keeps an unaired entry with no format, or with no start date', () => {
    const monogatari = walkLevels('monogatari').flatMap(
      mapAniListRelationNodes,
    );
    const demonSlayer = walkLevels('demon-slayer').flatMap(
      mapAniListRelationNodes,
    );

    expect(monogatari.find((node) => node.anilistId === 195448)).toMatchObject({
      status: 'NOT_YET_RELEASED',
      format: null,
    });
    expect(demonSlayer.find((node) => node.anilistId === 195200)).toMatchObject(
      { status: 'NOT_YET_RELEASED', format: 'MOVIE', startDate: null },
    );
  });

  it('maps every recorded walk level without losing a node', () => {
    for (const name of WALKS) {
      for (const data of walkLevels(name)) {
        const raw = record(record(data).Page).media;
        expect(mapAniListRelationNodes(data)).toHaveLength(
          Array.isArray(raw) ? raw.length : -1,
        );
      }
    }
  });

  it('drops adult entries and edges of an unknown relation type, nothing else', () => {
    const data = walkLevels('attack-on-titan')[0];
    const [aot] = record(record(data).Page).media as Record<string, unknown>[];
    const edges = record(aot?.relations).edges as Record<string, unknown>[];
    const [first, second, ...rest] = edges;
    const withEdges = (replaced: unknown[]) => ({
      Page: { media: [{ ...aot, relations: { edges: replaced } }] },
    });

    const mapped = mapAniListRelationNodes(
      withEdges([
        { ...first, node: { ...record(first?.node), isAdult: true } },
        { ...second, relationType: 'SOMETHING_NEW' },
        ...rest,
      ]),
    );

    expect(mapped[0]?.edges).toHaveLength(edges.length - 2);
    expect(
      mapAniListRelationNodes({ Page: { media: [{ ...aot, isAdult: true }] } }),
    ).toEqual([]);
    // Not known to be safe is treated as adult.
    expect(
      mapAniListRelationNodes({ Page: { media: [{ ...aot, isAdult: null }] } }),
    ).toEqual([]);
    expect(mapAniListRelationNodes({ Page: null })).toEqual([]);
  });

  it('keeps a node with no relations, drops a manga or id-less node', () => {
    const data = walkLevels('attack-on-titan')[0];
    const [aot] = record(record(data).Page).media as Record<string, unknown>[];

    const mapped = mapAniListRelationNodes({
      Page: {
        media: [
          { ...aot, relations: undefined },
          { ...aot, relations: null },
          { ...aot, type: 'MANGA' },
          { ...aot, id: '16498' },
        ],
      },
    });

    expect(mapped.map(({ edges }) => edges)).toEqual([[], []]);
  });
});
