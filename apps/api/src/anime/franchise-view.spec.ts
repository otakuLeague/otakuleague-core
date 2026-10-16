import { describe, expect, it } from 'vitest';
import { traverseFranchise } from './franchise-graph';
import {
  buildFranchise,
  type FranchiseOverride,
  seasonLabelFromTitle,
} from './franchise-view';
import { mapAniListRelationNodes } from './sources/anilist.mapper';
import { fixture } from './sources/fixtures';
import { record } from './sources/parse';
import type { RelationNode } from './sources/source.types';

/** Every walked entry of the recorded franchises (fixtures README), by AniList id. */
const NODES: ReadonlyMap<number, RelationNode> = new Map(
  [
    'attack-on-titan',
    'demon-slayer',
    'fate-zero',
    'frieren',
    'fullmetal-alchemist-2003',
    'fullmetal-alchemist-brotherhood',
    'gintama',
    'monogatari',
    'one-piece',
  ]
    .flatMap((name) =>
      (fixture(`anilist-walk-${name}`) as unknown[]).flatMap((level) =>
        mapAniListRelationNodes(record(record(level).response).data),
      ),
    )
    .map((node) => [node.anilistId, node]),
);

/** The overrides shipped by migration franchise_walk (owner decisions, ADR 0008). */
const OWNER_OVERRIDES: ReadonlyMap<number, FranchiseOverride> = new Map([
  [167404, { role: 'RELATED', label: null }],
  [146984, { role: 'SEASON', label: 'The Final Chapters Part 1' }],
  [162314, { role: 'SEASON', label: 'The Final Chapters Part 2' }],
  [356, { role: 'BOUNDARY', label: null }],
  [19603, { role: 'BOUNDARY', label: null }],
  [6922, { role: 'BOUNDARY', label: null }],
  [20791, { role: 'BOUNDARY', label: null }],
]);

interface Options {
  readonly nodes?: ReadonlyMap<number, RelationNode>;
  readonly overrides?: ReadonlyMap<number, FranchiseOverride>;
  readonly removed?: ReadonlySet<number>;
  readonly nodeCap?: number;
}

/** What the endpoint will do: traverse the stored rows, then build the view. */
const franchise = async (
  startId: number,
  {
    nodes = NODES,
    overrides = OWNER_OVERRIDES,
    removed = new Set(),
    nodeCap,
  }: Options = {},
) => {
  const boundaries = new Set(
    [...overrides]
      .filter(([, override]) => override.role === 'BOUNDARY')
      .map(([id]) => id),
  );
  const traversal = await traverseFranchise(
    startId,
    (ids) => Promise.resolve(ids.flatMap((id) => nodes.get(id) ?? [])),
    boundaries,
    nodeCap,
  );
  return buildFranchise({ startId, traversal, boundaries, overrides, removed });
};
const labels = async (startId: number, options?: Options) =>
  (await franchise(startId, options)).mainLine.map(({ label }) => label);
const group = async (startId: number, name: string) =>
  (await franchise(startId)).related
    .find((related) => related.group === name)
    ?.entries.map(({ anilistId }) => anilistId);

