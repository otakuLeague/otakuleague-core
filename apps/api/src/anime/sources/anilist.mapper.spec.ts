import { describe, expect, it } from 'vitest';
import {
  mapAniListListBlock,
  mapAniListMedia,
  mapAniListRelationNodes,
} from './anilist.mapper';
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

  it('maps the header fields: original creators, favourites, all-time ranks, cover colour', () => {
    expect(mapAniListMedia(media('anilist-attack-on-titan'))).toMatchObject({
      creators: ['Hajime Isayama'],
      favourites: 80474,
      rankRated: 69,
      rankPopular: 1,
      coverColor: '#f1a143',
    });
    // Writer and artist ("Original Character Design" next to "Original Story"), not assistants.
    expect(mapAniListMedia(media('anilist-frieren'))?.creators).toEqual([
      'Kanehito Yamada',
      'Tsukasa Abe',
    ]);
    expect(mapAniListMedia(media('anilist-minami-ke'))).toMatchObject({
      coverColor: null,
      rankRated: null,
      rankPopular: null,
    });
  });

  it('drops a malformed colour or rank, keeping the rest', () => {
    const aot = media('anilist-attack-on-titan');
    const snapshot = mapAniListMedia({
      ...aot,
      coverImage: { ...record(aot.coverImage), color: 'orange' },
      rankings: [{ rank: 'first', type: 'RATED', allTime: true }],
      staff: null,
    });

    expect(snapshot).toMatchObject({
      coverColor: null,
      rankRated: null,
      creators: [],
      favourites: 80474,
    });
  });

  it('keeps Original Creator/Story credits, and Character Design next to a Story credit, once each, in order', () => {
    const edge = (role: string, full: string) => ({
      role,
      node: { name: { full } },
    });
    const snapshot = mapAniListMedia({
      ...media('anilist-attack-on-titan'),
      staff: {
        edges: [
          edge('Original Story (ch. 1-50)', 'A'),
          edge('Original Character Design', 'B'),
          edge('Director, Original Creator', 'C'),
          edge('Original Creator', 'D'),
          edge('Original Creator', 'A'),
          edge('Original Creator Assistance', 'E'),
        ],
      },
    });

    expect(snapshot?.creators).toEqual(['A', 'B', 'D']);
  });

  it('leaves out an Original Character Design credit with no Original Story (an illustrator)', () => {
    const snapshot = mapAniListMedia({
      ...media('anilist-attack-on-titan'),
      staff: {
        edges: [
          { role: 'Original Creator', node: { name: { full: 'Author' } } },
          {
            role: 'Original Character Design',
            node: { name: { full: 'Illustrator' } },
          },
        ],
      },
    });

    expect(snapshot?.creators).toEqual(['Author']);
  });

  it("keeps only the all-time ranks of the anime's own format", () => {
    const snapshot = mapAniListMedia({
      ...media('anilist-attack-on-titan'),
      rankings: [
        { rank: 4, type: 'POPULAR', allTime: true, format: 'MOVIE' },
        { rank: 69, type: 'RATED', allTime: true, format: 'TV' },
      ],
    });

    expect(snapshot).toMatchObject({ rankRated: 69, rankPopular: null });
  });

  it('lowercases an uppercase colour and ignores non all-time ranks', () => {
    const aot = media('anilist-attack-on-titan');
    const snapshot = mapAniListMedia({
      ...aot,
      coverImage: { ...record(aot.coverImage), color: '#F1A143' },
      rankings: [
        { rank: 3, type: 'RATED', allTime: false },
        { rank: 5, type: 'POPULAR', allTime: false },
      ],
    });

    expect(snapshot).toMatchObject({
      coverColor: '#f1a143',
      rankRated: null,
      rankPopular: null,
    });
  });

  it('flags adult entries', () => {
    expect(
      mapAniListMedia({ ...media('anilist-frieren'), isAdult: true })?.adult,
    ).toBe(true);
    expect(mapAniListMedia(media('anilist-frieren'))?.adult).toBe(false);
  });

  it('refuses an entry not known to be safe, without flagging it adult', () => {
    expect(
      mapAniListMedia({ ...media('anilist-frieren'), isAdult: null }),
    ).toBeNull();
    expect(
      mapAniListMedia({ ...media('anilist-frieren'), isAdult: undefined }),
    ).toBeNull();
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

describe('mapAniListListBlock', () => {
  const data = (name: string) => record(record(fixture(name)).response).data;

  it('maps a page, drops the adult entry and keeps the sparse one with nulls', () => {
    const block = mapAniListListBlock(data('anilist-list-airing'));

    expect(block?.hasNextPage).toBe(true);
    expect(block?.entries.map(({ anilistId }) => anilistId)).toEqual([
      900001, 900002, 900004,
    ]);
    expect(block?.entries[0]).toEqual({
      anilistId: 900001,
      titleEnglish: 'Synthetic Magic Academy',
      titleRomaji: 'Synthetic Mahou Gakuen',
      coverImageUrl:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx900001-synthetic.jpg',
      coverColor: '#e4a15d',
      format: 'TV',
      status: 'RELEASING',
      episodes: null,
      season: 'FALL',
      seasonYear: 2026,
      startDate: { year: 2026, month: 10, day: 3 },
      genres: ['Action', 'Fantasy'],
      members: 52000,
      score: { source: 'anilist', score: 81, scale: 100 },
    });
    expect(block?.entries[1]).toMatchObject({
      titleEnglish: null,
      coverImageUrl: null,
      coverColor: null,
      format: null,
      score: null,
      genres: [],
      startDate: { year: 2026, month: null, day: null },
    });
  });

  it('maps the last-page marker of another page', () => {
    expect(mapAniListListBlock(data('anilist-list-top-page2'))).toMatchObject({
      hasNextPage: true,
      entries: [{ anilistId: 900011 }, { anilistId: 900012 }],
    });
  });

  it('treats a missing isAdult as adult, and an empty page as empty', () => {
    expect(
      mapAniListListBlock({ Page: { media: [{ id: 5, title: {} }] } }),
    ).toEqual({ entries: [], hasNextPage: false });
    expect(mapAniListListBlock({ Page: { media: [] } })).toEqual({
      entries: [],
      hasNextPage: false,
    });
  });

  it('returns null without a Page', () => {
    expect(mapAniListListBlock(null)).toBeNull();
    expect(mapAniListListBlock({ Page: { media: 'x' } })).toBeNull();
  });
});