describe('buildFranchise on recorded franchises', () => {
  it('Attack on Titan: Final Season parts, and the Final Chapters by override', async () => {
    const aot = await franchise(16498);

    expect(aot.state).toBe('complete');
    expect(aot.mainLine.map(({ label }) => label)).toEqual([
      'Season 1',
      'Season 2',
      'Season 3',
      'Season 3 Part 2',
      'Final Season',
      'Final Season Part 2',
      'The Final Chapters Part 1',
      'The Final Chapters Part 2',
    ]);
    expect(await group(16498, 'ova')).toContain(20811);
    expect(await group(16498, 'source')).toContain(53390);
    expect(await group(16498, 'spin_off')).toContain(21281);
  });

  it('Attack on Titan: the same seasons from Season 3, which is current', async () => {
    const fromSeason3 = (await franchise(99147)).mainLine;

    expect(fromSeason3.map(({ anilistId }) => anilistId)).toEqual(
      (await franchise(16498)).mainLine.map(({ anilistId }) => anilistId),
    );
    expect(
      fromSeason3
        .filter(({ isCurrent }) => isCurrent)
        .map(({ label }) => label),
    ).toEqual(['Season 3']);
  });

  it('Attack on Titan without overrides: the Final Chapters SPECIALs are not seasons', async () => {
    expect(await labels(16498, { overrides: new Map() })).toHaveLength(6);
  });

  it('Demon Slayer: the movie between seasons is walked through, not listed', async () => {
    expect(await labels(101922)).toEqual([
      'Season 1',
      'Season 2',
      'Season 3',
      'Season 4',
      'Season 5',
    ]);
    // Mugen Train, Infinity Castle and its two unaired, dateless sequels, last.
    expect(await group(101922, 'movie')).toEqual([
      112151, 178788, 195200, 195201,
    ]);
  });

  it('Fullmetal Alchemist 2003 and Brotherhood stay two franchises', async () => {
    expect(
      (await franchise(121)).mainLine.map(({ anilistId }) => anilistId),
    ).toEqual([121]);
    expect(
      (await franchise(5114)).mainLine.map(({ anilistId }) => anilistId),
    ).toEqual([5114]);
    expect(await group(5114, 'spin_off')).toContain(121);
  });

  it('Fate: boundaries make Fate/Zero and Unlimited Blade Works separate', async () => {
    expect(
      (await franchise(10087)).mainLine.map(({ anilistId }) => anilistId),
    ).toEqual([10087, 11741]);
    expect(
      (await franchise(20792)).mainLine.map(({ anilistId }) => anilistId),
    ).toEqual([19603, 20792]);
    expect(await labels(20792)).toEqual(['Season 1', 'Season 2']);
    expect(await group(10087, 'tv')).toEqual([356, 19603]);
  });

  it('Frieren: an unaired TV season is listed last, labelled from its romaji title', async () => {
    const frieren = (await franchise(154587)).mainLine;

    expect(frieren.map(({ label }) => label)).toEqual([
      'Season 1',
      'Season 2',
      'Season 3',
    ]);
    expect(frieren.at(-1)).toMatchObject({
      anilistId: 209939,
      status: 'NOT_YET_RELEASED',
      title: 'Sousou no Frieren 3rd Season',
    });
  });

  it('Gintama: numbered seasons, then arcs keep their titles', async () => {
    expect(await labels(918)).toEqual([
      'Season 1',
      'Season 2',
      'Season 2 Part 2',
      'Season 3',
      'Season 4',
      'Gintama.: Slip Arc',
      'Gintama.: Silver Soul Arc',
      'Gintama.: Silver Soul Arc - Second Half War',
    ]);
  });

  it('Monogatari: non-linear; two "Second Season" titles keep their titles; the ONA season counts', async () => {
    expect(await labels(5081)).toEqual([
      'Season 1',
      'Nisemonogatari',
      'Nekomonogatari Black',
      'Monogatari Series Second Season',
      'Hanamonogatari',
      'Tsukimonogatari',
      'Owarimonogatari',
      'Owarimonogatari Second Season',
      'MONOGATARI Series: OFF & MONSTER Season',
    ]);
    expect(await group(5081, 'other')).toEqual([195448]);
  });

  it('One Piece: one TV series; its MONSTERS ONA is Related by override', async () => {
    expect(await labels(21)).toEqual(['Season 1']);
    expect(await group(21, 'ona')).toContain(167404);
    expect(await labels(21, { overrides: new Map() })).toEqual([
      'Season 1',
      'Season 2',
    ]);
  });
});

describe('buildFranchise states and filters', () => {
  it('is walking while an entry of the franchise has no row, with what is known', async () => {
    const partial = new Map(NODES);
    partial.delete(99147);

    const aot = await franchise(16498, { nodes: partial });

    expect(aot.state).toBe('walking');
    expect(aot.mainLine.map(({ anilistId }) => anilistId)).toEqual([
      16498, 20958,
    ]);
  });

  it('is walking with nothing when the start has no row yet', async () => {
    expect(await franchise(16498, { nodes: new Map() })).toEqual({
      state: 'walking',
      mainLine: [],
      related: [],
    });
  });

  it('is truncated at the node cap', async () => {
    expect((await franchise(918, { nodeCap: 3 })).state).toBe('truncated');
  });

  it('keeps the first entries in traversal order at the node cap', async () => {
    expect(
      (await franchise(918, { nodeCap: 3 })).mainLine.map(
        ({ anilistId }) => anilistId,
      ),
    ).toEqual([918, 9969, 15417]);
  });

  it('walks on past an entry with no row when its level has others', async () => {
    const partial = new Map(NODES);
    partial.delete(20811);

    const aot = await franchise(16498, { nodes: partial });

    expect(aot.state).toBe('walking');
    expect(aot.mainLine).toHaveLength(8);
  });

  it('never shows a removed identity, in the main line or in Related', async () => {
    const aot = await franchise(16498, { removed: new Set([99147, 20811]) });

    expect(aot.mainLine.map(({ anilistId }) => anilistId)).not.toContain(99147);
    expect(
      aot.related.flatMap(({ entries }) =>
        entries.map(({ anilistId }) => anilistId),
      ),
    ).not.toContain(20811);
  });

  it('keeps a Related group under the cap whole, with its total', async () => {
    const special = (await franchise(21)).related.find(
      ({ group: name }) => name === 'special',
    );

    expect(special?.total).toBe(22);
    expect(special?.entries).toHaveLength(22);
  });
});

/** A synthetic TV entry; `chain` links entries in order with SEQUEL edges from entry 1. */
const tv = (
  anilistId: number,
  title: string,
  year: number | null,
  rest: Partial<RelationNode> = {},
): RelationNode => ({
  anilistId,
  mediaType: 'ANIME',
  format: 'TV',
  status: 'FINISHED',
  startDate: year === null ? null : { year, month: null, day: null },
  titleEnglish: title,
  titleRomaji: null,
  coverImageUrl: null,
  edges: [],
  ...rest,
});
const chain = (...entries: RelationNode[]): Map<number, RelationNode> =>
  new Map(
    entries.map((entry, index) => {
      const next = entries[index + 1];
      const sequel = next
        ? [{ relation: 'SEQUEL' as const, target: next }]
        : [];
      return [
        entry.anilistId,
        { ...entry, edges: [...sequel, ...entry.edges] },
      ];
    }),
  );
const synthetic = (
  nodes: Map<number, RelationNode>,
  overrides = new Map<number, FranchiseOverride>(),
) => franchise(1, { nodes, overrides });

describe('buildFranchise on synthetic franchises', () => {
  it('suffixes the year, else the AniList id, when clashing titles are equal too', async () => {
    const nodes = chain(
      tv(1, 'Show', 2019),
      tv(2, 'Show Season 2', 2020),
      tv(3, 'Show Season 2', null),
    );

    expect((await synthetic(nodes)).mainLine.map(({ label }) => label)).toEqual(
      ['Season 1', 'Show Season 2 (2020)', 'Show Season 2 (3)'],
    );
  });

  it('keeps an override label; the computed label equal to it gives way', async () => {
    const nodes = chain(tv(1, 'Show', 2019), tv(2, 'Show Season 2', 2020));
    const overrides = new Map([[1, { role: null, label: 'Season 2' }]]);

    expect(
      (await synthetic(nodes, overrides)).mainLine.map(({ label }) => label),
    ).toEqual(['Season 2', 'Show Season 2']);
  });

  it('numbers positions around an override label', async () => {
    const nodes = chain(tv(1, 'A', 2019), tv(2, 'B', 2020), tv(3, 'C', 2021));
    const overrides = new Map([[2, { role: null, label: 'Special Arc' }]]);

    expect(
      (await synthetic(nodes, overrides)).mainLine.map(({ label }) => label),
    ).toEqual(['Season 1', 'Special Arc', 'Season 2']);
  });

  it('falls back to the AniList id when title and year clash too', async () => {
    const nodes = chain(
      tv(1, 'Show', 2019),
      tv(2, 'Show Season 2', 2020),
      tv(3, 'Show Season 2', 2020),
    );

    expect((await synthetic(nodes)).mainLine.map(({ label }) => label)).toEqual(
      ['Season 1', 'Show Season 2 (2)', 'Show Season 2 (3)'],
    );
  });

  it('lists a cancelled TV entry in Related, not in the main line', async () => {
    const nodes = chain(
      tv(1, 'Show', 2019),
      tv(2, 'Show 2', null, { status: 'CANCELLED' }),
    );
    const view = await synthetic(nodes);

    expect(view.mainLine.map(({ anilistId }) => anilistId)).toEqual([1]);
    expect(view.related).toMatchObject([{ group: 'tv', total: 1 }]);
  });

  it('puts a target reached by a side story and a spin-off edge in spin_off', async () => {
    const movie = tv(9, 'Movie', 2021, { format: 'MOVIE' });
    const edges = (['SIDE_STORY', 'SPIN_OFF'] as const).map((relation) => ({
      relation,
      target: movie,
    }));

    expect(
      (await synthetic(chain(tv(1, 'Show', 2019, { edges })))).related,
    ).toEqual([expect.objectContaining({ group: 'spin_off', total: 1 })]);
  });

  it('slices a Related group over 50 entries to the 50 earliest, with the total', async () => {
    const edges = Array.from({ length: 51 }, (_, index) => ({
      relation: 'SIDE_STORY' as const,
      target: tv(100 + index, `Movie ${index}`, 2000 + index, {
        format: 'MOVIE',
      }),
    }));
    const [movies] = (await synthetic(chain(tv(1, 'Show', 1999, { edges }))))
      .related;

    expect(movies?.total).toBe(51);
    expect(movies?.entries).toHaveLength(50);
    expect(movies?.entries.at(-1)?.anilistId).toBe(149);
  });
});

describe('seasonLabelFromTitle', () => {
  it.each([
    ['Attack on Titan Season 2', 'Season 2'],
    ['Attack on Titan Season 3 Part 2', 'Season 3 Part 2'],
    ['Attack on Titan Final Season Part 2', 'Final Season Part 2'],
    ['Sousou no Frieren 3rd Season', 'Season 3'],
    ['Monogatari Series Second Season', 'Season 2'],
    ['Mushoku Tensei III Cour 2', null],
    ['MONOGATARI Series: OFF & MONSTER Season', null],
    ['Gintama.: Slip Arc', null],
    ['Attack on Titan', null],
  ])('%j -> %j', (title, label) => {
    expect(seasonLabelFromTitle(title)).toBe(label);
  });
});
